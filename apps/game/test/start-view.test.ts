// 시작 시점(M05 결정 1): walk 시작 = 스폰 xz 눈높이·world.json 방위·수평 시선, 지면 미적재면 대체 표고.
import { describe, expect, it } from 'vitest';
import { startFreecamPose, startWalkParams } from '../src/start-view.ts';

describe('start view', () => {
  it('walk start waits at eye height above the spawn ground, facing the spawn yaw', () => {
    const p = startWalkParams({ x: -22.3, y: 0, z: 8.6 }, Math.PI / 2, { groundHeightAt: () => 14.6 });
    expect(p.posWF).toEqual({ x: -22.3, y: 16.2, z: 8.6 });
    expect(p.yawRad).toBeCloseTo(Math.PI / 2, 9);
    expect(p.pitchRad).toBe(0);
    expect(startWalkParams({ x: 0, y: 0, z: 0 }, 0, { groundHeightAt: () => undefined }).posWF.y).toBeCloseTo(16.6, 9);
  });

  it('freecam start stays 60 m above the ground', () => {
    expect(startFreecamPose({ groundHeightAt: () => 10 }).posWF.y).toBe(70);
  });
});
