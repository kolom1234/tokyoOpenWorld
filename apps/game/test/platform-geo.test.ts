// 승강장 윗면 질의(ADR-0082): 윗면 높이·가장자리 여유·안전 도착점·선로 구덩이/승강장 밑 판정.
import { describe, expect, it } from 'vitest';
import { ARRIVAL_CLEARANCE_M, clearTopAt, platformTops, safeArrival, trackPits } from '../src/station/platform-geo.ts';

/** 폭 6 m(x 0..6) × 길이 100 m(z 0..100) 승강장, 윗면 y = 5(삼각형 2개) + 옆면 아래(윗면 질의는 앞 6개 인덱스만). */
const mesh = {
  positions: Float64Array.from([0, 5, 0, 6, 5, 0, 6, 5, 100, 0, 5, 100, 0, 3.9, 0, 6, 3.9, 0]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3, 0, 4, 5]),
  topIndexCount: 6,
};
/** 승강장 서쪽(x = −1.7) 선로 레일 윗면 y = 3.9, z −50..150. */
const points = Float32Array.from(Array.from({ length: 401 }, (_, i) => [-1.7, 3.9, -50 + i * 0.5]).flat());

describe('platform tops', () => {
  const tops = platformTops(mesh);
  it('height inside, undefined outside (side faces are not tops)', () => {
    expect(tops.triangles).toBe(2);
    expect(tops.topAt(3, 50)).toBeCloseTo(5, 6);
    expect(tops.topAt(-0.5, 50)).toBeUndefined();
    expect(tops.topAt(3, 101)).toBeUndefined();
  });
  it('clearance: centre ok, 0.5 m from the edge not ok', () => {
    expect(clearTopAt(tops, 3, 50, ARRIVAL_CLEARANCE_M)).toBeCloseTo(5, 6);
    expect(clearTopAt(tops, 0.5, 50, ARRIVAL_CLEARANCE_M)).toBeUndefined();
  });
  it('safe arrival: keeps a clear hint, moves an edge hint inwards, none far away', () => {
    expect(safeArrival(tops, { x: 3, z: 50 })).toEqual({ x: 3, y: 5.05, z: 50 });
    const moved = safeArrival(tops, { x: 0.3, z: 50 });
    expect(moved?.x).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE_M);
    expect(moved?.z).toBeCloseTo(50, 6);
    // 선로 위·승강장 밖 힌트(x −1.7)도 8 m 안이면 승강장 안으로.
    expect(clearTopAt(tops, moved?.x as number, moved?.z as number, ARRIVAL_CLEARANCE_M)).toBe(5);
    expect(safeArrival(tops, { x: -1.7, z: 50 })?.x).toBeGreaterThanOrEqual(ARRIVAL_CLEARANCE_M);
    expect(safeArrival(tops, { x: 40, z: 50 })).toBeUndefined();
  });
  it('pits: track bed beside the platform and under the deck = pit; platform, rail level and far street = not', () => {
    const pits = trackPits(tops, points);
    expect(pits.inPit({ x: -1.7, y: 2.45, z: 50 })).toBe(true);
    expect(pits.inPit({ x: 2, y: 2.45, z: 50 })).toBe(true);
    expect(pits.inPit({ x: 3, y: 5, z: 50 })).toBe(false);
    expect(pits.inPit({ x: -1.7, y: 3.9, z: 50 })).toBe(false);
    // 승강장 끝에서 멀리(선로 회랑이지만 승강장 8 m 밖)·고가 아래 거리(레일 4 m+ 아래).
    expect(pits.inPit({ x: -1.7, y: 2.45, z: -40 })).toBe(false);
    expect(pits.inPit({ x: -1.7, y: -0.5, z: 50 })).toBe(false);
  });
});
