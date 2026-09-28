// 지면 높이 질의: 상주 L0 셀의 terrain.height(257² u16)를 이중선형 보간. 셀 경계 샘플은 이웃과 비트 일치(ADR-0018)라 이음매 연속.
// see docs/06-world-streaming.md §9(heightfield 보관 예외), docs/05-tile-format.md §4
import type { CellKey, GroundQuery, Vec3d } from '@sanpo/core';
import { CELL_SIZES, cellOf } from '@sanpo/geo';
import type { HeightfieldData } from '@sanpo/tile-format';

const L0_SIZE_M = CELL_SIZES[0];

/** 높이장 이중선형 보간(격자 (0,0) = 셀 북서 모서리 = 로컬 (0, 0), 간격 = 256 / (size − 1) m). 셀 밖 좌표는 가장자리로 클램프. */
export function sampleHeightfield(hf: HeightfieldData, xLocal: number, zLocal: number): number {
  const n = hf.size - 1;
  const fx = Math.min(Math.max((xLocal / L0_SIZE_M) * n, 0), n);
  const fz = Math.min(Math.max((zLocal / L0_SIZE_M) * n, 0), n);
  const x0 = Math.min(Math.floor(fx), n - 1);
  const z0 = Math.min(Math.floor(fz), n - 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const at = (ix: number, iz: number): number => hf.minH + (hf.data[iz * hf.size + ix] ?? 0) * hf.step;
  const top = at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx;
  const bottom = at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

export interface GroundStore extends GroundQuery {
  add(key: CellKey, originWF: Readonly<Vec3d>, hf: HeightfieldData): void;
  remove(key: CellKey): void;
  readonly size: number;
}

/** 적재된 L0 셀 높이장 모음. 미적재 셀 좌표면 undefined. */
export function createGroundStore(): GroundStore {
  const cells = new Map<CellKey, { ox: number; oz: number; hf: HeightfieldData }>();
  return {
    add(key, originWF, hf) {
      cells.set(key, { ox: originWF.x, oz: originWF.z, hf });
    },
    remove(key) {
      cells.delete(key);
    },
    groundHeightAt(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return undefined;
      const c = cells.get(cellOf(0, x, z));
      return c === undefined ? undefined : sampleHeightfield(c.hf, x - c.ox, z - c.oz);
    },
    get size() {
      return cells.size;
    },
  };
}
