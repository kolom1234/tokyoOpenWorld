// 실시간 날씨(10 §3 liveWeather, M09-T01): `/api/weather`(Open-Meteo 현재값 프록시) 표본 → WeatherParams(젖음 제외). WMO 코드 표 = Open-Meteo 문서의 WMO 4677 요약.
import type { WeatherParams } from '@sanpo/core';
import type { LiveWeatherSample } from '../../api.ts';

interface CodeRow {
  /** 강수 강도(mm/h) — 표본 강수량이 더 크면 그 값. */
  rain: number;
  snow: number;
  fog: number;
}

const ROWS: Readonly<Record<number, CodeRow>> = {
  45: { rain: 0, snow: 0, fog: 0.7 },
  48: { rain: 0, snow: 0, fog: 0.75 },
  51: { rain: 0.3, snow: 0, fog: 0.25 },
  53: { rain: 0.6, snow: 0, fog: 0.3 },
  55: { rain: 1, snow: 0, fog: 0.3 },
  56: { rain: 0.5, snow: 0, fog: 0.3 },
  57: { rain: 1, snow: 0, fog: 0.3 },
  61: { rain: 1.5, snow: 0, fog: 0.3 },
  63: { rain: 4, snow: 0, fog: 0.35 },
  65: { rain: 10, snow: 0, fog: 0.45 },
  66: { rain: 2, snow: 0, fog: 0.35 },
  67: { rain: 6, snow: 0, fog: 0.4 },
  71: { rain: 0, snow: 0.5, fog: 0.3 },
  73: { rain: 0, snow: 0.8, fog: 0.35 },
  75: { rain: 0, snow: 1, fog: 0.45 },
  77: { rain: 0, snow: 0.3, fog: 0.25 },
  80: { rain: 2, snow: 0, fog: 0.3 },
  81: { rain: 6, snow: 0, fog: 0.35 },
  82: { rain: 15, snow: 0, fog: 0.5 },
  85: { rain: 0, snow: 0.6, fog: 0.35 },
  86: { rain: 0, snow: 1, fog: 0.45 },
  95: { rain: 8, snow: 0, fog: 0.4 },
  96: { rain: 15, snow: 0, fog: 0.5 },
  99: { rain: 15, snow: 0, fog: 0.5 },
};

export function liveParams(s: LiveWeatherSample): Omit<WeatherParams, 'wetness'> {
  const row = ROWS[s.weatherCode];
  const cloud = Math.min(Math.max(s.cloudCover, 0), 1);
  const rain = row && row.rain > 0 ? Math.max(row.rain, s.precipitationMm) : 0;
  return {
    cloudCover: row && (row.rain > 0 || row.snow > 0) ? Math.max(cloud, 0.95) : cloud,
    rainMmH: rain,
    fog: row?.fog ?? cloud * 0.1,
    windMs: Math.max(0, s.windMs),
    windDirDeg: s.windDirDeg,
    snow: row?.snow ?? 0,
    temperatureC: s.temperatureC,
  };
}
