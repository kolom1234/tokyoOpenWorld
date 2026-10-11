// 계절 파라미터(10 §3, M09-T05): content/sim/season.json 키프레임(dayOfYear) → SeasonParams 선형 보간(연말 → 연초 이어짐).
// foliageTint 0 = 여름 초록 … 1 = 단풍 절정, bloom = 벚꽃 0–1, leafDensity = 낙엽수 잎 밀도, outfitPalette 0 = 여름 옷 … 1 = 겨울 코트.
// 나무 색·잎은 render trees/season.ts가 dayOfYear로 직접 고른다(수종별) — 이 값은 군중 옷차림·다른 소비자용 공통 지표.
import type { SeasonParams } from '@sanpo/core';
import type { SeasonTableFile } from '../api.ts';

type Key = SeasonTableFile['keys'][number];

/** 표가 없을 때 기본(도쿄 평년 근사). */
export const DEFAULT_SEASON_TABLE: SeasonTableFile = {
  keys: [
    { day: 1, foliageTint: 0, bloom: 0, leafDensity: 0.25, outfitPalette: 1 },
    { day: 60, foliageTint: 0, bloom: 0, leafDensity: 0.25, outfitPalette: 0.85 },
    { day: 84, foliageTint: 0, bloom: 0.6, leafDensity: 0.35, outfitPalette: 0.6 },
    { day: 92, foliageTint: 0, bloom: 1, leafDensity: 0.45, outfitPalette: 0.5 },
    { day: 105, foliageTint: 0, bloom: 0, leafDensity: 0.8, outfitPalette: 0.4 },
    { day: 160, foliageTint: 0, bloom: 0, leafDensity: 1, outfitPalette: 0.1 },
    { day: 200, foliageTint: 0, bloom: 0, leafDensity: 1, outfitPalette: 0 },
    { day: 260, foliageTint: 0, bloom: 0, leafDensity: 1, outfitPalette: 0.1 },
    { day: 300, foliageTint: 0.4, bloom: 0, leafDensity: 0.95, outfitPalette: 0.45 },
    { day: 325, foliageTint: 1, bloom: 0, leafDensity: 0.8, outfitPalette: 0.7 },
    { day: 345, foliageTint: 0.6, bloom: 0, leafDensity: 0.4, outfitPalette: 0.9 },
  ],
};

const DAYS = 365;

export function seasonFromTable(dayOfYear: number, t: SeasonTableFile = DEFAULT_SEASON_TABLE): SeasonParams {
  const keys = [...t.keys].sort((a, b) => a.day - b.day);
  const d = ((dayOfYear - 1) % DAYS) + 1;
  let a = keys[keys.length - 1] as Key;
  let b = keys[0] as Key;
  let span = b.day + DAYS - a.day;
  let u = (d < b.day ? d + DAYS : d) - a.day;
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i] as Key;
    const k1 = keys[i + 1] as Key;
    if (d >= k0.day && d < k1.day) {
      a = k0;
      b = k1;
      span = k1.day - k0.day;
      u = d - k0.day;
      break;
    }
  }
  const f = span > 0 ? u / span : 0;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return {
    dayOfYear,
    foliageTint: lerp(a.foliageTint, b.foliageTint),
    bloom: lerp(a.bloom, b.bloom),
    leafDensity: lerp(a.leafDensity, b.leafDensity),
    outfitPalette: lerp(a.outfitPalette, b.outfitPalette),
  };
}
