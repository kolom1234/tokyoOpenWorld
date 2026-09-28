// `/api/weather`: LIVE_WEATHER=true일 때만 Open-Meteo 현재 날씨(도쿄 중심) 프록시 → 10분 엣지 캐시. 꺼져 있으면 404(disabled).
// 응답은 sim `live-mapper`(M06)가 쓰는 최소 필드만(WMO 코드 포함). see docs/13-deployment.md §4, docs/10-simulation.md §1, docs/03 (open-meteo)
import { edgeCache } from '../cache.ts';
import type { Env, WorkerContext } from '../env.ts';
import { json } from '../headers.ts';

/** 도쿄역 부근(도쿄 23구 중심). */
const TOKYO = { lat: 35.6812, lon: 139.7671 };
const CURRENT_FIELDS = 'temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day';
export const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${TOKYO.lat}&longitude=${TOKYO.lon}` +
  `&current=${CURRENT_FIELDS}&wind_speed_unit=ms&timezone=Asia%2FTokyo`;
const CACHE_CONTROL = 'public, max-age=600';

export interface LiveWeather {
  time: string;
  temperatureC: number;
  precipitationMm: number;
  weatherCode: number;
  cloudCover: number;
  windMs: number;
  windDirDeg: number;
  isDay: boolean;
  source: 'open-meteo';
}

interface OpenMeteoCurrent {
  current?: {
    time: string;
    temperature_2m: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    is_day: number;
  };
}

/** Open-Meteo 응답 → 최소 형태. 필드가 없으면 undefined. */
export function toLiveWeather(body: OpenMeteoCurrent): LiveWeather | undefined {
  const c = body.current;
  if (!c || typeof c.weather_code !== 'number') return undefined;
  return {
    time: c.time,
    temperatureC: c.temperature_2m,
    precipitationMm: c.precipitation,
    weatherCode: c.weather_code,
    cloudCover: c.cloud_cover / 100,
    windMs: c.wind_speed_10m,
    windDirDeg: c.wind_direction_10m,
    isDay: c.is_day === 1,
    source: 'open-meteo',
  };
}

export async function handleWeather(
  request: Request,
  env: Env,
  ctx?: WorkerContext,
  fetchFn: typeof fetch = (u, i) => fetch(u, i),
): Promise<Response> {
  if (env.LIVE_WEATHER !== 'true') return json(404, { error: 'live_weather_disabled' }, CACHE_CONTROL);
  const cache = edgeCache();
  const key = new Request(new URL('/api/weather', request.url).toString());
  const hit = await cache?.match(key);
  if (hit !== undefined) return hit;
  let upstream: Response;
  try {
    upstream = await fetchFn(OPEN_METEO_URL, { headers: { accept: 'application/json' } });
  } catch {
    return json(502, { error: 'weather_upstream' }, 'no-store');
  }
  const w = upstream.ok ? toLiveWeather((await upstream.json()) as OpenMeteoCurrent) : undefined;
  if (w === undefined) return json(502, { error: 'weather_upstream', status: upstream.status }, 'no-store');
  const res = json(200, w, CACHE_CONTROL);
  if (cache !== undefined && ctx !== undefined) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
