// groundHeightAt: 이중선형 보간, 셀 경계 연속(world-mini 실제 높이장 — 이웃 경계 샘플 비트 일치, ADR-0018). see docs/06-world-streaming.md §9
import { packCellKey } from '@sanpo/core';
import { cellOriginWF } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import { decodeCell } from '../src/internal/decode.ts';
import { abortCheck } from '../src/internal/decode-util.ts';
import { createGroundStore, sampleHeightfield } from '../src/internal/ground.ts';
import { WORLD_MINI_BUILD_ID, WORLD_MINI_CELLS, worldMiniCell } from './helpers.ts';

describe('ground', () => {
  it('sampleHeightfield interpolates bilinearly and clamps outside the cell', () => {
    // 2×2 격자: NW 0, NE 10, SW 20, SE 30 (step 1, minH 0) — 256 m 셀
    const hf = { size: 2, minH: 0, step: 1, data: new Uint16Array([0, 10, 20, 30]) };
    expect(sampleHeightfield(hf, 0, 0)).toBe(0);
    expect(sampleHeightfield(hf, 256, 256)).toBe(30);
    expect(sampleHeightfield(hf, 128, 128)).toBe(15);
    expect(sampleHeightfield(hf, 64, 0)).toBe(2.5);
    expect(sampleHeightfield(hf, -50, 999)).toBe(20);
  });

  it('is continuous across world-mini cell boundaries and undefined outside loaded cells', async () => {
    const g = createGroundStore();
    const check = abortCheck(undefined, async () => undefined);
    for (const [ix, iz] of WORLD_MINI_CELLS) {
      const key = packCellKey(0, ix, iz);
      const req = { key, buildId: WORLD_MINI_BUILD_ID };
      const r = await decodeCell(worldMiniCell(ix, iz), req, { verifyHash: false, check });
      if (!r.ok || !r.value.heightfield) throw new Error('decode');
      g.add(key, cellOriginWF(key), r.value.heightfield);
    }
    expect(g.size).toBe(4);
    let maxJump = 0;
    for (let t = -250; t <= 250; t += 7.3) {
      // x = 0 경계(서 ↔ 동)와 z = 0 경계(북 ↔ 남)를 양쪽에서 0.1 µm 안쪽으로 샘플(경사 × 거리 ≪ 허용치)
      const w = g.groundHeightAt(-1e-7, t) ?? Number.NaN;
      const e = g.groundHeightAt(1e-7, t) ?? Number.NaN;
      const n = g.groundHeightAt(t, -1e-7) ?? Number.NaN;
      const s = g.groundHeightAt(t, 1e-7) ?? Number.NaN;
      maxJump = Math.max(maxJump, Math.abs(w - e), Math.abs(n - s));
    }
    expect(maxJump).toBeLessThan(1e-5);
    expect(g.groundHeightAt(300, 0)).toBeUndefined();
    expect(g.groundHeightAt(Number.NaN, 0)).toBeUndefined();
    g.remove(packCellKey(0, 0, 0));
    expect(g.groundHeightAt(10, 10)).toBeUndefined();
  });
});
