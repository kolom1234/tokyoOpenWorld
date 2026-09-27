// mergeConfig 딥 머지 규칙, Result 헬퍼, Vec3d/Quat 연산. see docs/15-conventions.md §4,§5,§8
import { describe, expect, it } from 'vitest';
import {
  err,
  mapResult,
  mergeConfig,
  ok,
  quatFromAxisAngle,
  quatFromYaw,
  quatIdentity,
  quatMultiply,
  quatSlerp,
  unwrapOr,
  vec3,
  vec3ApplyQuat,
  vec3Cross,
  vec3Distance,
  vec3Normalize,
  vec3Sub,
} from '../src/index.ts';

describe('mergeConfig', () => {
  const defaults = { tier: 'high', streaming: { radiusM: 800, maxInflight: 6 }, spawn: ['shibuya'], debug: false };

  it('deep-merges plain objects; later overrides win; arrays replaced', () => {
    const out = mergeConfig(defaults, { streaming: { radiusM: 400 } }, { spawn: ['shinjuku'], debug: true });
    expect(out).toEqual({
      tier: 'high',
      streaming: { radiusM: 400, maxInflight: 6 },
      spawn: ['shinjuku'],
      debug: true,
    });
  });

  it('does not mutate inputs or share nested references', () => {
    const override = { streaming: { maxInflight: 2 } };
    const out = mergeConfig(defaults, override);
    out.streaming.radiusM = 1;
    out.spawn.push('x');
    expect(defaults.streaming.radiusM).toBe(800);
    expect(defaults.spawn).toEqual(['shibuya']);
    expect(override).toEqual({ streaming: { maxInflight: 2 } });
  });

  it('ignores undefined values and blocks prototype pollution', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "streaming": {"constructor": {"x": 1}}}');
    const out = mergeConfig(defaults, { tier: undefined }, evil);
    expect(out.tier).toBe('high');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(out.streaming, 'constructor')).toBe(false);
  });
});

describe('Result helpers', () => {
  it('ok/err/unwrapOr/mapResult', () => {
    expect(unwrapOr(ok(2), 0)).toBe(2);
    expect(unwrapOr(err(new Error('x')), 0)).toBe(0);
    expect(mapResult(ok(2), (v) => v * 3)).toEqual({ ok: true, value: 6 });
    const e = err('bad');
    expect(mapResult(e, (v: number) => v)).toBe(e);
  });
});

describe('math', () => {
  const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    expect(a.x).toBeCloseTo(b.x, 12);
    expect(a.y).toBeCloseTo(b.y, 12);
    expect(a.z).toBeCloseTo(b.z, 12);
  };

  it('vec3 basics keep float64 precision at WF scale', () => {
    const a = vec3(12_345.678901, 40.5, -6_789.012345);
    const b = vec3(12_345.678902, 40.5, -6_789.012345);
    expect(vec3Distance(a, b)).toBeCloseTo(1e-6, 9);
    expect(vec3Sub(vec3(), b, a).x).toBeCloseTo(1e-6, 9);
  });

  it('cross / normalize (incl. zero vector)', () => {
    close(vec3Cross(vec3(), vec3(1, 0, 0), vec3(0, 1, 0)), vec3(0, 0, 1));
    close(vec3Normalize(vec3(), vec3(3, 0, 4)), vec3(0.6, 0, 0.8));
    expect(vec3Normalize(vec3(), vec3())).toEqual(vec3());
  });

  it('yaw +90° turns forward (-Z, north) to -X (west)', () => {
    const q = quatFromYaw(quatIdentity(), Math.PI / 2);
    close(vec3ApplyQuat(vec3(), vec3(0, 0, -1), q), vec3(-1, 0, 0));
  });

  it('quatMultiply composes rotations (b first, then a); in-place safe', () => {
    const yaw = quatFromYaw(quatIdentity(), Math.PI / 2);
    const pitch = quatFromAxisAngle(quatIdentity(), vec3(1, 0, 0), Math.PI / 2);
    const q = quatMultiply(quatIdentity(), yaw, pitch);
    // pitch: +Y → +Z(남), 이어서 yaw: +Z → +X(동)
    close(vec3ApplyQuat(vec3(), vec3(0, 1, 0), q), vec3(1, 0, 0));
    const inPlace = quatMultiply(yaw, yaw, pitch);
    expect(inPlace).toEqual(q);
  });

  it('slerp endpoints and midpoint', () => {
    const a = quatIdentity();
    const b = quatFromYaw(quatIdentity(), Math.PI / 2);
    const mid = quatSlerp(quatIdentity(), a, b, 0.5);
    const expected = quatFromYaw(quatIdentity(), Math.PI / 4);
    expect(mid.y).toBeCloseTo(expected.y, 12);
    expect(mid.w).toBeCloseTo(expected.w, 12);
    expect(quatSlerp(quatIdentity(), a, b, 1).y).toBeCloseTo(b.y, 12);
  });
});
