// 셀 인덱싱: floor 경계(x = −256, −0.0001, 0), 부모/자식, HLOD 자식 인덱스. see docs/01-architecture.md §8
import { cellIdString, packCellKey, unpackCellKey } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import {
  CELL_SIZES,
  type CellLevel,
  cellBoundsWF,
  cellOf,
  cellOriginWF,
  childrenOf,
  hlodChildIndex,
  parentOf,
} from '../src/index.ts';

const LEVELS: CellLevel[] = [0, 1, 2, 3];

describe('cellOf', () => {
  it('uses floor for negatives (boundary values)', () => {
    expect(unpackCellKey(cellOf(0, -256, 0))).toEqual({ level: 0, ix: -1, iz: 0 });
    expect(unpackCellKey(cellOf(0, -256.0001, 0))).toEqual({ level: 0, ix: -2, iz: 0 });
    expect(unpackCellKey(cellOf(0, -0.0001, -0.0001))).toEqual({ level: 0, ix: -1, iz: -1 });
    expect(unpackCellKey(cellOf(0, 0, 0))).toEqual({ level: 0, ix: 0, iz: 0 });
    expect(unpackCellKey(cellOf(0, -0, -0))).toEqual({ level: 0, ix: 0, iz: 0 });
    expect(unpackCellKey(cellOf(0, 255.9999, 256))).toEqual({ level: 0, ix: 0, iz: 1 });
  });

  it('puts Shibuya scramble (WF −22.3, 8.6) in L0_-1_0', () => {
    expect(cellIdString(cellOf(0, -22.3, 8.6))).toBe('L0_-1_0');
    expect(cellIdString(cellOf(1, -22.3, 8.6))).toBe('L1_-1_0');
  });

  it('scales by level', () => {
    for (const level of LEVELS) {
      const size = CELL_SIZES[level];
      expect(unpackCellKey(cellOf(level, size * 3 + 1, -size * 2 - 1))).toEqual({ level, ix: 3, iz: -3 });
    }
  });

  it('rejects non-finite positions', () => {
    expect(() => cellOf(0, Number.NaN, 0)).toThrow(RangeError);
  });
});

describe('cell geometry', () => {
  it('origin/bounds are the min corner, contain their own points', () => {
    const k = packCellKey(0, -1, 2);
    expect(cellOriginWF(k)).toEqual({ x: -256, y: 0, z: 512 });
    expect(cellBoundsWF(k)).toEqual({ minX: -256, minZ: 512, maxX: 0, maxZ: 768 });
    expect(cellOf(0, -256, 512)).toBe(k);
    expect(cellOf(0, -0.0001, 767.9999)).toBe(k);
    expect(Object.is(cellOriginWF(packCellKey(0, 0, 0)).x, -0)).toBe(false);
  });
});

describe('hierarchy', () => {
  it('parentOf uses floor(i / 4) and stops at L3', () => {
    expect(unpackCellKey(parentOf(packCellKey(0, -1, -4)) ?? -1)).toEqual({ level: 1, ix: -1, iz: -1 });
    expect(unpackCellKey(parentOf(packCellKey(0, 3, 4)) ?? -1)).toEqual({ level: 1, ix: 0, iz: 1 });
    expect(parentOf(packCellKey(3, 0, 0))).toBeNull();
  });

  it('childrenOf returns 16 children whose union equals the parent', () => {
    for (const level of [1, 2, 3] as const) {
      for (const [ix, iz] of [
        [0, 0],
        [-1, -1],
        [2, -3],
      ] as const) {
        const parent = packCellKey(level, ix, iz);
        const kids = childrenOf(parent);
        expect(new Set(kids).size).toBe(16);
        const pb = cellBoundsWF(parent);
        let area = 0;
        for (const kid of kids) {
          expect(parentOf(kid)).toBe(parent);
          const b = cellBoundsWF(kid);
          expect(b.minX).toBeGreaterThanOrEqual(pb.minX);
          expect(b.maxZ).toBeLessThanOrEqual(pb.maxZ);
          area += (b.maxX - b.minX) * (b.maxZ - b.minZ);
        }
        expect(area).toBe((pb.maxX - pb.minX) * (pb.maxZ - pb.minZ));
      }
    }
    expect(childrenOf(packCellKey(0, 5, 5))).toEqual([]);
  });

  it('hlodChildIndex matches childrenOf order and uses positive modulo', () => {
    for (const parent of [packCellKey(1, 0, 0), packCellKey(2, -1, -2)]) {
      childrenOf(parent).forEach((kid, i) => {
        expect(hlodChildIndex(kid)).toBe(i);
      });
    }
    expect(hlodChildIndex(packCellKey(0, -1, -1))).toBe(15); // (−1 mod 4)=3 → 3*4+3
    expect(hlodChildIndex(packCellKey(0, -4, 1))).toBe(4);
  });
});
