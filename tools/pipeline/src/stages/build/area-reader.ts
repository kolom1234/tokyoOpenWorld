// 영역 빌드 입력 읽기: 정규화 층 파일(셀별 ndjson.gz) + 8-이웃 캐시(도로 조각·건물 발자국·교량·계단·道路標示). assemble.ts buildArea가 쓴다.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, cellIdString, type Logger, packCellKey, unpackCellKey } from '@sanpo/core';
import type { RailNetwork } from '@sanpo/tile-format';
import { readNdjsonGz } from '../../lib/ndjson-gz.ts';
import type { MarkingRecord } from '../../readers/plateau/frn-markings.ts';
import type { BridgeRecord, BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { type FootprintSource, footprintSources } from '../derive/footprints.ts';
import { isVehicleRoad } from '../derive/markings/stopline.ts';
import type { OsmRecord } from '../normalize-osm.ts';
import { RAIL_FILE } from '../rail/normalize.ts';
import { buildTimetables } from '../timetables/index.ts';
import { buildRailGlobal } from './rail-global.ts';

export function readLayer<T>(normalizedDir: string, layer: string, key: CellKey): T[] {
  const f = join(normalizedDir, layer, `${cellIdString(key)}.ndjson.gz`);
  return existsSync(f) ? readNdjsonGz<T>(f) : [];
}

/** 셀 경계를 걸친 OSM 레코드(이웃 셀 파일에 같은 id로 또 있음) 중복 제거. */
function dedupe(records: OsmRecord[]): OsmRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

/** 이웃 셀 파일 캐시(도로 조각·건물 발자국) — 셀마다 8-이웃을 다시 읽지 않게. 행 순서 처리라 최근 3행 남짓이면 충분. */
const AROUND_CACHE = 64;

export function aroundReader(normalizedDir: string) {
  const roads = new Map<CellKey, RoadRecord[]>();
  const prints = new Map<CellKey, FootprintSource[]>();
  const bridges = new Map<CellKey, BridgeRecord[]>();
  const steps = new Map<CellKey, OsmRecord[]>();
  const marks = new Map<CellKey, MarkingRecord[]>();
  const vroads = new Map<CellKey, OsmRecord[]>();
  const sigs = new Map<CellKey, OsmRecord[]>();
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
  const bridgesOf = (k: CellKey) => get(bridges, k, () => readLayer<BridgeRecord>(normalizedDir, 'bridges', k));
  const stepsOf = (k: CellKey) =>
    get(steps, k, () => readLayer<OsmRecord>(normalizedDir, 'osm', k).filter((r) => r.tags.highway === 'steps'));
  const marksOf = (k: CellKey) => get(marks, k, () => readLayer<MarkingRecord>(normalizedDir, 'markings', k));
  const vroadsOf = (k: CellKey) =>
    get(vroads, k, () => readLayer<OsmRecord>(normalizedDir, 'osm', k).filter(isVehicleRoad));
  const sigsOf = (k: CellKey) =>
    get(sigs, k, () =>
      readLayer<OsmRecord>(normalizedDir, 'osm', k).filter(
        (r) => r.tags.highway === 'traffic_signals' || r.tags.crossing === 'traffic_signals',
      ),
    );
  return {
    bridgesOf,
    /** 셀 + 8-이웃 신호 점·신호 횡단 선(id 중복 제거) — 교차점 신호 판정(M06-T05). */
    signalsAround: (k: CellKey) => dedupe(around(k, sigsOf)),
    /** 셀 + 8-이웃 PLATEAU 道路標示(M06 사전 2 — 셀 경계를 걸친 横断歩道). */
    markingsAround: (k: CellKey) => around(k, marksOf),
    /** 이웃 포함 OSM 계단 선(교량 계단 통로 — M05-T08). 셀 경계를 걸친 선은 중복될 수 있다. */
    stepsAround: (k: CellKey) => around(k, stepsOf),
    /** 셀 + 8-이웃 OSM 차도 선(id 중복 제거) — 교차로 도로 방향(신호 그룹, M06-T02)이 셀마다 같게. */
    vehicleRoadsAround: (k: CellKey) => dedupe(around(k, vroadsOf)),
    bridgesAround: (k: CellKey) => around(k, bridgesOf),
    roadsOf,
    roadsAround: (k: CellKey) => around(k, roadsOf),
    footprintsAround: (k: CellKey) => around(k, printsOf),
  };
}

/**
 * 철도 망(M07-T01): `input.rail`이 있고 정규화 철도(data/normalized/rail)가 있으면 global/rail.bin을 빌드해 셀에 넘긴다(outDir = 이미 비운 빌드 폴더).
 * 없으면 undefined(선로 메시 없음 — 픽스처·옛 정규화).
 */
export async function railNetworkFor(
  input: { normalizedDir: string; log: Logger; rail?: { repoRoot: string; derivedDir: string } },
  outDir: string,
): Promise<RailNetwork | undefined> {
  if (!input.rail || !existsSync(join(input.normalizedDir, 'rail', RAIL_FILE))) return undefined;
  const { network, report } = await buildRailGlobal({
    repoRoot: input.rail.repoRoot,
    buildDir: outDir,
    normalizedDir: input.normalizedDir,
    derivedDir: input.rail.derivedDir,
    log: input.log.child('rail'),
  });
  writeFileSync(
    join(outDir, 'rail-report.json'),
    `${JSON.stringify(report, null, 1)}
`,
  );
  // 시간표(M07-T02): 같은 rail.bin 위에서 합성·GTFS 컴파일 → global/timetables.
  buildTimetables({ repoRoot: input.rail.repoRoot, buildDir: outDir, network, log: input.log.child('timetables') });
  return network;
}
