// 셀 빌드 통계(로그·테스트): 지형·건물·도로·데칼·소품·나무·랜드마크·충돌. see docs/04-data-pipeline.md §4.4
import { type CellKey, cellIdString } from '@sanpo/core';
import type { MarkingStats } from '../derive/markings/index.ts';
import type { NavCellStats } from '../derive/navmesh.ts';
import type { PropStats } from '../derive/props/index.ts';
import type { TreeStats } from '../derive/trees/index.ts';
import type { LanesCellStats } from './lanes-cell.ts';
import type { DetailStats } from './overrides/rooftops.ts';

export interface CellBuildStats {
  id: string;
  bytes: number;
  terrainVertices: number;
  terrainTris: number;
  buildingVertices: number;
  buildingTris: number;
  buildings: number;
  colliderTris: number;
  colliderShapes: number;
  roadsVertices: number;
  roadsTris: number;
  /** 연석·바깥 가장자리 길이(m). */
  curbM: number;
  walkEdgeM: number;
  /** 노면 표시(M05-T02). */
  decalTris: number;
  markings: MarkingStats | null;
  /** 소품(M05-T03). */
  props: PropStats | null;
  /** 나무(M05-T04). */
  trees: TreeStats | null;
  /** 랜드마크 오버라이드(M05-T05) + 옥상 설비·비상계단(M05-T07). */
  overrides: {
    landmarks: string[];
    tris: number;
    details: DetailStats;
    walk: { bridges: number; stairs: number; risers: number; carved: number };
  } | null;
  /** 내비메시(M06-T03). */
  nav: NavCellStats | null;
  /** 차선(M06-T05). */
  lanes: LanesCellStats | null;
}

/** 통계에 쓰는 셀 조립 결과(assemble.ts CellParts의 부분 구조 — 순환 import 회피). */
export interface StatsParts {
  terrain: { positions: ArrayLike<number>; indices: ArrayLike<number> };
  bld: { vertices: number; tris: number; meta: readonly unknown[] };
  col: { tris: number; shapes: number };
  roads: { vertices: number; tris: number; edges: { curbM: number; outerM: number } };
  props: { stats: PropStats; treeStats: TreeStats } | null;
  ov: {
    landmarks: string[];
    tris: number;
    details: DetailStats;
    walk: { bridges: number; stairs: number; risers: number; carved: number };
  } | null;
  nav: { stats: NavCellStats } | null;
  lanes: { stats: LanesCellStats } | null;
}

export function cellStats(
  key: CellKey,
  bytes: number,
  p: StatsParts,
  decalTris: number,
  marks: MarkingStats | null,
): CellBuildStats {
  return {
    id: cellIdString(key),
    bytes,
    terrainVertices: p.terrain.positions.length / 3,
    terrainTris: p.terrain.indices.length / 3,
    buildingVertices: p.bld.vertices,
    buildingTris: p.bld.tris,
    buildings: p.bld.meta.length,
    colliderTris: p.col.tris,
    colliderShapes: p.col.shapes,
    roadsVertices: p.roads.vertices,
    roadsTris: p.roads.tris,
    curbM: Math.round(p.roads.edges.curbM),
    walkEdgeM: Math.round(p.roads.edges.outerM),
    decalTris,
    markings: marks,
    props: p.props?.stats ?? null,
    trees: p.props?.treeStats ?? null,
    overrides: p.ov ? { landmarks: p.ov.landmarks, tris: p.ov.tris, details: p.ov.details, walk: p.ov.walk } : null,
    nav: p.nav?.stats ?? null,
    lanes: p.lanes?.stats ?? null,
  };
}
