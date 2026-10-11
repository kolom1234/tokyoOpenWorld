// 앰비언스 베드 믹스(11 §2 시간·날씨 변조, M09-T04 — ADR-0079): 존 가중 × 낮/밤 × 계절 × 비·바람·고도 → 베드별 목표 이득(선형).
// 순수 함수 — 실제 램프는 beds.ts. 베드 id = content/audio/library.json outputs(kind bed).
import type { AudioZoneKind } from '@sanpo/tile-format';
import type { AudioEnv } from '../api.ts';

export const BED_IDS = [
  'street-day',
  'street-night',
  'crowd',
  'shopping',
  'residential-day',
  'residential-night',
  'park',
  'birds',
  'insects-night',
  'station',
  'rain-street',
  'rain-light',
  'rain-umbrella',
  'wind',
  'traffic-far',
] as const;
export type BedId = (typeof BED_IDS)[number];
export type BedGains = Record<BedId, number>;

const JST_MS = 9 * 3_600_000;
const DAY_MS = 86_400_000;

/** JST 기준 달(1–12). */
export function monthJst(ms: number): number {
  return new Date(ms + JST_MS).getUTCMonth() + 1;
}

/** 매미(7–9월 낮)·풀벌레(8–10월 밤, 7월 약하게). */
function seasonOf(ms: number): { cicada: number; insects: number } {
  const m = monthJst(ms);
  const cicada = m >= 7 && m <= 9 ? 1 : 0;
  const insects = m >= 8 && m <= 10 ? 1 : m === 7 || m === 11 ? 0.4 : 0.1;
  return { cicada, insects };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function zero(): BedGains {
  return Object.fromEntries(BED_IDS.map((b) => [b, 0])) as BedGains;
}

/** 종류 하나(가중 1)의 베드 구성. */
function kindBeds(kind: AudioZoneKind, env: AudioEnv, s: { cicada: number; insects: number }): Partial<BedGains> {
  const n = clamp01(env.night);
  const d = 1 - n;
  const crowd = clamp01(env.crowd);
  switch (kind) {
    case 'crossing':
      return { 'street-day': 0.6 * d, 'street-night': 0.5 * n, crowd: 0.35 + 0.65 * crowd };
    case 'shopping':
      return { shopping: (0.45 + 0.55 * crowd) * (d + 0.6 * n), 'street-night': 0.25 * n, crowd: 0.15 * crowd };
    case 'alley':
      return s.cicada > 0
        ? { 'residential-day': 0.7 * d, 'residential-night': 0.75 * n * s.insects, 'traffic-far': 0.25 * n }
        : { 'traffic-far': 0.5 * d + 0.35 * n, birds: 0.2 * d, 'residential-night': 0.6 * n * s.insects };
    case 'park':
      return { park: 0.7 * d, birds: 0.45 * d, 'insects-night': 0.85 * n * s.insects, 'traffic-far': 0.3 * n };
    case 'station':
      return { station: 0.75 + 0.25 * crowd, crowd: 0.1 * crowd };
    case 'elevated':
      return { 'street-day': 0.45 * d, 'street-night': 0.45 * n, 'traffic-far': 0.55 };
    default:
      return { 'street-day': 0.8 * d, 'street-night': 0.8 * n, crowd: 0.25 * crowd };
  }
}

/**
 * 목표 이득. aglM = 리스너 지면 위 높이(상공은 거리 베드가 빠지고 먼 차량·바람만), indoor = station 가중(빗소리 차단).
 */
export function bedGains(weights: Record<AudioZoneKind, number>, env: AudioEnv, aglM: number): BedGains {
  const g = zero();
  const s = seasonOf(env.gameTimeMs);
  for (const [k, w] of Object.entries(weights) as [AudioZoneKind, number][]) {
    if (w <= 0) continue;
    for (const [b, v] of Object.entries(kindBeds(k, env, s)) as [BedId, number][]) g[b] += w * v;
  }
  const ground = 1 - clamp01((aglM - 25) / 125);
  for (const b of BED_IDS) g[b] *= ground;
  g['traffic-far'] += 0.45 * (1 - ground);
  const indoor = clamp01(weights.station);
  const rain = clamp01(env.rainMmH / 6) * (1 - 0.85 * indoor);
  g['rain-light'] = 0.6 * clamp01(env.rainMmH / 1.5) * (1 - clamp01(env.rainMmH / 8)) * (1 - 0.85 * indoor);
  g['rain-street'] = 0.85 * rain * ground;
  g['rain-umbrella'] = env.umbrella ? 0.65 * rain * ground : 0;
  g.wind = clamp01((env.windMs - 2.5) / 10) * 0.55 * (1 - 0.7 * indoor) + 0.35 * (1 - ground);
  for (const b of BED_IDS) g[b] = clamp01(g[b]);
  return g;
}

/** 하루 안 시각(ms, JST 0시 기준) — 군중 곡선 등. */
export function msOfDayJst(ms: number): number {
  return (((ms + JST_MS) % DAY_MS) + DAY_MS) % DAY_MS;
}
