// 셀 키 pack/unpack/문자열화(53-bit 안전 정수). 레이아웃 변경 = 캐시·세이브 호환 파괴 → ADR 필요. see docs/01-architecture.md §8
import type { CellId, CellKey, CellLevel } from '../api.ts';

const LEVEL_STRIDE = 0x1_0000_0000; // 2^32
const IX_STRIDE = 0x1_0000; // 2^16
const AXIS_BIAS = 32768; // ix, iz ∈ [-32768, 32767] → [0, 65535]
const AXIS_MIN = -32768;
const AXIS_MAX = 32767;
const LEVEL_MAX = 3;

function checkAxis(name: string, v: number): void {
  if (!Number.isInteger(v) || v < AXIS_MIN || v > AXIS_MAX) {
    throw new RangeError(`packCellKey: ${name}=${v} out of [${AXIS_MIN}, ${AXIS_MAX}]`);
  }
}

/** `level * 2^32 + (ix + 32768) * 2^16 + (iz + 32768)`. 범위 밖 입력은 프로그래밍 오류(RangeError). */
export function packCellKey(level: CellLevel, ix: number, iz: number): CellKey {
  if (!Number.isInteger(level) || level < 0 || level > LEVEL_MAX) {
    throw new RangeError(`packCellKey: level=${level} out of [0, ${LEVEL_MAX}]`);
  }
  checkAxis('ix', ix);
  checkAxis('iz', iz);
  return level * LEVEL_STRIDE + (ix + AXIS_BIAS) * IX_STRIDE + (iz + AXIS_BIAS);
}

export function unpackCellKey(k: CellKey): { level: CellLevel; ix: number; iz: number } {
  if (!Number.isSafeInteger(k) || k < 0 || k >= (LEVEL_MAX + 1) * LEVEL_STRIDE) {
    throw new RangeError(`unpackCellKey: invalid key ${k}`);
  }
  const level = Math.floor(k / LEVEL_STRIDE) as CellLevel;
  const rem = k - level * LEVEL_STRIDE;
  const ix = Math.floor(rem / IX_STRIDE) - AXIS_BIAS;
  const iz = (rem % IX_STRIDE) - AXIS_BIAS;
  return { level, ix, iz };
}

/** "L<level>_<ix>_<iz>", 예: "L0_-1_0". */
export function cellIdString(k: CellKey): CellId {
  const { level, ix, iz } = unpackCellKey(k);
  return `L${level}_${ix}_${iz}`;
}
