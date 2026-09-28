// 셀 fetch: Cache Storage(`sanpo-world-<buildId>`) 조회 → 네트워크(AbortController, 지수 백오프 재시도) → 캐시 저장(상한 LRU).
// 메인 스레드에서 돌지만 전부 비동기(파싱 없음). 바이트는 그대로 디코드 워커로 transfer. see docs/06-world-streaming.md §2, §7, ADR-0022·0023
import { type CellKey, err, ok, type Result, unpackCellKey } from '@sanpo/core';
import type { CacheStorageLike, CellFetchError, CellFetcherDeps, CellFetchResult, Fetcher, FetchLike } from '../api.ts';
import { type CellCache, createCellCache } from './cell-cache.ts';

/** Cache Storage 이름 접두사(06 §7). 부팅 시 다른 buildId 캐시는 purgeStaleCaches로 삭제. */
export const CACHE_PREFIX = 'sanpo-world-';

/** 성공 시 캐시 저장용 응답 사본(`Response.clone()` — 본문 tee, 메인 JS 복사 없음). */
type Attempt = Result<CellFetchResult & { cacheCopy: Response }, CellFetchError & { retry: boolean }>;

export function cacheName(buildId: string): string {
  return `${CACHE_PREFIX}${buildId}`;
}

/** 셀 URL: `<baseUrl>/L<level>/<ix>/<iz>.tkc`(05 §1). */
export function cellUrl(baseUrl: string, key: CellKey): string {
  const { level, ix, iz } = unpackCellKey(key);
  return `${baseUrl}/L${level}/${ix}/${iz}.tkc`;
}

/** 재시도할 HTTP 상태: 408·429·5xx. 404 등 나머지 4xx는 즉시 실패. */
export function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** 취소 가능한 대기. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const aborted = (attempts: number): CellFetchError => ({ code: 'aborted', message: 'cancelled', attempts });

function defaultCaches(): CacheStorageLike | null {
  const c = (globalThis as { caches?: CacheStorageLike }).caches;
  return c ?? null;
}

/** 현재 buildId가 아닌 `sanpo-world-*` 캐시 삭제. 삭제한 이름 목록. */
export async function purgeStaleCaches(caches: CacheStorageLike, buildId: string): Promise<string[]> {
  const keep = cacheName(buildId);
  const stale = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX) && n !== keep);
  await Promise.all(stale.map((n) => caches.delete(n)));
  return stale;
}

async function attempt(f: FetchLike, url: string, expected: number, n: number, signal?: AbortSignal): Promise<Attempt> {
  let res: Response;
  try {
    res = await f(url, signal ? { signal } : {});
  } catch (e) {
    if (signal?.aborted) return err({ ...aborted(n), retry: false });
    return err({ code: 'network', message: e instanceof Error ? e.message : String(e), attempts: n, retry: true });
  }
  if (res.status !== 200) {
    const retry = retryableStatus(res.status);
    return err({ code: 'http', status: res.status, message: `${url}: HTTP ${res.status}`, attempts: n, retry });
  }
  const cacheCopy = res.clone();
  try {
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength !== expected) {
      void cacheCopy.body?.cancel();
      return err({ code: 'size', message: `${url}: ${bytes.byteLength} B ≠ ${expected}`, attempts: n, retry: true });
    }
    return ok({ bytes, fromCache: false, cacheCopy });
  } catch (e) {
    void cacheCopy.body?.cancel();
    if (signal?.aborted) return err({ ...aborted(n), retry: false });
    return err({ code: 'network', message: e instanceof Error ? e.message : String(e), attempts: n, retry: true });
  }
}

export function createFetcher(deps: CellFetcherDeps): Fetcher {
  const log = deps.log.child('fetch');
  const fetchFn: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init));
  const sleep = deps.sleep ?? abortableSleep;
  const storage = deps.config.cacheStorage ? (deps.caches === undefined ? defaultCaches() : deps.caches) : null;
  const cache: CellCache | null = storage
    ? createCellCache({ storage, name: cacheName(deps.buildId), maxBytes: deps.config.cacheMaxBytes, log })
    : null;

  async function network(url: string, expected: number, signal?: AbortSignal): Promise<Attempt> {
    for (let n = 1; ; n++) {
      const r = await attempt(fetchFn, url, expected, n, signal);
      if (r.ok) return r;
      if (!r.error.retry || n > deps.config.retries) return r;
      log.debug(`retry ${n}/${deps.config.retries}`, r.error.message);
      try {
        await sleep(deps.config.backoffMs * 2 ** (n - 1), signal);
      } catch {
        return err({ ...aborted(n), retry: false });
      }
    }
  }

  return {
    async fetchCell(key, expectedBytes, signal) {
      if (signal?.aborted) return err(aborted(0));
      const url = cellUrl(deps.baseUrl, key);
      const cached = await cache?.get(url, expectedBytes);
      if (signal?.aborted) return err(aborted(0));
      if (cached) return ok({ bytes: cached, fromCache: true });
      const r = await network(url, expectedBytes, signal);
      if (!r.ok) {
        const { retry: _retry, ...e } = r.error;
        return err(e);
      }
      if (cache) void cache.put(url, r.value.cacheCopy, expectedBytes);
      else void r.value.cacheCopy.body?.cancel();
      return ok({ bytes: r.value.bytes, fromCache: false });
    },
    invalidate: async (key) => cache?.delete(cellUrl(deps.baseUrl, key)),
    cacheBytes: () => cache?.bytes() ?? 0,
  };
}
