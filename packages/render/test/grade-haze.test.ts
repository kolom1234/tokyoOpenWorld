// 분위기 그레이딩·도시 연무(M12-T03): 낮 프리셋 = M03-T07 LUT 그대로, 분위기 가중·프리셋 성질, LUT 조각 재굽기, 계절·바람 연무.
import { describe, expect, it } from 'vitest';
import {
  createGradeLut,
  createGradeUpdater,
  GRADE_DAY,
  GRADE_GOLDEN,
  GRADE_NIGHT,
  GRADE_OVERCAST,
  type GradeParams,
  grade,
  gradeParamsOf,
  gradeWeights,
  LUT_SIZE,
} from '../src/internal/post/lut.ts';
import { urbanHazeOf } from '../src/internal/post/weather-sky.ts';

/** M03-T07 LUT 식(바뀌면 안 되는 낮 기준). */
function legacy(r: number, g: number, b: number): [number, number, number] {
  const c = (x: number) => Math.min(Math.max(x, 0), 1);
  const s = (x: number, k: number) => c(0.5 + (x - 0.5) * (1 + k) - k * 4 * (x - 0.5) ** 3);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  let [rr, gg, bb] = [luma + (r - luma) * 1.06, luma + (g - luma) * 1.06, luma + (b - luma) * 1.06];
  const shadow = (1 - luma) ** 2 * 0.02;
  const high = luma ** 2 * 0.015;
  rr += high - shadow * 0.5;
  bb += shadow - high * 0.5;
  return [s(c(rr), 0.12), s(c(gg), 0.12), s(c(bb), 0.12)];
}

const spread = (p: GradeParams): number => grade(0.9, 0.9, 0.9, p)[0] - grade(0.1, 0.1, 0.1, p)[0];
const chroma = (p: GradeParams): number => {
  const [r, g, b] = grade(0.7, 0.4, 0.3, p);
  return Math.max(r, g, b) - Math.min(r, g, b);
};
const clear = { cover: 0, rainMmH: 0, fog: 0 };
const DAY = 86_400_000;

describe('mood grading (M12-T03)', () => {
  it('keeps the clear-day LUT identical to M03-T07', () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [0.2, 0.5, 0.8],
      [0.95, 0.6, 0.1],
      [1, 1, 1],
    ] as const)
      expect(grade(r, g, b)).toEqual(legacy(r, g, b));
    expect(gradeParamsOf({ sunY: 0.7, night: 0, ...clear })).toEqual({ ...GRADE_DAY, tint: [0, 0, 0] });
  });

  it('weights sum to 1 and pick the right mood', () => {
    const cases = [
      { m: { sunY: 0.7, night: 0, ...clear }, top: 'day' },
      { m: { sunY: 0.7, night: 0, cover: 0, rainMmH: 6, fog: 0 }, top: 'overcast' },
      { m: { sunY: 0.07, night: 0, ...clear }, top: 'golden' },
      { m: { sunY: -0.4, night: 1, ...clear }, top: 'night' },
    ] as const;
    for (const { m, top } of cases) {
      const w = gradeWeights(m);
      expect(w.day + w.overcast + w.golden + w.night).toBeCloseTo(1, 9);
      const best = Object.entries(w).sort((a, b) => b[1] - a[1])[0]?.[0];
      expect(best, JSON.stringify(m)).toBe(top);
    }
  });

  it('presets do what they say: overcast flatter and greyer, night less saturated, golden warmer', () => {
    expect(spread(GRADE_OVERCAST)).toBeLessThan(spread(GRADE_DAY));
    expect(chroma(GRADE_OVERCAST)).toBeLessThan(chroma(GRADE_DAY));
    expect(chroma(GRADE_NIGHT)).toBeLessThan(chroma(GRADE_DAY));
    const warmth = (p: GradeParams) => {
      const [r, , b] = grade(0.85, 0.85, 0.85, p);
      return r - b;
    };
    expect(warmth(GRADE_GOLDEN)).toBeGreaterThan(warmth(GRADE_DAY));
  });

  it('rebakes the LUT in slices only when the mood changes, then swaps once', () => {
    const lut = createGradeLut();
    const data = lut.image.data as Uint8Array;
    const before = data.slice();
    const up = createGradeUpdater(lut, 0.5);
    expect(up.update({ sunY: 0.7, night: 0, ...clear }, 0)).toBe(false); // 같은 키
    const night = { sunY: -0.4, night: 1, ...clear };
    let swaps = 0;
    let steps = 0;
    while (steps < 20 && swaps === 0) {
      if (up.update(night, 1 + steps * 0.016)) swaps++;
      steps++;
      if (swaps === 0) expect(data).toEqual(before); // 다 굽기 전엔 교체 없음
    }
    expect(swaps).toBe(1);
    expect(steps).toBe(LUT_SIZE / 4);
    expect(data).toEqual(createGradeLut(GRADE_NIGHT).image.data);
    expect(up.update(night, 2)).toBe(false);
  });
});

describe('urban haze (M12-T03)', () => {
  const jan15 = Date.UTC(2026, 0, 15, 3);
  const jul15 = Date.UTC(2026, 6, 15, 3);
  it('is clearer in winter than in humid summer (Koschmieder visibility ≈ 39 km ↔ 16 km)', () => {
    expect(3.912 / urbanHazeOf(jan15, 0) / 1000).toBeCloseTo(39.1, 0);
    expect(3.912 / urbanHazeOf(jul15, 0) / 1000).toBeCloseTo(16.3, 0);
    expect(urbanHazeOf(jan15 + 90 * DAY, 0)).toBeGreaterThan(urbanHazeOf(jan15, 0));
  });
  it('is thinned by wind and deterministic', () => {
    expect(urbanHazeOf(jul15, 6)).toBeCloseTo(urbanHazeOf(jul15, 0) / 2, 12);
    expect(urbanHazeOf(jul15, 3)).toBe(urbanHazeOf(jul15, 3));
  });
});
