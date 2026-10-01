// 나무 조립(M05-T04): 셀 OSM·도로·소품 → OSM 나무(점·열) → 규칙 가로수 → 녹지 채우기(우선순위 순, 셀 예산 4k — 넘치면 뒤부터 버림)
// → TreeRecord(셀 로컬) + 줄기·덤불 콜라이더 + 통계. PLATEAU veg는 MVP 원천에 없음(ADR-0052).
import type { JcolShape, TreeRecord } from '@sanpo/tile-format';
import type { OsmRecord } from '../../normalize-osm.ts';
import { crossBands } from '../markings/crosswalk.ts';
import type { RoadIndex } from '../roads.ts';
import { fillGreens } from './fill.ts';
import type { TreeCtx, V2 } from './place.ts';
import { plantOsmTrees, plantStreetRule } from './street.ts';

export const MAX_TREES_PER_CELL = 4000;

export interface TreeStats {
  trees: number;
  osm: number;
  street: number;
  fill: number;
  trimmed: number;
}

export interface TreeInput {
  cellId: string;
  ox: number;
  oz: number;
  osm: readonly OsmRecord[];
  roads: RoadIndex;
  surfaceAt: (x: number, z: number) => number | undefined;
  inIntersection: (x: number, z: number) => boolean;
  inBuilding: (x: number, z: number) => boolean;
  /** 이 셀 소품 위치(WF). */
  avoid: readonly V2[];
  budget?: number;
}

export function buildTrees(i: TreeInput): { records: TreeRecord[]; colliders: JcolShape[]; stats: TreeStats } {
  const c: TreeCtx = {
    cellId: i.cellId,
    ox: i.ox,
    oz: i.oz,
    roads: i.roads,
    surfaceAt: i.surfaceAt,
    inIntersection: i.inIntersection,
    inBuilding: i.inBuilding,
    avoid: i.avoid,
    out: [],
    colliders: [],
    left: i.budget ?? MAX_TREES_PER_CELL,
    trimmed: 0,
  };
  const mapped = plantOsmTrees(c, i.osm);
  const osm = c.out.length;
  const street = plantStreetRule(c, i.osm, crossBands(i.osm), mapped);
  const fill = fillGreens(c, i.osm);
  return {
    records: c.out,
    colliders: c.colliders,
    stats: { trees: c.out.length, osm, street, fill, trimmed: c.trimmed },
  };
}
