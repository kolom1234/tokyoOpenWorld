// Cache Storage 계층(06 §7): `sanpo-world-<buildId>`에서 셀 읽기(크기 검사)·쓰기(`Response.clone()`)·삭제 + 1.5 GB 상한 LRU(ADR-0023).
// 전부 비동기·실패는 경고 후 무시(캐시는 최적화일 뿐 — 다음 요청은 네트워크).
import type { Logger } from '@sanpo/core';
import type { CacheLike, CacheStorageLike } from '../api.ts';
import { createCacheLru } from './cache-lru.ts';

/** 부팅 시 기존 캐시 항목 크기를 모를 때(Content-Length 없음) 가정값. */
const SEED_FALLBACK_BYTES = 1 << 20;

export interface CellCache {
  /** 적중이고 크기가 맞으면 바이트(→ 최근 사용). 크기가 다르면 항목 삭제 후 undefined. */
  get(url: string, expected: number): Promise<ArrayBuffer | undefined>;
  /** 네트워크 응답 사본 저장 → 상한 초과분(오래 안 쓴 것) 삭제. */
  put(url: string, copy: Response, bytes: number): Promise<void>;
  delete(url: string): Promise<void>;
  /** 추적 중인 바이트. */
  bytes(): number;
}

export interface CellCacheDeps {
  storage: CacheStorageLike;
  name: string;
  maxBytes: number;
  log: Logger;
}

/** 기존 캐시 항목(저장 순)과 크기(Content-Length, 없으면 가정값). */
async function existingEntries(cache: CacheLike): Promise<[string, number][]> {
  const keys = (await cache.keys?.()) ?? [];
  const out: [string, number][] = [];
  for (const k of keys) {
    const url = typeof k === 'string' ? k : k.url;
    const len = Number((await cache.match(url))?.headers.get('content-length'));
    out.push([url, Number.isFinite(len) && len > 0 ? len : SEED_FALLBACK_BYTES]);
  }
  return out;
}

export function createCellCache(deps: CellCacheDeps): CellCache {
  const { log } = deps;
  const lru = createCacheLru(deps.maxBytes);
  let cacheP: Promise<CacheLike | undefined> | undefined;
  const dropAll = (cache: CacheLike, urls: readonly string[]): void => {
    for (const u of urls) void cache.delete(u).catch(() => false);
  };
  const open = (): Promise<CacheLike | undefined> => {
    cacheP ??= deps.storage.open(deps.name).then(
      (c) => {
        // 기존 항목 크기 파악은 백그라운드(첫 fetch를 막지 않음).
        void existingEntries(c)
          .then((e) => dropAll(c, lru.seed(e)))
          .catch((e: unknown) => log.debug('cache seed skipped', e));
        return c;
      },
      (e: unknown) => {
        log.warn('Cache Storage unavailable', e);
        return undefined;
      },
    );
    return cacheP;
  };
  return {
    async get(url, expected) {
      const cache = await open();
      const hit = await cache?.match(url).catch(() => undefined);
      if (!cache || !hit) return undefined;
      const bytes = await hit.arrayBuffer().catch(() => undefined);
      if (bytes?.byteLength === expected) {
        dropAll(cache, lru.touch(url, expected));
        return bytes;
      }
      lru.remove(url);
      await cache.delete(url).catch(() => false); // 손상·옛 항목 → 네트워크로
      return undefined;
    },
    async put(url, copy, bytes) {
      const cache = await open();
      if (!cache) return void (await copy.body?.cancel());
      // 쿼터 초과 등은 경고만(다음 방문 때 네트워크).
      const stored = await cache.put(url, copy).then(
        () => true,
        (e: unknown) => {
          log.warn('cache put failed', url, e);
          return false;
        },
      );
      if (stored) dropAll(cache, lru.touch(url, bytes));
    },
    async delete(url) {
      lru.remove(url);
      const cache = await open();
      await cache?.delete(url).catch(() => false);
    },
    bytes: () => lru.bytes,
  };
}
