// 셀 차선(lanes.bin, 05 §7) 지연 적재·캐시(최근 16셀): freecam G 차도 판정(landing.ts)·차 부르기 연석 자리(vehicles/curb-spot.ts)가 공유.
import type { CellKey } from '@sanpo/core';
import { type LaneGraphChunk, parseLanes } from '@sanpo/tile-format';

const CACHE_CELLS = 16;

export function laneChunks(
  request: (key: CellKey) => Promise<ArrayBuffer | undefined>,
): (key: CellKey) => Promise<LaneGraphChunk | null> {
  const cache = new Map<CellKey, Promise<LaneGraphChunk | null>>();
  return (key) => {
    const hit = cache.get(key);
    if (hit) return hit;
    const p = request(key)
      .then((b) => {
        if (!b) return null;
        const r = parseLanes(new Uint8Array(b));
        return r.ok ? r.value : null;
      })
      .catch(() => null);
    cache.set(key, p);
    if (cache.size > CACHE_CELLS) cache.delete(cache.keys().next().value as CellKey);
    return p;
  };
}
