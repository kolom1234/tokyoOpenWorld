// 벽 평면 묶기·동일 평면 부속물 판정(M03-T04).
import { describe, expect, it } from 'vitest';
import { coplanarWithAny, wallSpans } from '../src/stages/build/wall-planes.ts';

const face = (x0: number, x1: number, z = 0, nz = 1) => ({
  normal: [0, 0, nz],
  vertices: [x0, 0, z, x1, 0, z, x1, 3, z],
});

describe('wallSpans', () => {
  it('shares one u range across strips of the same plane, even across rounding boundaries', () => {
    const s = wallSpans([face(0, 2), face(2, 5, 0.149), face(5, 9, 0.02)]);
    expect(s[0]).toBe(s[1]);
    expect(s[0]).toBe(s[2]);
    expect((s[0]?.u1 ?? 0) - (s[0]?.u0 ?? 0)).toBeCloseTo(9, 9);
  });

  it('keeps parallel walls apart and separates facing directions', () => {
    const s = wallSpans([face(0, 2), face(0, 2, 1.0), face(0, 2, 0, -1)]);
    expect(s[0]).not.toBe(s[1]);
    expect(s[0]).not.toBe(s[2]);
  });
});

describe('coplanarWithAny', () => {
  it('detects installations glued onto a wall plane (≤ 6 cm)', () => {
    const walls = [face(0, 10)];
    expect(coplanarWithAny(face(2, 3, 0.05), walls)).toBe(true);
    expect(coplanarWithAny(face(2, 3, 0.3), walls)).toBe(false);
    expect(coplanarWithAny({ normal: [1, 0, 0], vertices: [0, 0, 0, 0, 1, 1, 0, 2, 0] }, walls)).toBe(false);
  });
});
