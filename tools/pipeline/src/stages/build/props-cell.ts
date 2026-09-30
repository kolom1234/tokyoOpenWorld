// 셀 소품(M05-T03): 성형 결과·지형 메시·도로 색인 → buildProps → props.inst(gzip) + 콜라이더 + 전선. 04 §4.3(소품), 05 §4(props.inst), ADR-0051
import { type CellKey, cellIdString } from '@sanpo/core';
import { gzip, type JcolShape, writeProps } from '@sanpo/tile-format';
import type { BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { bilinear, type LocalGrid } from '../derive/grid.ts';
import type { PropCatalog } from '../derive/props/context.ts';
import { buildProps, type PropStats } from '../derive/props/index.ts';
import type { WireBuf } from '../derive/props/wires.ts';
import { type RoadIndex, roadIndex } from '../derive/roads.ts';
import { TOP_OFFSET_M } from '../derive/sidewalks.ts';
import type { ShapedGround } from '../derive/terrain-shape.ts';
import type { OsmRecord } from '../normalize-osm.ts';

/** PLATEAU 車道交差部(TrafficArea_function 1020). */
const INTERSECTION_CODE = 'TrafficArea:1020';

export interface PropCellInput {
  key: CellKey;
  catalog: PropCatalog;
  ox: number;
  oz: number;
  osm: readonly OsmRecord[];
  buildings: readonly BuildingRecord[];
  /** 셀 + 8-이웃 도로(분류·교차부). */
  roads: readonly RoadRecord[];
  index: RoadIndex;
  shaped: ShapedGround;
  /** 건물 발자국 격자(성형 창, NaN = 밖). */
  footprints: Float32Array;
  terrainAt: (x: number, z: number) => number | undefined;
}

export interface PropCellOutput {
  inst: Uint8Array | null;
  colliders: JcolShape[];
  wires: WireBuf;
  stats: PropStats;
}

function footprintTest(g: LocalGrid, fp: Float32Array, ox: number, oz: number) {
  return (x: number, z: number): boolean => {
    const i = Math.round(x - ox - g.x0);
    const j = Math.round(z - oz - g.z0);
    if (i < 0 || j < 0 || i >= g.n || j >= g.n) return false;
    return !Number.isNaN(fp[j * g.n + i] as number);
  };
}

export async function propsCell(i: PropCellInput): Promise<PropCellOutput> {
  const g = i.shaped.grid;
  const intersections = roadIndex(i.roads.filter((r) => r.functionCode === INTERSECTION_CODE));
  // 보도 위 = 보도 윗면(roads.mesh와 같은 식), 그 밖 = 지형 메시(셀 밖은 성형 창 지면, 창 밖은 가장자리 값).
  const surfaceAt = (x: number, z: number): number | undefined => {
    if (i.index.classify(x + i.ox, z + i.oz) === 'walk') return bilinear(g, i.shaped.top, x, z) + TOP_OFFSET_M;
    return i.terrainAt(x, z) ?? bilinear(g, i.shaped.ground, x, z);
  };
  const out = buildProps({
    catalog: i.catalog,
    cellId: cellIdString(i.key),
    ox: i.ox,
    oz: i.oz,
    osm: i.osm,
    buildings: i.buildings,
    roads: i.index,
    inIntersection: (x, z) => intersections.classify(x, z) !== 'none',
    inBuilding: footprintTest(g, i.footprints, i.ox, i.oz),
    surfaceAt,
  });
  const inst = out.batches.length > 0 ? await gzip(writeProps(out.batches)) : null;
  return { inst, colliders: out.colliders, wires: out.wires, stats: out.stats };
}
