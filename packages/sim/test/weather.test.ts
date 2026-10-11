// M09-T01 날씨: 기후표 확률 합 = 1, 마르코프 정상 분포 ≈ 달 p·평균 지속 ≈ 칸/(1 − stay), 시각 점프 = 순수 함수, 전이 보간, 젖음 램프·마름, 실시간 WMO 매핑, 서비스 모드.
import { describe, expect, it } from 'vitest';
import climateFile from '../../../content/sim/weather-climate.json';
import type { WeatherClimateFile } from '../src/api.ts';
import { liveParams } from '../src/internal/weather/live-mapper.ts';
import { createMarkovCache, pickState, slotOf, stateAtSlot, weatherAt } from '../src/internal/weather/markov.ts';
import { createWeatherService, fixedWeather } from '../src/internal/weather/service.ts';
import { wetnessAt } from '../src/internal/weather/wetness.ts';

const climate = climateFile as WeatherClimateFile;
const RAIN = new Set(['drizzle', 'rain', 'heavy']);
const jst = (iso: string) => Date.parse(`${iso}+09:00`);

describe('weather climate table', () => {
  it('has 12 months whose probabilities sum to 1 over all states', () => {
    expect(climate.months).toHaveLength(12);
    for (const m of climate.months) {
      expect(m.p).toHaveLength(climate.states.length);
      expect(m.p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(m.stay).toBeGreaterThan(0);
      expect(m.stay).toBeLessThan(1);
    }
    expect(pickState([0.2, 0.3, 0.5], 0)).toBe(0);
    expect(pickState([0.2, 0.3, 0.5], 0.49)).toBe(1);
    expect(pickState([0.2, 0.3, 0.5], 0.999)).toBe(2);
  });
});

describe('markov weather', () => {
  it('stationary share per month ≈ table p and mean run ≈ slot/(1 − stay)', () => {
    for (const month of [1, 6]) {
      const counts = new Array(climate.states.length).fill(0) as number[];
      let runs = 0;
      let slots = 0;
      let prev = -1;
      for (let y = 2026; y < 2036; y++) {
        const { slot: a } = slotOf(climate, jst(`${y}-${String(month).padStart(2, '0')}-01T00:00:00`));
        const { slot: b } = slotOf(climate, jst(`${y}-${String(month).padStart(2, '0')}-28T00:00:00`));
        for (let k = a; k < b; k++) {
          const s = stateAtSlot(climate, k);
          counts[s] = (counts[s] ?? 0) + 1;
          if (s !== prev) runs++;
          prev = s;
          slots++;
        }
      }
      const m = climate.months[month - 1] as WeatherClimateFile['months'][number];
      const rainP = m.p.reduce((a, p, i) => a + (RAIN.has(climate.states[i]?.id ?? '') ? p : 0), 0);
      const rainShare = counts.reduce((a, c, i) => a + (RAIN.has(climate.states[i]?.id ?? '') ? c : 0), 0) / slots;
      expect(Math.abs(rainShare - rainP)).toBeLessThan(0.035);
      expect(Math.abs((counts[0] as number) / slots - (m.p[0] as number))).toBeLessThan(0.06);
      // 같은 상태로 다시 뽑히면 런이 이어진다 → 평균 런 ≥ 1/(1 − stay)에 가깝다(± 40 %).
      const meanRun = slots / runs;
      expect(meanRun).toBeGreaterThan((1 / (1 - m.stay)) * 0.8);
      expect(meanRun).toBeLessThan((1 / (1 - m.stay)) * 1.8);
    }
  });

  it('is a pure function of game time (jumps, cache, query order)', () => {
    const t0 = jst('2026-06-20T08:00:00');
    const cache = createMarkovCache();
    const forward = Array.from({ length: 200 }, (_, i) => weatherAt(climate, t0 + i * 600_000, cache).id);
    const backward = Array.from({ length: 200 }, (_, i) => weatherAt(climate, t0 + (199 - i) * 600_000).id).reverse();
    expect(backward).toEqual(forward);
  });

  it('blends 10 minutes after a state change', () => {
    const t0 = jst('2026-06-01T00:00:00');
    let found = false;
    for (let k = 0; k < 2000 && !found; k++) {
      const { slot } = slotOf(climate, t0 + k * 1_800_000);
      const a = climate.states[stateAtSlot(climate, slot - 1)];
      const b = climate.states[stateAtSlot(climate, slot)];
      if (!a || !b || Math.abs(a.cloudCover - b.cloudCover) < 0.3) continue;
      const start = slot * 1_800_000 - 9 * 3_600_000;
      const mid = weatherAt(climate, start + 5 * 60_000).params.cloudCover;
      expect(mid).toBeCloseTo((a.cloudCover + b.cloudCover) / 2, 5);
      expect(weatherAt(climate, start + 11 * 60_000).params.cloudCover).toBeCloseTo(b.cloudCover, 9);
      found = true;
    }
    expect(found).toBe(true);
  });
});

describe('wetness', () => {
  const rainUntil = (stopMs: number) => (ms: number) => ({ rainMmH: ms < stopMs ? 4 : 0, snow: 0, cloudCover: 1 });
  it('soaks within 5 game minutes of rain and dries over hours', () => {
    const stop = jst('2026-05-15T12:00:00');
    const p = rainUntil(stop);
    expect(
      wetnessAt(climate, stop - 4 * 60_000, (ms) => ({ ...p(ms), rainMmH: ms >= stop - 9 * 60_000 ? 4 : 0 })),
    ).toBeLessThan(1);
    expect(wetnessAt(climate, stop, p)).toBe(1);
    const k = climate.wetness;
    const dryMin = k.dryMin * (1 + k.dryCloudK);
    expect(wetnessAt(climate, stop + (dryMin / 2) * 60_000, p)).toBeCloseTo(0.5, 1);
    expect(wetnessAt(climate, stop + (dryMin + 10) * 60_000, p)).toBe(0);
  });

  it('service: auto wetness follows rain, fixed rain is soaked, live maps WMO codes', () => {
    let now = jst('2026-06-20T00:00:00');
    const w = createWeatherService(climate, () => now);
    let rainy = false;
    for (let i = 0; i < 14 * 24 * 60 && !rainy; i += 10) {
      now += 600_000;
      rainy = w.params.rainMmH >= 1 && w.params.wetness > 0.9;
    }
    expect(rainy).toBe(true);
    w.setMode('fixed', { rainMmH: 5, cloudCover: 1 });
    expect(w.params.wetness).toBe(1);
    expect(w.stateId).toBe('fixed');
    expect(fixedWeather({ cloudCover: 0.5 }).wetness).toBe(0);
    const live = {
      time: 't',
      temperatureC: 18,
      precipitationMm: 6,
      weatherCode: 63,
      cloudCover: 0.6,
      windMs: 3,
      windDirDeg: 90,
      isDay: true,
    };
    expect(liveParams(live)).toMatchObject({ rainMmH: 6, cloudCover: 0.95 });
    expect(liveParams({ ...live, weatherCode: 2, precipitationMm: 0 })).toMatchObject({ rainMmH: 0, cloudCover: 0.6 });
    w.setLive(live);
    w.setMode('live');
    expect(w.params.rainMmH).toBe(6);
    expect(w.stateId).toBe('live');
  });
});
