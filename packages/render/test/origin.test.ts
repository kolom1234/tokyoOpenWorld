// 렌더 원점 재설정 순수 계산: 판정·스냅·왕복 비트 일치·float32 정밀도. see docs/01-architecture.md §7
import { describe, expect, it } from 'vitest';
import { needsRebase, snapOrigin, toRender } from '../src/internal/scene/origin.ts';

describe('render origin', () => {
  const o = { x: 0, y: 0, z: 0 };
  it('rebases at ≥ 2048 m (3D distance)', () => {
    expect(needsRebase({ x: 2047.9, y: 0, z: 0 }, o, 2048)).toBe(false);
    expect(needsRebase({ x: 2048, y: 0, z: 0 }, o, 2048)).toBe(true);
    expect(needsRebase({ x: 1500, y: 1500, z: 0 }, o, 2048)).toBe(true);
  });

  it('snaps x/z to the 256 m grid and keeps y = 0', () => {
    expect(snapOrigin({ x: 9, y: 9, z: 9 }, { x: 4073.7, y: 75, z: -3339 }, 256)).toEqual({ x: 4096, y: 0, z: -3328 });
    expect(snapOrigin({ x: 0, y: 0, z: 0 }, { x: -22.3, y: 75, z: 8.6 }, 256)).toEqual({ x: -0, y: 0, z: 0 });
  });

  it('teleport far and back: node positions are recomputed from WF, bit-identical (no drift)', () => {
    const cellWF = { x: -256, y: 0, z: 0 };
    const before = toRender({ x: 0, y: 0, z: 0 }, cellWF, o);
    const far = snapOrigin({ x: 0, y: 0, z: 0 }, { x: 4073.7, y: 0, z: 8.6 }, 256);
    toRender({ x: 0, y: 0, z: 0 }, cellWF, far);
    const back = snapOrigin({ x: 0, y: 0, z: 0 }, { x: -22.3, y: 0, z: 8.6 }, 256);
    const after = toRender({ x: 0, y: 0, z: 0 }, cellWF, back);
    expect(after.x).toBe(before.x);
    expect(after.z).toBe(before.z);
  });

  it('keeps float32 precision near the camera after a far rebase (Shinjuku ≈ 3.3 km north)', () => {
    const camWF = { x: 9.123456, y: 80, z: -3339.654321 };
    const origin = snapOrigin({ x: 0, y: 0, z: 0 }, camWF, 256);
    const r = toRender({ x: 0, y: 0, z: 0 }, camWF, origin);
    // 원점 기준 128 m 이내 → float32 정밀도 ≈ 8 μm
    expect(Math.abs(Math.fround(r.z) - r.z)).toBeLessThan(1e-5);
    expect(Math.abs(r.x) <= 128 && Math.abs(r.z) <= 128).toBe(true);
  });
});
