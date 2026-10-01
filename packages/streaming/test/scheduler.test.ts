// 로드 큐: 점수 순서·동시 fetch 한도·단계별 취소·손상 파일 캐시 무효화, 그리고 HTTP(/fixtures/world-mini) → 캐시 → 실제 워커 스레드 전 경로.
// see docs/06-world-streaming.md §2, §4, §7
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { type CellKey, cellIdString, createLogger, createWorkerSupervisor, ok, packCellKey } from '@sanpo/core';
import { afterAll, describe, expect, it } from 'vitest';
import type { CellFetchResult, DecodePool, Fetcher } from '../src/api.ts';
import { DEFAULT_STREAMING_CONFIG } from '../src/internal/config.ts';
import { createDecodePool } from '../src/internal/decode-pool.ts';
import { createFetcher } from '../src/internal/fetcher.ts';
import { createLoadScheduler, type LoadResult, type LoadStage } from '../src/internal/scheduler.ts';
import {
  DECODE_SNAPSHOT,
  summarizeMeshes,
  WORLD_MINI,
  WORLD_MINI_BUILD_ID,
  worldMiniCell,
  worldMiniIndex,
} from './helpers.ts';
import { createFakeCaches, serveWorldMini } from './support/fakes.ts';
import { createFakeWorker, createThreadWorker } from './support/workers.ts';

const log = createLogger({ level: 'error' });
const INDEX = worldMiniIndex();
const K = (ix: number, iz: number): CellKey => packCellKey(0, ix, iz);
const FETCH = { ...DEFAULT_STREAMING_CONFIG.fetch, maxConcurrent: 2 };

/** 수동으로 풀어 주는 fetcher(fixture 바이트). */
function gatedFetcher() {
  const pending = new Map<CellKey, () => void>();
  const order: string[] = [];
  const invalidated: CellKey[] = [];
  const fetcher: Fetcher = {
    fetchCell(key, _n, signal) {
      order.push(cellIdString(key));
      return new Promise((resolve) => {
        const [, ix, iz] = cellIdString(key).split('_').map(Number);
        pending.set(key, () =>
          resolve(ok<CellFetchResult>({ bytes: worldMiniCell(ix ?? 0, iz ?? 0), fromCache: false })),
        );
        signal?.addEventListener('abort', () =>
          resolve({ ok: false, error: { code: 'aborted', message: 'x', attempts: 1 } }),
        );
      });
    },
    invalidate: async (key) => void invalidated.push(key),
  };
  return { fetcher, pending, order, invalidated };
}

function fakePool(): DecodePool {
  return createDecodePool({
    supervisor: createWorkerSupervisor({ log }),
    log,
    config: { ...DEFAULT_STREAMING_CONFIG.decode, workers: 1 },
    createWorker: () => createFakeWorker() as unknown as Worker,
  });
}

/** 취소될 때까지 끝나지 않는 풀(스케줄러가 디코드 단계에 신호를 넘기는지 확인용). */
function gatedPool(): DecodePool & { aborted: CellKey[] } {
  const aborted: CellKey[] = [];
  return {
    aborted,
    decode: (_b, req, signal) =>
      new Promise((resolve) =>
        signal?.addEventListener('abort', () => {
          aborted.push(req.key);
          resolve({ ok: false, error: { code: 'aborted', message: 'x' } });
        }),
      ),
    stats: () => ({ workers: 1, running: 1, inFlight: 0, queued: 0 }),
    dispose: () => undefined,
  };
}

function scheduler(fetcher: Fetcher, pool: DecodePool, buildId = WORLD_MINI_BUILD_ID) {
  const done = new Map<CellKey, LoadResult>();
  const stages: string[] = [];
  const s = createLoadScheduler({
    index: INDEX,
    fetcher,
    pool,
    buildId,
    config: FETCH,
    decodeCapacity: 2,
    verifyHash: true,
    onStage: (k: CellKey, st: LoadStage) => stages.push(`${cellIdString(k)}:${st}`),
    onDone: (k, r) => done.set(k, r),
  });
  return { s, done, stages };
}

describe('load scheduler', () => {
  it('fetches lowest score first, at most maxConcurrent at a time; unknown cells are refused', async () => {
    const g = gatedFetcher();
    const { s, done } = scheduler(g.fetcher, fakePool());
    expect(s.request(K(5, 5), 0)).toBe(false);
    s.request(K(0, 0), 3);
    s.request(K(-1, 0), 1); // 빈 슬롯 2개 → 둘 다 즉시 fetch
    s.request(K(0, -1), 2);
    s.request(K(-1, -1), 0.5);
    expect(g.order).toEqual(['L0_0_0', 'L0_-1_0']);
    expect(s.stats()).toEqual({ queued: 2, fetching: 2, decoding: 0 });
    s.request(K(0, -1), 0.1); // 대기 중 점수 갱신 → 0.5보다 먼저
    g.pending.get(K(0, 0))?.();
    await expect.poll(() => g.order.length).toBe(3);
    expect(g.order[2]).toBe('L0_0_-1');
    g.pending.get(K(-1, 0))?.();
    await expect.poll(() => g.order.length).toBe(4);
    expect(g.order[3]).toBe('L0_-1_-1');
    for (const k of [K(0, -1), K(-1, -1)]) g.pending.get(k)?.();
    await expect.poll(() => done.size, { timeout: 10_000 }).toBe(4); // 전체 병렬 실행 CPU 경합(해시 검증 디코드)
    expect([...done.values()].every((r) => r.ok)).toBe(true);
  });

  it('cancel works while queued, fetching and decoding; cancelled cells never report', async () => {
    const g = gatedFetcher();
    const pool = gatedPool();
    const { s, done, stages } = scheduler(g.fetcher, pool);
    s.request(K(0, 0), 0);
    s.request(K(-1, 0), 1);
    s.request(K(0, -1), 2); // 대기
    expect(s.cancel(K(0, -1))).toBe(true);
    expect(s.cancel(K(-1, 0))).toBe(true); // fetch 중
    g.pending.get(K(0, 0))?.();
    await expect.poll(() => s.stageOf(K(0, 0))).toBe('decoding');
    expect(s.cancel(K(0, 0))).toBe(true); // 디코드 중 → 풀에 넘긴 신호가 abort
    expect(pool.aborted).toEqual([K(0, 0)]);
    await new Promise((r) => setTimeout(r, 20));
    expect(done.size).toBe(0);
    expect(s.stats()).toEqual({ queued: 0, fetching: 0, decoding: 0 });
    expect(stages).toContain('L0_0_0:decoding');
    expect(s.cancel(K(0, 0))).toBe(false);
  });

  it('a decode mismatch invalidates the cached copy', async () => {
    const g = gatedFetcher();
    const { s, done } = scheduler(g.fetcher, fakePool(), 'another-build');
    s.request(K(0, 0), 0);
    g.pending.get(K(0, 0))?.();
    await expect.poll(() => done.size).toBe(1);
    expect(done.get(K(0, 0))).toMatchObject({ ok: false, error: { stage: 'decode', error: { code: 'mismatch' } } });
    expect(g.invalidated).toEqual([K(0, 0)]);
  });
});

describe('end to end: HTTP /fixtures/world-mini → Cache Storage → worker thread', () => {
  let server: Server | undefined;
  afterAll(() => server?.close());

  it('loads all 4 cells, matches the pipeline snapshot, and the second pass comes from cache', async () => {
    const http = await serveWorldMini(WORLD_MINI);
    server = http.server;
    const caches = createFakeCaches();
    const fetcher = createFetcher({
      baseUrl: http.baseUrl,
      buildId: WORLD_MINI_BUILD_ID,
      log,
      config: DEFAULT_STREAMING_CONFIG.fetch,
      caches,
    });
    const pool = createDecodePool({
      supervisor: createWorkerSupervisor({ log }),
      log,
      config: { ...DEFAULT_STREAMING_CONFIG.decode, workers: 2 },
      createWorker: () => createThreadWorker() as unknown as Worker,
    });
    const run = async () => {
      const { s, done } = scheduler(fetcher, pool);
      for (const key of INDEX.keysAt(0)) s.request(key, 0);
      await expect.poll(() => done.size, { timeout: 15_000 }).toBe(4);
      return done;
    };
    const first = await run();
    const snapshot = JSON.parse(readFileSync(DECODE_SNAPSHOT, 'utf8')) as Record<string, unknown>;
    for (const [key, r] of first) {
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      expect(summarizeMeshes(r.value.payload)).toEqual(snapshot[cellIdString(key)]);
      expect(r.value.fromCache).toBe(false);
    }
    expect(http.hits.filter((h) => h.endsWith('.tkc'))).toHaveLength(4);
    await expect.poll(() => caches.stores.get(`sanpo-world-${WORLD_MINI_BUILD_ID}`)?.size).toBe(4);
    const second = await run();
    expect([...second.values()].every((r) => r.ok && r.value.fromCache)).toBe(true);
    expect(http.hits.filter((h) => h.endsWith('.tkc'))).toHaveLength(4); // 네트워크 추가 요청 없음
    pool.dispose();
  }, 30_000);
});
