// 시작 시점: 지면 위 60 m, 스크램블 교차로 근처에서 Scramble Square 조준. (구 local-cells.test에서 이전 — 지면은 streaming 높이장 대신 대역)
import { describe, expect, it } from 'vitest';
import { SCRAMBLE_SQUARE_LOOK_WF, START_HEIGHT_AGL_M, startFreecamPose } from '../src/start-view.ts';

function forwardOf(yaw: number, pitch: number) {
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}

describe('start view', () => {
  it('starts 60 m above ground near the crossing, looking at Scramble Square', () => {
    // 스크램블 교차로 부근 TP ≈ 15.4 m(M01-T03 GSI), 약간 기운 지면
    const ground = { groundHeightAt: (x: number, z: number) => 15.4 + 0.01 * x - 0.005 * z };
    const pose = startFreecamPose(ground);
    expect(pose.posWF.y - ground.groundHeightAt(pose.posWF.x, pose.posWF.z)).toBeCloseTo(START_HEIGHT_AGL_M, 9);
    expect(Math.hypot(pose.posWF.x + 22.3, pose.posWF.z - 8.6)).toBeLessThan(60);
    const f = forwardOf(pose.yawRad, pose.pitchRad);
    const to = SCRAMBLE_SQUARE_LOOK_WF;
    const d = Math.hypot(to.x - pose.posWF.x, to.y - pose.posWF.y, to.z - pose.posWF.z);
    expect(f.x).toBeCloseTo((to.x - pose.posWF.x) / d, 9);
    expect(f.z).toBeCloseTo((to.z - pose.posWF.z) / d, 9);
    // 지면 미적재 시 기본 표고(15 m) + 60 m
    expect(startFreecamPose({ groundHeightAt: () => undefined }).posWF.y).toBe(75);
  });
});
