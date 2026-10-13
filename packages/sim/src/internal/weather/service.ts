// 날씨 서비스(10 §3·§8 WeatherService, M09-T01 — ADR-0076): auto(기후표 마르코프 + 젖음 적분, 게임 시각 순수 함수) / live(실시간 표본 + 젖음 램프) / fixed.
// 값은 게임 시각마다 캐시(같은 ms = 같은 객체), 젖음은 게임 1분 해상도로 다시 적분(그 사이는 이웃 분 선형 보간).
import type { WeatherParams } from '@sanpo/core';
import type { LiveWeatherSample, WeatherClimateFile, WeatherMode, WeatherService } from '../../api.ts';
import { liveParams } from './live-mapper.ts';
import { createMarkovCache, weatherAt } from './markov.ts';
import { stepWetness, wetnessAt } from './wetness.ts';

export const CLEAR_WEATHER: WeatherParams = {
  cloudCover: 0,
  rainMmH: 0,
  fog: 0,
  windMs: 2,
  windDirDeg: 0,
  snow: 0,
  wetness: 0,
};

const MIN_MS = 60_000;
const JST_MS = 9 * 3_600_000;

export interface WeatherCore extends WeatherService {
  /** 게임 시각의 날씨(environment가 부른다). */
  at(ms: number): WeatherParams;
}

/** fixed 값: 빠진 필드 = 맑음, 젖음이 없으면 비·눈 > 0일 때 1(흠뻑). */
export function fixedWeather(f: Partial<WeatherParams> = {}): WeatherParams {
  const p = { ...CLEAR_WEATHER, ...f };
  if (f.wetness === undefined) p.wetness = p.rainMmH > 0 || p.snow > 0 ? 1 : 0;
  return p;
}

/** auto 젖음(분 해상도 캐시 + 보간). */
function autoWetness(c: WeatherClimateFile, paramsAt: (ms: number) => Omit<WeatherParams, 'wetness'>) {
  const byMin = new Map<number, number>();
  const at = (m: number): number => {
    let w = byMin.get(m);
    if (w === undefined) {
      if (byMin.size > 256) byMin.clear();
      w = wetnessAt(c, m * MIN_MS, paramsAt);
      byMin.set(m, w);
    }
    return w;
  };
  return (ms: number): number => {
    const m = Math.floor(ms / MIN_MS);
    const t = ms / MIN_MS - m;
    return at(m) + (at(m + 1) - at(m)) * t;
  };
}

export function createWeatherService(climate: WeatherClimateFile | undefined, now: () => number): WeatherCore {
  let mode: WeatherMode = 'auto';
  let fixed = fixedWeather();
  let live: { params: Omit<WeatherParams, 'wetness'>; wet: number; lastMs: number } | undefined;
  const cache = createMarkovCache();
  const paramsAt = (ms: number) => (climate ? weatherAt(climate, ms, cache).params : CLEAR_WEATHER);
  const wetAt = climate ? autoWetness(climate, paramsAt) : () => 0;
  let last: { ms: number; mode: WeatherMode; p: WeatherParams; id: string } | undefined;
  const compute = (ms: number): { p: WeatherParams; id: string } => {
    if (mode === 'fixed') return { p: fixed, id: 'fixed' };
    if (mode === 'live' && live) {
      const dtMin = Math.min(Math.max((ms - live.lastMs) / MIN_MS, 0), 60);
      const h = ((((ms + JST_MS) / 3_600_000) % 24) + 24) % 24;
      if (climate) live.wet = stepWetness(live.wet, live.params, dtMin, h >= 19 || h < 6, climate.wetness);
      live.lastMs = ms;
      return { p: { ...live.params, wetness: live.wet }, id: 'live' };
    }
    if (!climate) return { p: CLEAR_WEATHER, id: 'clear' };
    const w = weatherAt(climate, ms, cache);
    return { p: { ...w.params, wetness: wetAt(ms) }, id: w.id };
  };
  const at = (ms: number): WeatherParams => {
    if (last && last.ms === ms && last.mode === mode) return last.p;
    const r = compute(ms);
    last = { ms, mode, ...r };
    return r.p;
  };
  return {
    at,
    get params() {
      return at(now());
    },
    get mode() {
      return mode;
    },
    get stateId() {
      return last?.id ?? (mode === 'auto' ? 'clear' : mode);
    },
    setMode(m, f) {
      mode = m;
      if (m === 'fixed') fixed = fixedWeather(f);
      last = undefined;
    },
    setLive(sample) {
      const params = liveParams(sample);
      live = { params, wet: live?.wet ?? (params.rainMmH > 0 ? 1 : 0), lastMs: live?.lastMs ?? now() };
      last = undefined;
    },
  };
}
