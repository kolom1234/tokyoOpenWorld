// 노면 표시 조립(M05-T02): 셀 OSM 레코드 → 횡단보도·정지선(신호·止まれ)·차선 → 데칼 버퍼 + 통계. 04 §4.3(노면 표시), ADR-0050
import type { RoadRecord } from '../../../readers/plateau/types.ts';
import type { OsmRecord } from '../../normalize-osm.ts';
import { roadIndex } from '../roads.ts';
import { type DecalBuf, emptyDecals, type MarkCtx, type TerrainAt } from './common.ts';
import { addCrosswalk, crossBands, isMarkedCrossing } from './crosswalk.ts';
import { addLanes, isLaneRoad } from './lanes.ts';
import { addSignalStops, addStopSigns, isVehicleRoad } from './stopline.ts';

/** PLATEAU 車道交差部(TrafficArea_function 1020). */
const INTERSECTION_CODE = 'TrafficArea:1020';

export interface MarkingStats {
  crosswalkBars: number;
  stopLines: number;
  stopSigns: number;
  lanePieces: number;
}

export interface MarkingInput {
  /** 이 셀 OSM 레코드(선·면 = 셀에 닿는 것 전부, 점 = 셀 안). */
  osm: readonly OsmRecord[];
  /** 셀 + 8-이웃 PLATEAU 도로(차도 분류·교차부). */
  roads: readonly RoadRecord[];
  ox: number;
  oz: number;
  terrainAt: TerrainAt;
}

export function buildMarkings(i: MarkingInput): { decals: DecalBuf; stats: MarkingStats } {
  const intersections = roadIndex(i.roads.filter((r) => r.functionCode === INTERSECTION_CODE));
  const c: MarkCtx = {
    out: emptyDecals(),
    ox: i.ox,
    oz: i.oz,
    terrainAt: i.terrainAt,
    roads: roadIndex(i.roads),
    inIntersection: (x, z) => intersections.classify(x, z) !== 'none',
  };
  const stats: MarkingStats = { crosswalkBars: 0, stopLines: 0, stopSigns: 0, lanePieces: 0 };
  const bands = crossBands(i.osm);
  for (const r of i.osm) if (isMarkedCrossing(r)) stats.crosswalkBars += addCrosswalk(c, r);
  const vehicle = i.osm.filter(isVehicleRoad);
  stats.stopLines = addSignalStops(c, bands, vehicle);
  stats.stopSigns = addStopSigns(c, i.osm, vehicle);
  for (const r of i.osm) if (isLaneRoad(r)) stats.lanePieces += addLanes(c, r, bands);
  return { decals: c.out, stats };
}
