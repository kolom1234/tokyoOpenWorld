// rng 재현성·분포, hash32 결정성·충돌 구분. see docs/15-conventions.md §7
import { describe, expect, it } from 'vitest';
import { createRng, hash32, WORLD_SEED } from '../src/index.ts';

const take = (seed: number, n: number): number[] => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r.next());
};

describe('createRng (xoshiro128**)', () => {
  it('same seed → identical sequence', () => {
    expect(take(12345, 1000)).toEqual(take(12345, 1000));
  });

  it('different seeds → different sequences', () => {
    expect(take(1, 16)).not.toEqual(take(2, 16));
  });

  it('seed is truncated to 32 bits', () => {
    expect(take(2 ** 32 + 7, 8)).toEqual(take(7, 8));
    expect(take(-1, 8)).toEqual(take(0xffffffff, 8));
  });

  it('matches golden values (cross-platform regression guard)', () => {
    const r = createRng(WORLD_SEED);
    const u32 = Array.from({ length: 4 }, () => Math.floor(r.next() * 2 ** 32));
    expect(u32).toMatchInlineSnapshot(`
      [
        2984229574,
        3881939267,
        4082448948,
        3280848069,
      ]
    `);
  });

  it('next() ∈ [0,1) with sane mean', () => {
    const xs = take(99, 20000);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });

  it('int() stays in [min, maxExcl) and hits every value', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(-3, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(4);
      seen.add(v);
    }
    expect(seen.size).toBe(7);
  });

  it('int() rejects empty/invalid ranges; pick() rejects empty array', () => {
    const r = createRng(1);
    expect(() => r.int(5, 5)).toThrow(RangeError);
    expect(() => r.int(0, 1.5)).toThrow(RangeError);
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it('pick() returns array members deterministically', () => {
    const items = ['a', 'b', 'c'] as const;
    const a = createRng(8);
    const b = createRng(8);
    for (let i = 0; i < 50; i++) {
      const v = a.pick(items);
      expect(items).toContain(v);
      expect(b.pick(items)).toBe(v);
    }
  });
});

describe('hash32', () => {
  it('is deterministic and unsigned 32-bit', () => {
    const h = hash32(WORLD_SEED, 'L0_-1_0', 'trees', 42);
    expect(h).toBe(hash32(WORLD_SEED, 'L0_-1_0', 'trees', 42));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('matches golden values', () => {
    expect([hash32(), hash32(0), hash32('a'), hash32(WORLD_SEED, 'L0_0_0', 0)]).toMatchInlineSnapshot(`
      [
        46947589,
        563309949,
        3415146708,
        3953306953,
      ]
    `);
  });

  it('distinguishes type, order, arity and part boundaries', () => {
    const hs = [
      hash32(1),
      hash32('1'),
      hash32(-1),
      hash32(0xffffffff),
      hash32(1.5),
      hash32(1, 2),
      hash32(2, 1),
      hash32(1, 2, 0),
      hash32('ab', 'c'),
      hash32('a', 'bc'),
      hash32('abc'),
      hash32(''),
      hash32(),
    ];
    expect(new Set(hs).size).toBe(hs.length);
  });

  it('has no collisions over a small index sweep', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) seen.add(hash32(WORLD_SEED, 'cell', i));
    expect(seen.size).toBe(10000);
  });
});
