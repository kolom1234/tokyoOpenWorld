// cells.idx 조회(합성 + world-mini 픽스처). see docs/05-tile-format.md §5
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cellIdString } from '@sanpo/core';
import { TkcErrorCode } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { parseCellIndex } from '../src/internal/cell-index.ts';
import { key, synthIndex, WORLD_MINI, worldMiniIndex } from './helpers.ts';

describe('cell-index', () => {
  it('answers has/get/byteLength/keysAt/extentAt for a synthetic index', () => {
    const idx = synthIndex([
      [-2, 1],
      [-1, 0],
    ]);
    expect(idx.size).toBe(16 + 4);
    expect(idx.has(key(0, -2, 1))).toBe(true);
    expect(idx.has(key(0, 2, 0))).toBe(false);
    expect(idx.get(key(1, 0, -1))).toEqual({ flags: 0, byteLength: 1001, hash32: 0 });
    expect(idx.byteLength(key(0, 0, 0))).toBe(1000);
    expect(idx.byteLength(key(3, 0, 0))).toBeUndefined();
    expect(idx.keysAt(1).map(cellIdString)).toEqual(['L1_-1_-1', 'L1_0_-1', 'L1_-1_0', 'L1_0_0']);
    expect(idx.keysAt(2)).toEqual([]);
    expect(idx.extentAt(0)).toEqual({ minIx: -2, maxIx: 1, minIz: -2, maxIz: 1 });
    expect(idx.extentAt(3)).toBeUndefined();
  });

  it('reads the world-mini fixture cells.idx (L0 2×2, no HLOD)', () => {
    const idx = worldMiniIndex();
    expect(idx.keysAt(0).map(cellIdString)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(idx.extentAt(0)).toEqual({ minIx: -1, maxIx: 0, minIz: -1, maxIz: 0 });
    expect([1, 2, 3].map((l) => idx.keysAt(l as 1 | 2 | 3).length)).toEqual([0, 0, 0]);
    // byteLength = 실제 .tkc 파일 크기.
    const tkc = readFileSync(resolve(WORLD_MINI, 'L0/-1/0.tkc'));
    expect(idx.byteLength(key(0, -1, 0))).toBe(tkc.byteLength);
  });

  it('returns a TkcError for bad bytes', () => {
    const r = parseCellIndex(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(TkcErrorCode.Magic);
  });
});
