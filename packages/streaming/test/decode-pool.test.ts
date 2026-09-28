// 디코드 워커 풀: 동시성·대기열, 취소(대기 중/워커 안) → 워커 작업 중단, transfer 분리, 워커 사망 처리, 실제 스레드. see docs/06-world-streaming.md §9
import { type CellKey, createLogger, createWorkerSupervisor, packCellKey } from '@sanpo/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { DecodePool, DecodeRequest } from '../src/api.ts';
import { DEFAULT_STREAMING_CONFIG } from '../src/internal/config.ts';
import { createDecodeHost } from '../src/internal/decode-host.ts';
import { autoWorkerCount, createDecodePool } from '../src/internal/decode-pool.ts';
import type { FromDecodeWorker } from '../src/internal/protocol.ts';
import { WORLD_MINI_BUILD_ID, WORLD_MINI_CELLS, worldMiniCell, worldMiniIndex } from './helpers.ts';
import { createFakeWorker, createThreadWorker, type FakeWorker } from './support/workers.ts';

const log = createLogger({ level: 'error' });
const INDEX = worldMiniIndex();
const req = (ix: number, iz: number): DecodeRequest => {
  const key: CellKey = packCellKey(0, ix, iz);
  return { key, buildId: WORLD_MINI_BUILD_ID, hash32: INDEX.get(key)?.hash32 ?? 0 };
};

let pools: DecodePool[] = [];
afterEach(() => {
  for (const p of pools) p.dispose();
  pools = [];
});

function fakePool(workers: number, perWorker = 2) {
  const fakes: FakeWorker[] = [];
  const supervisor = createWorkerSupervisor({ log, options: { maxRestarts: 0 } });
  const pool = createDecodePool({
    supervisor,
    log,
    config: { ...DEFAULT_STREAMING_CONFIG.decode, workers, perWorker },
    createWorker: () => {
      const w = createFakeWorker();
      fakes.push(w);
      return w as unknown as Worker;
    },
  });
  pools.push(pool);
  return { pool, fakes };
}

describe('decode host (worker body)', () => {
  it('cancel aborts the running decode at the next stage boundary and never posts a result', async () => {
    const sent: FromDecodeWorker[] = [];
    let yields = 0;
    const host = createDecodeHost((m) => sent.push(m), {
      yieldFn: async () => {
        yields++;
        if (yields === 1) host.handle({ t: 'cancel', id: 7 }); // 첫 단계 경계에서 cancel 도착
      },
    });
    host.handle({ t: 'decode', id: 7, bytes: worldMiniCell(0, 0), req: req(0, 0), verifyHash: false });
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toEqual({ t: 'cancelled', id: 7 });
    expect(yields).toBe(1); // 더 이상 섹션·프리미티브를 진행하지 않음
    expect(host.active()).toBe(0);
  });

  it('a full decode passes several stage boundaries (so the cancel above really cut work short)', async () => {
    const sent: FromDecodeWorker[] = [];
    let yields = 0;
    const host = createDecodeHost((m) => sent.push(m), { yieldFn: async () => void yields++ });
    host.handle({ t: 'decode', id: 1, bytes: worldMiniCell(0, 0), req: req(0, 0), verifyHash: true });
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]?.t).toBe('decoded');
    expect(yields).toBeGreaterThanOrEqual(5); // 섹션 3개(terrain·buildings·height) + 프리미티브 2개
  });
});

describe('decode pool (in-process fake workers)', () => {
  it('decodes all world-mini cells, transfers the input bytes, respects workers × perWorker', async () => {
    const { pool, fakes } = fakePool(2, 1);
    const inputs = WORLD_MINI_CELLS.map(([ix, iz]) => worldMiniCell(ix, iz));
    const all = Promise.all(WORLD_MINI_CELLS.map(([ix, iz], i) => pool.decode(inputs[i] as ArrayBuffer, req(ix, iz))));
    expect(pool.stats()).toEqual({ workers: 2, running: 2, inFlight: 2, queued: 2 });
    for (const b of inputs.slice(0, 2)) expect(b.byteLength).toBe(0); // 워커로 transfer(분리)
    const results = await all;
    expect(results.map((r) => r.ok && r.value.payload.id)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(fakes.map((w) => w.received.length)).toEqual([2, 2]);
    expect(pool.stats()).toMatchObject({ inFlight: 0, queued: 0 });
  });

  it('cancelling a queued job removes it without ever posting it', async () => {
    const { pool, fakes } = fakePool(1, 1);
    const first = pool.decode(worldMiniCell(0, 0), req(0, 0));
    const ac = new AbortController();
    const second = pool.decode(worldMiniCell(-1, 0), req(-1, 0), ac.signal);
    ac.abort();
    expect(await second).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect((await first).ok).toBe(true);
    expect(fakes[0]?.received).toEqual(['decode']);
  });

  it('cancelling an in-flight job posts cancel, resolves aborted at once and the worker stops without a result', async () => {
    const { pool, fakes } = fakePool(1, 2);
    const ac = new AbortController();
    const p = pool.decode(worldMiniCell(0, 0), req(0, 0), ac.signal);
    await new Promise((r) => setTimeout(r, 0)); // 워커가 decode를 받아 시작
    ac.abort();
    expect(await p).toMatchObject({ ok: false, error: { code: 'aborted' } });
    const w = fakes[0] as FakeWorker;
    expect(w.received).toEqual(['decode', 'cancel']);
    await expect.poll(() => w.sent).toEqual(['cancelled']);
    // 풀은 다음 작업을 정상 처리
    expect((await pool.decode(worldMiniCell(-1, 0), req(-1, 0))).ok).toBe(true);
  });

  it('fails in-flight jobs when their worker dies (bytes are gone — the scheduler refetches)', async () => {
    const { pool, fakes } = fakePool(1, 2);
    const p = pool.decode(worldMiniCell(0, 0), req(0, 0));
    fakes[0]?.crash();
    const q = pool.decode(worldMiniCell(-1, 0), req(-1, 0));
    expect(await p).toMatchObject({ ok: false, error: { code: 'worker' } });
    expect(await q).toMatchObject({ ok: false, error: { code: 'worker' } });
  });

  it('auto worker count = cores − 2 within 1…4', () => {
    expect([1, 2, 3, 4, 8, 32, undefined].map(autoWorkerCount)).toEqual([1, 1, 1, 2, 4, 4, 2]);
  });
});

describe('decode pool (real worker_threads running decode.worker.ts)', () => {
  const threads: ReturnType<typeof createThreadWorker>[] = [];
  function threadPool() {
    const pool = createDecodePool({
      supervisor: createWorkerSupervisor({ log }),
      log,
      config: { ...DEFAULT_STREAMING_CONFIG.decode, workers: 1 },
      createWorker: () => {
        const w = createThreadWorker();
        threads.push(w);
        return w as unknown as Worker;
      },
    });
    pools.push(pool);
    return pool;
  }
  afterEach(() => {
    threads.length = 0;
  });

  it('decodes on another thread with hash check and reports worker time', async () => {
    const pool = threadPool();
    for (const [ix, iz] of WORLD_MINI_CELLS) {
      const r = await pool.decode(worldMiniCell(ix, iz), req(ix, iz));
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.payload.id).toBe(`L0_${ix}_${iz}`);
      expect(r.value.workerMs).toBeGreaterThan(0);
    }
  }, 20_000);

  it('cancel reaches the thread: the aborted cell never produces a payload and the next one does', async () => {
    const pool = threadPool();
    const ac = new AbortController();
    const cancelled = pool.decode(worldMiniCell(-1, -1), req(-1, -1), ac.signal);
    queueMicrotask(() => ac.abort());
    expect(await cancelled).toMatchObject({ ok: false, error: { code: 'aborted' } });
    const next = await pool.decode(worldMiniCell(0, 0), req(0, 0));
    expect(next.ok && next.value.payload.id).toBe('L0_0_0');
    // 스레드 쪽: 취소된 작업은 'cancelled'로 끝났고(디코드 중단) 두 번째만 'decoded'.
    expect(threads[0]?.sent).toEqual(['cancelled', 'decoded']);
  }, 20_000);
});
