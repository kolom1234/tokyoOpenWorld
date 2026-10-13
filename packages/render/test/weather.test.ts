// M09-T01 렌더 날씨: 빗줄기 층 밀도·눈 판정·밤 밝기, 우산 비율·variant 해시 결정론.
import { describe, expect, it } from 'vitest';
import { umbrellaShare, variantHash } from '../src/internal/crowd/umbrella.ts';
import { createRainField, RAIN_LAYERS } from '../src/internal/weather/rain.ts';

const base = { snow: 0, windX: 1, windZ: -2, night: 0, dtS: 1 / 60, pxAngle: 0.0013 };

describe('rain field', () => {
  it('maps rain intensity to cell density, snow wins only when it dominates', () => {
    const r = createRainField();
    r.update({ ...base, rainMmH: 0 });
    expect(r.active).toBe(false);
    expect(r.stats().count).toBe(0);
    r.update({ ...base, rainMmH: 4 });
    expect(r.stats()).toEqual({ count: RAIN_LAYERS.length, density: 0.4, snow: false });
    r.update({ ...base, rainMmH: 40 });
    expect(r.stats().density).toBeCloseTo(0.7, 9);
    r.update({ ...base, rainMmH: 0, snow: 0.8 });
    expect(r.stats().snow).toBe(true);
    const day = r.uniforms.brightness.value;
    r.update({ ...base, rainMmH: 0, snow: 0.8, night: 1 });
    expect(r.uniforms.brightness.value).toBeLessThan(day);
  });
});

describe('umbrellas', () => {
  it('share grows with rain and is 0 when dry; variant hash is deterministic in [0, 1)', () => {
    expect(umbrellaShare(0.1)).toBe(0);
    expect(umbrellaShare(1)).toBeGreaterThan(0.4);
    expect(umbrellaShare(50)).toBeLessThanOrEqual(0.88);
    const a = Array.from({ length: 2000 }, (_, v) => variantHash(v, 1));
    expect(a.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(variantHash(123, 1)).toBe(variantHash(123, 1));
    const under = a.filter((x) => x < 0.5).length / a.length;
    expect(Math.abs(under - 0.5)).toBeLessThan(0.05);
  });
});

describe('cloud layer CPU twin', () => {
  it('tslHash is in [0, 1) and deterministic; sun occlusion grows with cover', async () => {
    const { cloudAlphaCpu, createWeatherSkyUniforms, tslHash } = await import('../src/internal/post/weather-sky.ts');
    for (const s of [0, 1, 2, 12345, 2 ** 23]) {
      expect(tslHash(s)).toBeGreaterThanOrEqual(0);
      expect(tslHash(s)).toBeLessThan(1);
      expect(tslHash(s)).toBe(tslHash(s));
    }
    const u = createWeatherSkyUniforms();
    const cam = { x: 0, y: 30, z: 0 };
    const mean = (cover: number) => {
      u.cover.value = cover;
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const c = { ...cam, x: (i % 20) * 3100, z: Math.floor(i / 20) * 2900 };
        sum += cloudAlphaCpu(u, { x: 0.36, y: 0.8, z: 0.48 }, c);
      }
      return sum / 400;
    };
    expect(mean(0)).toBe(0);
    expect(mean(0.4)).toBeGreaterThan(0.05);
    expect(mean(1)).toBeGreaterThan(0.9);
    expect(mean(0.4)).toBeLessThan(mean(0.8));
  });
});
