// 승강장 높이 맞춤(M07-T06): 섬식 승강장 하나를 쓰는 두 선로의 레일 높이가 달라도 승강장 구간은 평균 높이, 바깥은 선형 복귀.
import type { RailPlatformMeta, RailTrackMeta } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { ALIGN_MARGIN_M, alignPlatformRails, RAMP_M } from '../src/stages/build/rail-platform-align.ts';

const STEP = 0.5;
const N = 2000; // 1 km
function track(id: string, offset: number): RailTrackMeta {
  return {
    id,
    line: 'l',
    heading: id,
    ptOffset: offset,
    ptCount: N,
    lengthM: (N - 1) * STEP,
    stepM: STEP,
    stops: [{ station: 'a', s: 500, side: 'L', platformLengthM: 200, platform: 0 }],
  };
}

describe('alignPlatformRails', () => {
  it('flattens a sloped track across the platform (car ends level with the platform)', () => {
    const pts: number[] = [];
    for (let k = 0; k < N; k++) pts.push(k * STEP, 29 + k * STEP * 0.01, 0);
    const t = track('sloped', 0);
    const platforms: RailPlatformMeta[] = [{ id: 'p', ringXZ: [0, 0, 1, 0, 1, 1], topY: 0 }];
    alignPlatformRails([t], pts, platforms, 1.1);
    const y = (s: number) => pts[Math.round(s / STEP) * 3 + 1] as number;
    expect(y(400)).toBeCloseTo(34, 5);
    expect(y(600)).toBeCloseTo(34, 5);
    expect(y(500 + 100 + ALIGN_MARGIN_M + RAMP_M + 5)).toBeCloseTo(29 + 745 * 0.01, 5);
    expect(platforms[0]?.topY).toBeCloseTo(35.1, 2);
  });
  it('levels both tracks at the shared platform and ramps back outside', () => {
    const pts: number[] = [];
    for (const y of [29.4, 30.7]) for (let k = 0; k < N; k++) pts.push(k * STEP, y, 0);
    const tracks = [track('outer', 0), track('inner', N)];
    const platforms: RailPlatformMeta[] = [{ id: 'p', ringXZ: [0, 0, 1, 0, 1, 1], topY: 30.5 }];
    const r = alignPlatformRails(tracks, pts, platforms, 1.1);
    const y = (t: number, s: number) => pts[(t * N + Math.round(s / STEP)) * 3 + 1] as number;
    expect(r.platforms).toBe(1);
    expect(r.maxShiftM).toBeCloseTo(0.65, 2);
    for (const t of [0, 1]) {
      expect(y(t, 500)).toBeCloseTo(30.05, 5);
      expect(y(t, 500 + 100 + ALIGN_MARGIN_M)).toBeCloseTo(30.05, 5);
      expect(y(t, 500 + 100 + ALIGN_MARGIN_M + RAMP_M + 10)).toBeCloseTo(t === 0 ? 29.4 : 30.7, 5);
    }
    expect(platforms[0]?.topY).toBeCloseTo(31.15, 2);
    // 기울기 ≤ 0.65 / RAMP_M.
    let worst = 0;
    for (let k = 1; k < N; k++)
      worst = Math.max(worst, Math.abs((pts[k * 3 + 1] as number) - (pts[(k - 1) * 3 + 1] as number)) / STEP);
    expect(worst).toBeLessThanOrEqual(0.65 / RAMP_M + 1e-6);
  });
});
