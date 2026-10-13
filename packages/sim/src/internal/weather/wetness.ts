// 노면 젖음 램프(07 §8 "wetness 0→1 (5분 게임시간)", M09-T01): 지난 historyH 시간 날씨를 stepMin 간격으로 적분 — 게임 시각 순수 함수(점프해도 같다).
// 비(≥ fullAtMmH)면 wetMin 분에 0 → 1, 약한 비는 비례해 느리게. 마름 = dryMin × (1 + 구름 × dryCloudK) × (밤 dryNightK) 분에 1 → 0. 눈은 젖음 절반 속도.
import type { WeatherParams } from '@sanpo/core';
import type { WeatherClimateFile } from '../../api.ts';

const JST_MS = 9 * 3_600_000;

/** 밤(19–6시 JST) — 증발이 느리다. */
const isNight = (ms: number): boolean => {
  const h = ((((ms + JST_MS) / 3_600_000) % 24) + 24) % 24;
  return h >= 19 || h < 6;
};

/** 한 걸음(dtMin) 젖음 갱신. */
export function stepWetness(
  w: number,
  p: Pick<WeatherParams, 'rainMmH' | 'snow' | 'cloudCover'>,
  dtMin: number,
  night: boolean,
  k: WeatherClimateFile['wetness'],
): number {
  const rain = Math.min(p.rainMmH / k.fullAtMmH, 1) + Math.min(p.snow, 1) * 0.5;
  if (rain > 0.02) return Math.min(1, w + (rain * dtMin) / k.wetMin);
  const dry = k.dryMin * (1 + p.cloudCover * k.dryCloudK) * (night ? k.dryNightK : 1);
  return Math.max(0, w - dtMin / dry);
}

/** 게임 시각의 젖음(0–1): ms − historyH부터 0으로 시작해 적분. paramsAt = 그 시각 날씨(젖음 제외). */
export function wetnessAt(
  c: WeatherClimateFile,
  ms: number,
  paramsAt: (ms: number) => Pick<WeatherParams, 'rainMmH' | 'snow' | 'cloudCover'>,
): number {
  const k = c.wetness;
  const stepMs = k.stepMin * 60_000;
  // 걸음 격자를 절대 시각에 맞춘다(같은 시각 = 같은 표본 → 결정론), 마지막 조각만 짧은 걸음.
  const end = Math.floor(ms / stepMs) * stepMs;
  let w = 0;
  for (let t = end - k.historyH * 3_600_000; t < end; t += stepMs)
    w = stepWetness(w, paramsAt(t), k.stepMin, isNight(t), k);
  const rest = (ms - end) / 60_000;
  return rest > 0 ? stepWetness(w, paramsAt(end), rest, isNight(end), k) : w;
}
