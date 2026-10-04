// 셀 소품(M05-T03)·나무(M05-T04): 성형 결과·지형 메시·도로 색인 → buildProps → props.inst(gzip) + 콜라이더 + 전선, 이어서 buildTrees(소품 자리 피함)
// → trees.inst(gzip) + 줄기 콜라이더. 04 §4.3, 05 §4, ADR-0051·0052
import { type CellKey, cellIdString } from '@sanpo/core';
import { gzip, type JcolShape, writeProps, writeTrees } from '@sanpo/tile-format';
import type { BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { bilinear, type LocalGrid } from '../derive/grid.ts';
import type { PropCatalog } from '../derive/props/context.ts';
import { buildProps, type PropStats } from '../derive/props/index.ts';
import type { WireBuf } from '../derive/props/wires.ts';
import { type RoadIndex, roadIndex } from '../derive/roads.ts';
import { TOP_OFFSET_M } from '../derive/sidewalks.ts';
import type { ShapedGround } from '../derive/terrain-shape.ts';
import { buildTrees, type TreeStats } from '../derive/trees/index.ts';
import type { OsmRecord } from '../normalize-osm.ts';

/** PLATEAU 車道交差部(TrafficArea_function 1020). */
const INTERSECTION_CODE = 'TrafficArea:1020';

export interface PropCellInput {
  key: CellKey;
  catalog: PropCatalog;
  ox: number;
  oz: number;
  osm: readonly OsmRecord[];
  /** 셀 + 8-이웃 OSM 차도 선(신호 그룹 도로 방향). */
  vehicleRoadsAround?: readonly OsmRecord[];
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
  /** 소품 + 나무 콜라이더. */
  colliders: JcolShape[];
  wires: WireBuf;
  stats: PropStats;
  trees: Uint8Array | null;
  treeStats: TreeStats;
}

/** 소품 배치 → WF 위치(나무가 피할 자리). */
function propSpots(batches: readonly { transforms: Float32Array }[], ox: number, oz: number): [number, number][] {
  const out: [number, number][] = [];
  for (const b of batches)
    for (let k = 0; k < b.transforms.length; k += 5)
      out.push([(b.transforms[k] as number) + ox, (b.transforms[k + 2] as number) + oz]);
  return out;
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
  const common = {
    cellId: cellIdString(i.key),
    ox: i.ox,
    oz: i.oz,
    osm: i.osm,
    roads: i.index,
    inIntersection: (x: number, z: number) => intersections.classify(x, z) !== 'none',
    inBuilding: footprintTest(g, i.footprints, i.ox, i.oz),
    surfaceAt,
  };
  const junctions = i.roads.filter((r) => r.functionCode === INTERSECTION_CODE);
  const out = buildProps({
    ...common,
    catalog: i.catalog,
    buildings: i.buildings,
    junctions,
    ...(i.vehicleRoadsAround ? { vehicleRoadsAround: i.vehicleRoadsAround } : {}),
  });
  const tr = buildTrees({ ...common, avoid: propSpots(out.batches, i.ox, i.oz) });
  const inst = out.batches.length > 0 ? await gzip(writeProps(out.batches)) : null;
  const trees = tr.records.length > 0 ? await gzip(writeTrees(tr.records)) : null;
  return {
    inst,
    colliders: [...out.colliders, ...tr.colliders],
    wires: out.wires,
    stats: out.stats,
    trees,
    treeStats: tr.stats,
  };
}
