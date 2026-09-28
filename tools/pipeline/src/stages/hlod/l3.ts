// L3 HLOD(16384 m = L2 4×4): 블록 단위 압출 매스(128 m 격자, 면적 가중 높이) + 초고층(≥ 80 m)만 개별 박스(스카이라인).
// 지형 = 원경 DEM 64 m(RTIN 4 m) + 스커트. see docs/04-data-pipeline.md §4.5
import type { CellKey } from '@sanpo/core';
import type { FarDem } from './dem-far.ts';
import type { FarBuilding } from './far-buildings.ts';
import { buildFarLevel, type FarLevelParams, type FarLevelResult } from './l2.ts';

export const L3_PARAMS: FarLevelParams = {
  terrainError: 4,
  skirt: 64,
  maxBoxes: 4_000,
  boxMinHeight: 80,
  boxMinArea: Number.POSITIVE_INFINITY,
  massGrid: 128,
  budgetBytes: 2_000_000,
};

export function buildL3(
  key: CellKey,
  far: readonly FarBuilding[],
  dem: FarDem,
  p: FarLevelParams = L3_PARAMS,
): FarLevelResult {
  return buildFarLevel(key, far, dem, p);
}
