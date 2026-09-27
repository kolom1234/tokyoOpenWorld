// WF 셀 인덱싱(L0–L3), 부모/자식, HLOD 자식 인덱스. 음수 인덱스는 floor 기반. see docs/01-architecture.md §8
import { type CellKey, type CellLevel, packCellKey, unpackCellKey, type Vec3d } from '@sanpo/core';
import { CELL_FANOUT, CELL_SIZES, type CellBoundsWF } from '../api.ts';

const MAX_LEVEL = 3;

function cellSize(level: CellLevel): number {
  return CELL_SIZES[level];
}

/** 양의 나머지(−1 mod 4 = 3). */
function posMod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** WF(x, z) 미터가 속한 레벨 `level` 셀. 경계값은 오른쪽/남쪽 셀에 속한다(min 포함). */
export function cellOf(level: CellLevel, xWF: number, zWF: number): CellKey {
  if (!Number.isFinite(xWF) || !Number.isFinite(zWF)) {
    throw new RangeError(`cellOf: non-finite position (${xWF}, ${zWF})`);
  }
  const size = cellSize(level);
  // `+ 0`: floor(-0) = -0 을 0으로 정규화(키는 같지만 원점 계산에 -0이 새지 않게).
  return packCellKey(level, Math.floor(xWF / size) + 0, Math.floor(zWF / size) + 0);
}

/** 셀의 최소 모서리(북서가 아니라 −X·−Z 모서리 = 서·북) WF 좌표. y = 0. */
export function cellOriginWF(k: CellKey): Vec3d {
  const { level, ix, iz } = unpackCellKey(k);
  const size = cellSize(level);
  return { x: ix * size + 0, y: 0, z: iz * size + 0 };
}

export function cellBoundsWF(k: CellKey): CellBoundsWF {
  const { level, ix, iz } = unpackCellKey(k);
  const size = cellSize(level);
  return { minX: ix * size + 0, minZ: iz * size + 0, maxX: (ix + 1) * size, maxZ: (iz + 1) * size };
}

/** 한 레벨 위 HLOD 셀. L3이면 null. */
export function parentOf(k: CellKey): CellKey | null {
  const { level, ix, iz } = unpackCellKey(k);
  if (level === MAX_LEVEL) return null;
  return packCellKey((level + 1) as CellLevel, Math.floor(ix / CELL_FANOUT), Math.floor(iz / CELL_FANOUT));
}

/** 한 레벨 아래 자식 16개. 배열 인덱스 = `hlodChildIndex(child)`. L0이면 빈 배열. */
export function childrenOf(k: CellKey): CellKey[] {
  const { level, ix, iz } = unpackCellKey(k);
  if (level === 0) return [];
  const childLevel = (level - 1) as CellLevel;
  const out: CellKey[] = [];
  for (let dz = 0; dz < CELL_FANOUT; dz++) {
    for (let dx = 0; dx < CELL_FANOUT; dx++) {
      out.push(packCellKey(childLevel, ix * CELL_FANOUT + dx, iz * CELL_FANOUT + dz));
    }
  }
  return out;
}

/** 부모 안에서 자식의 위치 0..15 = `(iz mod 4) * 4 + (ix mod 4)`(양의 나머지). */
export function hlodChildIndex(child: CellKey): number {
  const { ix, iz } = unpackCellKey(child);
  return posMod(iz, CELL_FANOUT) * CELL_FANOUT + posMod(ix, CELL_FANOUT);
}
