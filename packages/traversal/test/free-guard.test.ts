// freecam 지오메트리 진입 방지(M06 사전 3): 쓸기 접촉에서 멈춤·법선 속도 제거, 닫힌 부피 안 시작 → 가장 가까운 뒷면 너머로, 바깥 시작은 그대로,
// 닿은 채 접선 이동은 막지 않음. 물리 = 평면·판 모형(비동기 Promise).
import type { Vec3, Vec3d } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { CAMERA_RADIUS_M, createFreeGuard, resetFreeGuard, stepFreeGuard } from '../src/internal/camera/free-guard.ts';
import { createFreeRigState } from '../src/internal/camera/free-rig.ts';

type Hit = { posWF: Vec3d; normal: Vec3; distance: number; layer: number; material: number } | null;
const hit = (distance: number, normal: Vec3): Hit => ({
  posWF: { x: 0, y: 0, z: 0 },
  normal,
  distance,
  layer: 0,
  material: 0,
});
const flush = () => new Promise((r) => setTimeout(r, 0));

/** x = wallX 벽(법선 −x)만 있는 세계: 구 캐스트는 +x로 갈 때만 맞는다. 레이는 없음. */
function wallWorld(wallX: number) {
  return {
    sphereCast: async (o: Vec3d, d: Vec3, r: number, max: number): Promise<Hit> => {
      const len = Math.hypot(d.x, d.y, d.z);
      if (d.x <= 0) return o.x + r >= wallX - 1e-9 ? hit(0, { x: -1, y: 0, z: 0 }) : null;
      const t = ((wallX - r - o.x) / d.x) * len;
      return t <= max ? hit(Math.max(0, t), { x: -1, y: 0, z: 0 }) : null;
    },
    raycast: async (): Promise<Hit> => null,
  };
}

describe('freecam guard', () => {
  it('stops at the wall contact and removes the velocity into it', async () => {
    const g = createFreeGuard();
    const phys = wallWorld(5);
    const rig = createFreeRigState({ x: 0, y: 10, z: 0 }, 0, 0, 10);
    stepFreeGuard(g, rig, phys); // 시작 확인(레이 없음 → 바깥)
    await flush();
    stepFreeGuard(g, rig, phys);
    expect(g.valid).toBe(true);
    rig.posWF.x = 6;
    rig.velWF.x = 20;
    rig.velWF.z = 3;
    stepFreeGuard(g, rig, phys); // 쓸기 0 → 6
    await flush();
    expect(stepFreeGuard(g, rig, phys)).toBe(true);
    expect(rig.posWF.x).toBeCloseTo(5 - CAMERA_RADIUS_M - 0.05, 6);
    expect(rig.velWF.x).toBeCloseTo(0, 9);
    expect(rig.velWF.z).toBe(3);
  });

  it('lets the camera slide along / move away from a wall it is touching', async () => {
    const g = createFreeGuard();
    const phys = wallWorld(5);
    const rig = createFreeRigState({ x: 5 - CAMERA_RADIUS_M, y: 10, z: 0 }, 0, 0, 10);
    stepFreeGuard(g, rig, phys);
    await flush();
    stepFreeGuard(g, rig, phys);
    rig.posWF.x -= 2; // 멀어짐
    stepFreeGuard(g, rig, phys);
    await flush();
    expect(stepFreeGuard(g, rig, phys)).toBe(false);
    expect(g.safe.x).toBeCloseTo(3 - CAMERA_RADIUS_M, 9);
  });

  it('pushes the camera out of a closed slab through the nearest back face', async () => {
    const g = createFreeGuard();
    // 두께 1 m 판(y 0–1) 안 y = 0.6: 위 0.4 m·아래 0.6 m·옆 10 m 뒷면(법선 = 레이 방향).
    const phys = {
      sphereCast: async (): Promise<Hit> => null,
      raycast: async (_o: Vec3d, d: Vec3): Promise<Hit> => hit(d.y > 0 ? 0.4 : d.y < 0 ? 0.6 : 10, { ...d }),
    };
    const rig = createFreeRigState({ x: 0, y: 0.6, z: 0 }, 0, 0, 10);
    rig.velWF.x = 5;
    stepFreeGuard(g, rig, phys);
    await flush();
    expect(stepFreeGuard(g, rig, phys)).toBe(true);
    expect(rig.posWF.y).toBeCloseTo(0.6 + 0.4 + CAMERA_RADIUS_M + 0.05, 9);
    expect(rig.velWF.x).toBe(0);
    expect(g.pushes).toBe(1);
  });

  it('does not move a camera that starts outside (front faces only) and ignores stale results after reset', async () => {
    const g = createFreeGuard();
    const phys = {
      sphereCast: async (): Promise<Hit> => null,
      raycast: async (_o: Vec3d, d: Vec3): Promise<Hit> => (d.y < 0 ? hit(5, { x: 0, y: 1, z: 0 }) : null),
    };
    const rig = createFreeRigState({ x: 1, y: 5, z: 1 }, 0, 0, 10);
    stepFreeGuard(g, rig, phys);
    resetFreeGuard(g); // 진입 직후 순간이동 — 앞 결과 버림
    await flush();
    expect(g.valid).toBe(false);
    stepFreeGuard(g, rig, phys);
    await flush();
    expect(stepFreeGuard(g, rig, phys)).toBe(false);
    expect(rig.posWF).toEqual({ x: 1, y: 5, z: 1 });
    expect(g.valid).toBe(true);
  });
});
