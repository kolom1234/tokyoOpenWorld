// 탄것 바닥 사각형(M08-T02): 사각형까지 거리(교통 양보) — 안 0·앞뒤·옆, 원 격자(군중 장애물)가 사각형 + 여유를 덮는다.
import { describe, expect, it } from 'vitest';
import { footprintDistance, footprintGrid } from '../src/internal/player-footprint.ts';

const CAR = { yaw: 0, lengthM: 4.5, widthM: 1.75 };

describe('player footprint (M08-T02)', () => {
  it('distance to the car rectangle (front −Z, yaw 0 and 90°)', () => {
    expect(footprintDistance(CAR, 0, 0, 0.5, 1)).toBe(0);
    expect(footprintDistance(CAR, 0, 0, 0, -3.25)).toBeCloseTo(1, 6);
    expect(footprintDistance(CAR, 0, 0, 1.875, 0)).toBeCloseTo(1, 6);
    const east = { ...CAR, yaw: Math.PI / 2 };
    // yaw 90° → 전방 −X: 길이 방향이 x축.
    expect(footprintDistance(east, 10, 0, 10 - 3.25, 0)).toBeCloseTo(1, 6);
    expect(footprintDistance(east, 10, 0, 10, 1.875)).toBeCloseTo(1, 6);
  });

  it('obstacle grid (r 0.6) covers the rectangle plus margin', () => {
    const g = footprintGrid(CAR, 0, 0, 0.6, 0.2);
    expect(g.length).toBeLessThanOrEqual(12);
    for (let x = -1.07; x <= 1.07; x += 0.1)
      for (let z = -2.45; z <= 2.45; z += 0.1) {
        const d = Math.min(...g.map((c) => Math.hypot(c.x - x, c.z - z)));
        expect(d).toBeLessThanOrEqual(0.6 + 0.25);
      }
  });
});
