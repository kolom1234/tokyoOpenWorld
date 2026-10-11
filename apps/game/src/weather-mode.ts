// 날씨 모드(M09-T01, 10 §3): `?weather=auto|live|<기후표 상태 id>` > 골든뷰 weather > `?time=`(고정 시각 = 맑음 고정 — e2e·비교 결정론) > auto(기후표 마르코프).
// live = Worker `/api/weather`(Open-Meteo 프록시, LIVE_WEATHER=true일 때만 200)를 10분마다 받아 sim에 넣는다. 꺼져 있으면(404) auto로 남는다.
// see docs/modules/game.md
import type { Logger } from '@sanpo/core';
import type { LiveWeatherSample, SimService, WeatherClimateFile } from '@sanpo/sim';
import type { GoldenWeather } from './debug/bookmarks.ts';

export type WeatherSpec = { mode: 'auto' } | { mode: 'live' } | { mode: 'fixed'; preset: string };

const LIVE_POLL_MS = 10 * 60_000;
const ID = /^[a-z]{2,16}$/;

/** 골든뷰 날씨 → 기후표 상태 id. */
const GOLDEN_PRESET: Readonly<Record<GoldenWeather, string>> = {
  clear: 'clear',
  cloudy: 'overcast',
  rain: 'rain',
  fog: 'fog',
  snow: 'snow',
};

export function parseWeatherFlag(v: string | null): WeatherSpec | undefined {
  if (v === 'auto' || v === 'live') return { mode: v };
  return v && ID.test(v) ? { mode: 'fixed', preset: v } : undefined;
}

export function weatherSpecOf(
  flag: WeatherSpec | undefined,
  golden: GoldenWeather | undefined,
  fixedTime: boolean,
): WeatherSpec {
  if (flag) return flag;
  if (golden) return { mode: 'fixed', preset: GOLDEN_PRESET[golden] };
  return fixedTime ? { mode: 'fixed', preset: 'clear' } : { mode: 'auto' };
}

/** sim 날씨에 적용. 모르는 상태 id = 맑음. */
export function applyWeatherSpec(
  sim: Pick<SimService, 'weather'>,
  spec: WeatherSpec,
  climate: WeatherClimateFile,
): void {
  if (spec.mode !== 'fixed') {
    sim.weather.setMode('auto');
    return;
  }
  const s = climate.states.find((x) => x.id === spec.preset) ?? climate.states[0];
  sim.weather.setMode(
    'fixed',
    s ? { cloudCover: s.cloudCover, rainMmH: s.rainMmH, fog: s.fog, snow: s.snow, windMs: s.windMs } : {},
  );
}

function isSample(v: unknown): v is LiveWeatherSample {
  const o = v as Partial<LiveWeatherSample> | null;
  return !!o && typeof o.weatherCode === 'number' && typeof o.cloudCover === 'number' && typeof o.windMs === 'number';
}

/**
 * live 폴링 시작. 첫 표본이 오면 live 모드로 바꾸고 onLive(true)(크레딧 표기). 반환 = 정지 함수.
 * 404(기능 꺼짐)·오류면 auto 그대로, 10분 뒤 다시 시도.
 */
export function startLiveWeather(
  sim: Pick<SimService, 'weather'>,
  log: Logger,
  onLive: (on: boolean) => void,
  fetchFn: (u: string) => Promise<Response> = (u) => fetch(u),
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const poll = async (): Promise<void> => {
    try {
      const r = await fetchFn('/api/weather');
      const body: unknown = r.ok ? await r.json() : undefined;
      if (isSample(body)) {
        sim.weather.setLive(body);
        if (sim.weather.mode !== 'live') sim.weather.setMode('live');
        onLive(true);
      } else log.info(`live weather unavailable (${r.status}) — auto weather`);
    } catch (e) {
      log.warn('live weather', e);
    }
    if (!stopped) timer = setTimeout(() => void poll(), LIVE_POLL_MS);
  };
  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
