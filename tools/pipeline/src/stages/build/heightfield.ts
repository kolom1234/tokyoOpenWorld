// terrain.height 섹션: 셀 창(257²) → 공통 기준·스텝 양자화 → writeHeightfield → gzip. see docs/05-tile-format.md §4 (terrain.height), docs/adr/0018-cell-mesh-build.md
import {
  gzip,
  HEIGHTFIELD_BASE_M,
  HEIGHTFIELD_STEP_M,
  type HeightfieldData,
  quantizeHeightfield,
  writeHeightfield,
} from '@sanpo/tile-format';
import { type CellWindow, sampleAt } from './dem-window.ts';

/** 셀 창 → 양자화 높이장. 모든 셀이 HEIGHTFIELD_BASE_M·HEIGHTFIELD_STEP_M을 쓰므로 경계 행·열이 이웃과 비트 동일. */
export function cellHeightfield(w: CellWindow): HeightfieldData {
  const n = w.size;
  const h = new Float64Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) h[z * n + x] = sampleAt(w, x, z);
  return quantizeHeightfield(h, n, HEIGHTFIELD_STEP_M, HEIGHTFIELD_BASE_M);
}

/** terrain.height 섹션 바이트(bin+gzip). */
export async function encodeTerrainHeight(w: CellWindow): Promise<Uint8Array> {
  return gzip(writeHeightfield(cellHeightfield(w)));
}
