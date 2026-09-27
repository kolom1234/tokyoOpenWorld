// cellKey pack/unpack 왕복(음수·경계 ±2^15), 문자열 형식. see docs/modules/core.md Invariants
import { describe, expect, it } from 'vitest';
import { type CellLevel, cellIdString, packCellKey, unpackCellKey } from '../src/index.ts';

const LEVELS: CellLevel[] = [0, 1, 2, 3];
const AXIS = [-32768, -32767, -1, 0, 1, 12345, -12345, 32766, 32767];

describe('packCellKey / unpackCellKey', () => {
  it('round-trips all levels × boundary axes (incl. negatives)', () => {
    const keys = new Set<number>();
    for (const level of LEVELS) {
      for (const ix of AXIS) {
        for (const iz of AXIS) {
          const k = packCellKey(level, ix, iz);
          expect(Number.isSafeInteger(k)).toBe(true);
          expect(unpackCellKey(k)).toEqual({ level, ix, iz });
          keys.add(k);
        }
      }
    }
    expect(keys.size).toBe(LEVELS.length * AXIS.length * AXIS.length);
  });

  it('follows the documented layout', () => {
    expect(packCellKey(0, -32768, -32768)).toBe(0);
    expect(packCellKey(0, 0, 0)).toBe(32768 * 65536 + 32768);
    expect(packCellKey(3, 32767, 32767)).toBe(4 * 2 ** 32 - 1);
    expect(packCellKey(1, -1, 0)).toBe(2 ** 32 + 32767 * 65536 + 32768);
  });

  it('rejects out-of-range input', () => {
    expect(() => packCellKey(0, 32768, 0)).toThrow(RangeError);
    expect(() => packCellKey(0, 0, -32769)).toThrow(RangeError);
    expect(() => packCellKey(0, 0.5, 0)).toThrow(RangeError);
    expect(() => packCellKey(4 as CellLevel, 0, 0)).toThrow(RangeError);
    expect(() => unpackCellKey(-1)).toThrow(RangeError);
    expect(() => unpackCellKey(4 * 2 ** 32)).toThrow(RangeError);
    expect(() => unpackCellKey(1.5)).toThrow(RangeError);
  });
});

describe('cellIdString', () => {
  it('formats as L<level>_<ix>_<iz>', () => {
    expect(cellIdString(packCellKey(0, -1, 0))).toBe('L0_-1_0');
    expect(cellIdString(packCellKey(2, 32767, -32768))).toBe('L2_32767_-32768');
  });
});
