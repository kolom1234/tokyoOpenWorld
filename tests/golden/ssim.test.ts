import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lumaOf, ssimGray } from './ssim.ts';

function noise(w: number, h: number, seed: number): Uint8Array {
  const a = new Uint8Array(w * h);
  let s = seed >>> 0;
  for (let i = 0; i < a.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    a[i] = s >>> 24;
  }
  return a;
}

describe('ssimGray', () => {
  it('is 1 for identical images and drops for unrelated ones', () => {
    const a = noise(64, 48, 1);
    expect(ssimGray(a, a, 64, 48)).toBeCloseTo(1, 12);
    expect(ssimGray(a, noise(64, 48, 2), 64, 48)).toBeLessThan(0.1);
  });

  it('stays above 0.99 for ±1 LSB dither but not for a shifted image', () => {
    const a = noise(64, 48, 3).map((v) => 40 + (v >> 1));
    const b = a.map((v, i) => v + ((i * 7) % 3) - 1);
    expect(ssimGray(a, b, 64, 48)).toBeGreaterThan(0.99);
    const shifted = new Uint8Array(a.length);
    shifted.set(a.subarray(3));
    expect(ssimGray(a, shifted, 64, 48)).toBeLessThan(0.5);
  });

  it('rejects size mismatch', () => {
    expect(() => ssimGray(new Uint8Array(4), new Uint8Array(4), 4, 2)).toThrow();
  });
});

describe('lumaOf', () => {
  it('uses Rec.709 weights', () => {
    expect([...lumaOf(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 255, 255, 255, 255]))]).toEqual([54, 182, 255]);
  });
});

describe('views.json', () => {
  const file = JSON.parse(readFileSync(join(import.meta.dirname, 'views.json'), 'utf8')) as {
    views: { id: string; core: boolean; eyeWF: number[]; lookWF: number[]; time: string }[];
  };
  it('has unique ids, 4 core views, 3-component coordinates and JST timestamps', () => {
    const ids = file.views.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(file.views.filter((v) => v.core).map((v) => v.id)).toEqual([
      'shibuya-scramble-noon',
      'shinjuku-west-highrise',
      'yoyogi-aerial-300m',
      'shibuya-residential-lowrise',
    ]);
    for (const v of file.views) {
      expect(v.id).toMatch(/^[a-z0-9-]{1,64}$/);
      expect(v.eyeWF).toHaveLength(3);
      expect(v.lookWF).toHaveLength(3);
      expect(v.time).toMatch(/\+09:00$/);
      expect(Number.isNaN(Date.parse(v.time))).toBe(false);
    }
  });
});
