// `/api/weather`: 기능 플래그(LIVE_WEATHER), Open-Meteo 응답 → 최소 형태, 상류 오류 502. see docs/13-deployment.md §4
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env.ts';
import { handleWeather, OPEN_METEO_URL, toLiveWeather } from '../src/routes/weather.ts';

const REQ = new Request('https://sanpo.test/api/weather');
const SAMPLE = {
  current: {
    time: '2026-09-29T01:30',
    temperature_2m: 22.4,
    precipitation: 0.3,
    weather_code: 61,
    cloud_cover: 85,
    wind_speed_10m: 3.2,
    wind_direction_10m: 140,
    is_day: 0,
  },
};

describe('/api/weather', () => {
  it('is disabled unless LIVE_WEATHER=true (no upstream call)', async () => {
    let called = false;
    const res = await handleWeather(REQ, { LIVE_WEATHER: 'false' } as Env, undefined, async () => {
      called = true;
      return new Response('{}');
    });
    expect(res.status).toBe(404);
    expect(called).toBe(false);
  });

  it('proxies Open-Meteo current weather for central Tokyo in m/s and maps it', async () => {
    let asked = '';
    const res = await handleWeather(REQ, { LIVE_WEATHER: 'true' } as Env, undefined, async (u) => {
      asked = String(u);
      return Response.json(SAMPLE);
    });
    expect(asked).toBe(OPEN_METEO_URL);
    expect(asked).toContain('wind_speed_unit=ms');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=600');
    expect(await res.json()).toEqual(toLiveWeather(SAMPLE));
    expect(toLiveWeather(SAMPLE)).toMatchObject({ weatherCode: 61, cloudCover: 0.85, isDay: false, windMs: 3.2 });
  });

  it('returns 502 on upstream failure or malformed body', async () => {
    const env = { LIVE_WEATHER: 'true' } as Env;
    expect((await handleWeather(REQ, env, undefined, async () => new Response('x', { status: 500 }))).status).toBe(502);
    expect((await handleWeather(REQ, env, undefined, async () => Response.json({}))).status).toBe(502);
    const thrown = await handleWeather(REQ, env, undefined, async () => {
      throw new TypeError('offline');
    });
    expect(thrown.status).toBe(502);
  });
});
