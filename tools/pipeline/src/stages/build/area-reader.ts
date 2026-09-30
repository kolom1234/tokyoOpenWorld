// 영역 빌드 입력 읽기: 정규화 층 파일(셀별 ndjson.gz) + 8-이웃 캐시(도로 조각·건물 발자국). assemble.ts buildArea가 쓴다.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, cellIdString, packCellKey, unpackCellKey } from '@sanpo/core';
import { readNdjsonGz } from '../../lib/ndjson-gz.ts';
import type { BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { type FootprintSource, footprintSources } from '../derive/footprints.ts';

export function readLayer<T>(normalizedDir: string, layer: string, key: CellKey): T[] {
  const f = join(normalizedDir, layer, `${cellIdString(key)}.ndjson.gz`);
  return existsSync(f) ? readNdjsonGz<T>(f) : [];
}

/** 이웃 셀 파일 캐시(도로 조각·건물 발자국) — 셀마다 8-이웃을 다시 읽지 않게. 행 순서 처리라 최근 3행 남짓이면 충분. */
const AROUND_CACHE = 64;

export function aroundReader(normalizedDir: string) {
  const roads = new Map<CellKey, RoadRecord[]>();
  const prints = new Map<CellKey, FootprintSource[]>();
  const get = <T>(m: Map<CellKey, T>, k: CellKey, load: () => T): T => {
    let v = m.get(k);
    if (v === undefined) {
      v = load();
      m.set(k, v);
      if (m.size > AROUND_CACHE) m.delete(m.keys().next().value as CellKey);
    }
    return v;
  };
  const around = <T>(key: CellKey, one: (k: CellKey) => T[]): T[] => {
    const { level, ix, iz } = unpackCellKey(key);
    const out: T[] = [];
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) out.push(...one(packCellKey(level, ix + dx, iz + dz)));
    return out;
  };
  const roadsOf = (k: CellKey) => get(roads, k, () => readLayer<RoadRecord>(normalizedDir, 'roads', k));
  const printsOf = (k: CellKey) =>
    get(prints, k, () => footprintSources(readLayer<BuildingRecord>(normalizedDir, 'buildings', k)));
  return {
    roadsOf,
    roadsAround: (k: CellKey) => around(k, roadsOf),
    footprintsAround: (k: CellKey) => around(k, printsOf),
  };
}
