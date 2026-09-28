// L2 HLOD(4096 m = L1 4×4): 건물 = LOD1 박스(방향 사각형, 높이 유지) — 크고 높은 건물 우선 상한까지, 나머지는 64 m 블록 매스.
// 지형 = 원경 DEM 16 m(RTIN 1 m) + 스커트. 입력 = 23구 원경 건물(tokyo23-lod1). see docs/04-data-pipeline.md §4.5
import { type CellKey, unpackCellKey } from '@sanpo/core';
import { CELL_SIZES, cellOf, hlodChildIndex } from '@sanpo/geo';
import { accumulateMasses, addFarBox, addMass } from './boxes.ts';
import { addTerrainPatch, type ChildGeometry, childKeys, emptyChildren, patchOf } from './child-split.ts';
import { type FarDem, farDemHeight } from './dem-far.ts';
import type { FarBuilding } from './far-buildings.ts';

export interface FarLevelParams {
  terrainError: number;
  skirt: number;
  /** 박스로 남길 최대 건물 수(부피 = 면적 × 높이 내림차순). */
  maxBoxes: number;
  /** 박스 후보: 높이 ≥ 이 값 또는 면적 ≥ boxMinArea. */
  boxMinHeight: number;
  boxMinArea: number;
  /** 나머지 건물 블록 매스 격자(m, 자식 경계와 정렬되도록 자식 크기의 약수). */
  massGrid: number;
  budgetBytes: number;
}

export const L2_PARAMS: FarLevelParams = {
  terrainError: 1,
  skirt: 16,
  maxBoxes: 12_000,
  boxMinHeight: 20,
  boxMinArea: 1_000,
  massGrid: 64,
  budgetBytes: 2_000_000,
};

export interface FarLevelResult {
  children: ChildGeometry[];
  boxes: number;
  masses: number;
  buildings: number;
}

/** 박스 / 매스 분배(결정론: 부피 내림차순, 동률은 id). */
export function splitBoxes(
  bs: readonly FarBuilding[],
  p: FarLevelParams,
): { boxes: FarBuilding[]; rest: FarBuilding[] } {
  const cand = bs.filter((b) => b.h >= p.boxMinHeight || b.area >= p.boxMinArea);
  cand.sort((a, b) => b.area * b.h - a.area * a.h || (a.id < b.id ? -1 : 1));
  const keep = new Set(cand.slice(0, p.maxBoxes));
  return { boxes: bs.filter((b) => keep.has(b)), rest: bs.filter((b) => !keep.has(b)) };
}

/**
 * 원경 레벨(L2·L3) 공통: 자식 지형 패치 + 박스(자식 = 중심점의 자식 셀) + 매스(격자 칸 → 자식).
 * 매스 격자는 자식 크기의 약수여야 칸이 자식 하나에만 속한다.
 */
export function buildFarLevel(
  key: CellKey,
  far: readonly FarBuilding[],
  dem: FarDem,
  p: FarLevelParams,
): FarLevelResult {
  const { level, ix, iz } = unpackCellKey(key);
  const size = CELL_SIZES[level];
  const childLevel = (level - 1) as 0 | 1 | 2;
  if (CELL_SIZES[childLevel] % p.massGrid !== 0) throw new RangeError(`massGrid ${p.massGrid} does not divide child`);
  const [ox, oz] = [ix * size, iz * size];
  const children = emptyChildren();
  const h = (x: number, z: number): number => farDemHeight(dem, x, z);
  for (const [ci, child] of childKeys(key).entries()) {
    addTerrainPatch((children[ci] as ChildGeometry).terrain, h, patchOf(key, child, p.terrainError, p.skirt));
  }
  const inCell = far.filter((b) => b.cx >= ox && b.cx < ox + size && b.cz >= oz && b.cz < oz + size);
  const { boxes, rest } = splitBoxes(inCell, p);
  const childOf = (x: number, z: number): ChildGeometry =>
    children[hlodChildIndex(cellOf(childLevel, x, z))] as ChildGeometry;
  for (const b of boxes) addFarBox(childOf(b.cx, b.cz).buildings, b, ox, oz);
  let masses = 0;
  const cells = [...accumulateMasses(rest, p.massGrid).values()].sort((a, b) => a.z0 - b.z0 || a.x0 - b.x0);
  for (const m of cells) {
    if (addMass(childOf(m.x0 + m.size / 2, m.z0 + m.size / 2).buildings, m, ox, oz)) masses++;
  }
  return { children, boxes: boxes.length, masses, buildings: inCell.length };
}

export function buildL2(
  key: CellKey,
  far: readonly FarBuilding[],
  dem: FarDem,
  p: FarLevelParams = L2_PARAMS,
): FarLevelResult {
  return buildFarLevel(key, far, dem, p);
}
