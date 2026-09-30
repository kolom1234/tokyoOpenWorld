// 아바타(M04-T05): 원점 기준 위치·yaw, 속도 블렌드(대기 = 팔다리 정지, 달리기 = 큰 진폭·앞 기울기), 근접 페이드·숨김.
import type { AvatarState } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { createAvatar } from '../src/internal/scene/avatar.ts';

const base: AvatarState = {
  visible: true,
  posWF: { x: 1000.5, y: 16, z: -2000.25 },
  yawRad: 0.5,
  speedMs: 0,
  grounded: true,
  opacity: 1,
};

/** 몸통 Group의 자식 = [몸, 머리, 왼팔, 오른팔], 그룹 자식 = [몸통, 왼다리, 오른다리]. */
function legAmp(a: ReturnType<typeof createAvatar>, speedMs: number): { max: number; lean: number } {
  a.set({ ...base, speedMs });
  let max = 0;
  for (let i = 0; i < 120; i++) {
    a.update(1 / 60, { x: 1024, y: 0, z: -2048 });
    max = Math.max(max, Math.abs(a.group.children[1]?.rotation.x ?? 0));
  }
  return { max, lean: a.group.children[0]?.rotation.x ?? 0 };
}

describe('avatar', () => {
  it('places the feet relative to the render origin and faces yaw', () => {
    const a = createAvatar();
    a.set(base);
    a.update(1 / 60, { x: 1024, y: 0, z: -2048 });
    expect(a.group.visible).toBe(true);
    expect(a.group.position.x).toBeCloseTo(-23.5, 9);
    expect(a.group.position.y).toBeCloseTo(16, 9);
    expect(a.group.position.z).toBeCloseTo(47.75, 9);
    expect(a.group.rotation.y).toBeCloseTo(0.5, 9);
    a.dispose();
  });

  it('blends idle → walk → run by speed (limb swing and forward lean)', () => {
    const a = createAvatar();
    const idle = legAmp(a, 0);
    const walk = legAmp(a, 1.35);
    const run = legAmp(a, 5);
    expect(idle.max).toBeLessThan(0.05);
    expect(walk.max).toBeGreaterThan(0.3);
    expect(walk.max).toBeLessThan(0.5);
    expect(run.max).toBeGreaterThan(0.65);
    expect(walk.lean).toBeCloseTo(0, 9);
    expect(run.lean).toBeLessThan(-0.1);
    a.dispose();
  });

  it('hides when invisible or fully faded', () => {
    const a = createAvatar();
    a.set({ ...base, opacity: 0 });
    a.update(1 / 60, { x: 0, y: 0, z: 0 });
    expect(a.group.visible).toBe(false);
    a.set({ ...base, visible: false });
    a.update(1 / 60, { x: 0, y: 0, z: 0 });
    expect(a.group.visible).toBe(false);
    a.dispose();
  });
});
