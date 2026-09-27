// FreeRig: 방향 규약·롤 잠금·관성·휠 속도·고도/지면 제한. see docs/09-traversal.md §2–3
import { vec3ApplyQuat } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import {
  createFreeRigState,
  type FreeRigIntent,
  forwardOf,
  lookAtAngles,
  rigQuat,
  stepFreeRig,
} from '../src/internal/camera/free-rig.ts';
import { DEFAULT_TRAVERSAL_SETTINGS } from '../src/internal/settings.ts';

const cfg = DEFAULT_TRAVERSAL_SETTINGS.freecam;
const idle: FreeRigIntent = {
  moveX: 0,
  moveY: 0,
  fly: 0,
  yawDeltaRad: 0,
  pitchDeltaRad: 0,
  wheelNotches: 0,
  sprint: false,
};

describe('FreeRig orientation', () => {
  it('yaw 0 looks grid north (−Z), yaw +90° looks west (−X), pitch + looks up', () => {
    const n = forwardOf(0, 0);
    expect(n.z).toBeCloseTo(-1);
    const w = forwardOf(Math.PI / 2, 0);
    expect(w.x).toBeCloseTo(-1);
    expect(forwardOf(0, Math.PI / 4).y).toBeCloseTo(Math.SQRT1_2);
  });

  it('rigQuat rotates the three.js camera forward (−Z) onto forwardOf', () => {
    for (const [yaw, pitch] of [
      [0.3, -0.2],
      [2.5, 0.7],
      [-1.2, 0],
    ] as const) {
      const q = rigQuat({ x: 0, y: 0, z: 0, w: 1 }, yaw, pitch);
      const v = vec3ApplyQuat({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, q);
      const f = forwardOf(yaw, pitch);
      expect(v.x).toBeCloseTo(f.x, 12);
      expect(v.y).toBeCloseTo(f.y, 12);
      expect(v.z).toBeCloseTo(f.z, 12);
      // 롤 잠금: 카메라 오른쪽 벡터는 항상 수평.
      expect(vec3ApplyQuat({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, q).y).toBeCloseTo(0, 12);
    }
  });

  it('lookAtAngles inverts forwardOf', () => {
    const from = { x: -60, y: 75, z: -15 };
    const to = { x: 130.8, y: 130, z: 132.5 };
    const a = lookAtAngles(from, to);
    const f = forwardOf(a.yawRad, a.pitchRad);
    const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    expect(f.x).toBeCloseTo((to.x - from.x) / d, 12);
    expect(f.y).toBeCloseTo((to.y - from.y) / d, 12);
    expect(f.z).toBeCloseTo((to.z - from.z) / d, 12);
  });
});

describe('stepFreeRig', () => {
  it('accelerates with inertia toward speed × forward (damping 3/s)', () => {
    const s = createFreeRigState({ x: 0, y: 100, z: 0 }, 0, 0, 10);
    stepFreeRig(s, { ...idle, moveY: 1 }, 1, cfg, undefined);
    expect(s.velWF.z).toBeCloseTo(-10 * (1 - Math.exp(-3)), 9);
    for (let i = 0; i < 100; i++) stepFreeRig(s, { ...idle, moveY: 1 }, 0.05, cfg, undefined);
    expect(s.velWF.z).toBeCloseTo(-10, 3);
    for (let i = 0; i < 100; i++) stepFreeRig(s, idle, 0.05, cfg, undefined);
    expect(Math.abs(s.velWF.z)).toBeLessThan(0.01);
  });

  it('wheel scales speed within 0.5–60 m/s; sprint multiplies target speed', () => {
    const s = createFreeRigState({ x: 0, y: 100, z: 0 }, 0, 0, 15);
    stepFreeRig(s, { ...idle, wheelNotches: 1 }, 0.016, cfg, undefined);
    expect(s.speedMs).toBeCloseTo(18.75);
    stepFreeRig(s, { ...idle, wheelNotches: 50 }, 0.016, cfg, undefined);
    expect(s.speedMs).toBe(60);
    stepFreeRig(s, { ...idle, wheelNotches: -100 }, 0.016, cfg, undefined);
    expect(s.speedMs).toBe(0.5);
    const t = createFreeRigState({ x: 0, y: 100, z: 0 }, 0, 0, 10);
    for (let i = 0; i < 200; i++) stepFreeRig(t, { ...idle, moveX: 1, sprint: true }, 0.05, cfg, undefined);
    expect(t.velWF.x).toBeCloseTo(40, 2);
  });

  it('E/Q moves along world up regardless of pitch; clamps to altitude cap and ground clearance', () => {
    const s = createFreeRigState({ x: 0, y: 995, z: 0 }, 0, -1, 60);
    for (let i = 0; i < 100; i++) stepFreeRig(s, { ...idle, fly: 1 }, 0.05, cfg, undefined);
    expect(s.posWF.y).toBe(1000);
    expect(s.velWF.y).toBe(0);
    const g = createFreeRigState({ x: 0, y: 20, z: 0 }, 0, 0, 60);
    for (let i = 0; i < 100; i++) stepFreeRig(g, { ...idle, fly: -1 }, 0.05, cfg, 15);
    expect(g.posWF.y).toBe(16);
  });

  it('mouse look clamps pitch to ±89°', () => {
    const s = createFreeRigState({ x: 0, y: 100, z: 0 }, 0, 0, 10);
    stepFreeRig(s, { ...idle, pitchDeltaRad: 10 }, 0.016, cfg, undefined);
    expect(s.pitchRad).toBeCloseTo((89 * Math.PI) / 180);
  });
});
