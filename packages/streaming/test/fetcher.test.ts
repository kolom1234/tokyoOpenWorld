// 셀 fetch: 재시도(지수 백오프 3회)·재시도 안 하는 상태·취소·Cache Storage(buildId별)·오래된 캐시 삭제. see docs/06-world-streaming.md §7, ADR-0022
import { createLogger, packCellKey } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import type { CellFetcherDeps } from '../src/api.ts';
import { DEFAULT_STREAMING_CONFIG } from '../src/internal/config.ts';
import { cacheName, cellUrl, createFetcher, purgeStaleCaches } from '../src/internal/fetcher.ts';
import { createFakeCaches, scriptedFetch } from './support/fakes.ts';

const log = createLogger({ level: 'error' });
const KEY = packCellKey(0, -1, 0);
const BODY = new Uint8Array(1000).fill(7).buffer;
const BASE = '/fixtures/world-mini';

function setup(steps: Parameters<typeof scriptedFetch>[0], extra: Partial<CellFetcherDeps> = {}) {
  const fetch = scriptedFetch(steps, BODY);
  const sleeps: number[] = [];
  const caches = createFakeCaches();
  const fetcher = createFetcher({
    baseUrl: BASE,
    buildId: 'b1',
    log,
    config: DEFAULT_STREAMING_CONFIG.fetch,
    fetch,
    caches,
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      if (signal?.aborted) throw new Error('aborted');
    },
    ...extra,
  });
  return { fetcher, fetch, sleeps, caches };
}

describe('fetcher', () => {
  it('builds cell URLs as <base>/L<level>/<ix>/<iz>.tkc', () => {
    expect(cellUrl(BASE, KEY)).toBe('/fixtures/world-mini/L0/-1/0.tkc');
    expect(cellUrl('/world/x', packCellKey(2, 3, -4))).toBe('/world/x/L2/3/-4.tkc');
  });

  it('retries network errors and 5xx with exponential backoff (250, 500, 1000 ms) then succeeds', async () => {
    const { fetcher, fetch, sleeps } = setup(['throw', 503, 500, 'body']);
    const r = await fetcher.fetchCell(KEY, 1000);
    expect(r.ok && r.value.bytes.byteLength).toBe(1000);
    expect(fetch.calls).toHaveLength(4);
    expect(sleeps).toEqual([250, 500, 1000]);
  });

  it('gives up after 3 retries (4 attempts)', async () => {
    const { fetcher, fetch, sleeps } = setup([503]);
    expect(await fetcher.fetchCell(KEY, 1000)).toEqual({
      ok: false,
      error: { code: 'http', status: 503, message: `${BASE}/L0/-1/0.tkc: HTTP 503`, attempts: 4 },
    });
    expect(fetch.calls).toHaveLength(4);
    expect(sleeps).toEqual([250, 500, 1000]);
  });

  it('does not retry 404 and retries a size mismatch', async () => {
    const a = setup([404]);
    expect(await a.fetcher.fetchCell(KEY, 1000)).toMatchObject({ ok: false, error: { code: 'http', status: 404 } });
    expect(a.fetch.calls).toHaveLength(1);
    const b = setup([new ArrayBuffer(10), 'body']);
    expect((await b.fetcher.fetchCell(KEY, 1000)).ok).toBe(true);
    expect(b.fetch.calls).toHaveLength(2);
  });

  it('abort before, during the request and during backoff → aborted, no further attempts', async () => {
    const pre = new AbortController();
    pre.abort();
    const a = setup(['body']);
    expect(await a.fetcher.fetchCell(KEY, 1000, pre.signal)).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect(a.fetch.calls).toHaveLength(0);

    const ac = new AbortController();
    const b = setup([503], {
      sleep: async (_ms, signal) => {
        ac.abort();
        if (signal?.aborted) throw new Error('aborted');
      },
    });
    expect(await b.fetcher.fetchCell(KEY, 1000, ac.signal)).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect(b.fetch.calls).toHaveLength(1);

    // 실제 fetch처럼 요청 중 abort되면 reject
    const mid = new AbortController();
    const c = setup([], {
      fetch: (_u, init) =>
        new Promise((_res, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))),
        ),
    });
    const p = c.fetcher.fetchCell(KEY, 1000, mid.signal);
    setTimeout(() => mid.abort(), 5);
    expect(await p).toMatchObject({ ok: false, error: { code: 'aborted', attempts: 1 } });
  });

  it('stores into sanpo-world-<buildId>, then serves from cache without network', async () => {
    const { fetcher, fetch, caches } = setup(['body']);
    const first = await fetcher.fetchCell(KEY, 1000);
    expect(first.ok && first.value.fromCache).toBe(false);
    await expect.poll(() => caches.stores.get(cacheName('b1'))?.size).toBe(1);
    const second = await fetcher.fetchCell(KEY, 1000);
    expect(second.ok && second.value.fromCache).toBe(true);
    expect(fetch.calls).toHaveLength(1);
    await fetcher.invalidate(KEY);
    expect(caches.stores.get(cacheName('b1'))?.size).toBe(0);
  });

  it('drops a cached entry whose size no longer matches cells.idx and refetches', async () => {
    const { fetcher, fetch, caches } = setup(['body']);
    (await caches.open(cacheName('b1'))).put(cellUrl(BASE, KEY), new Response(new ArrayBuffer(3)));
    const r = await fetcher.fetchCell(KEY, 1000);
    expect(r.ok && r.value.fromCache).toBe(false);
    expect(fetch.calls).toHaveLength(1);
  });

  it('works without Cache Storage (config off or API missing)', async () => {
    const off = setup(['body'], { config: { ...DEFAULT_STREAMING_CONFIG.fetch, cacheStorage: false } });
    expect((await off.fetcher.fetchCell(KEY, 1000)).ok).toBe(true);
    expect(off.caches.stores.size).toBe(0);
    const none = setup(['body'], { caches: null });
    expect((await none.fetcher.fetchCell(KEY, 1000)).ok).toBe(true);
  });

  it('purgeStaleCaches deletes other builds only', async () => {
    const caches = createFakeCaches();
    for (const n of ['sanpo-world-old', 'sanpo-world-b1', 'other-app']) await caches.open(n);
    expect(await purgeStaleCaches(caches, 'b1')).toEqual(['sanpo-world-old']);
    expect(await caches.keys()).toEqual(['sanpo-world-b1', 'other-app']);
  });
});
