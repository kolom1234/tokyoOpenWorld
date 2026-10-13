// 계절·요일 유형(M09-T05): 공휴일 표 → 운행일 요일 유형, 계절 키프레임 보간, 토·휴일 군중 곡선 비, 날짜 변경 즉시 반영.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createEventBus, createLogger } from '@sanpo/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { CrowdParams, HolidaysFile, SeasonTableFile } from '../src/api.ts';
import { createSim } from '../src/index.ts';
import { setHolidays } from '../src/internal/clock/holidays.ts';
import { dayTypeOf } from '../src/internal/clock/world-clock.ts';
import { dayRatio } from '../src/internal/crowd/density.ts';
import { seasonFromTable } from '../src/internal/season.ts';

const ROOT = join(import.meta.dirname, '../../..');
const HOLIDAYS = JSON.parse(readFileSync(join(ROOT, 'content/sim/holidays-jp.json'), 'utf8')) as HolidaysFile;
const SEASON = JSON.parse(readFileSync(join(ROOT, 'content/sim/season.json'), 'utf8')) as SeasonTableFile;
const CROWD = JSON.parse(readFileSync(join(ROOT, 'content/sim/crowd.json'), 'utf8')) as CrowdParams;
const jst = (s: string) => Date.parse(`${s}+09:00`);

afterEach(() => setHolidays([]));

describe('holidays → dayType', () => {
  it('2026 national holidays incl. substitute (5/6) and citizens’ holiday (9/22)', () => {
    setHolidays(HOLIDAYS.holidays.map((h) => h.date));
    for (const d of ['2026-01-12', '2026-05-06', '2026-09-21', '2026-09-22', '2026-09-23', '2026-10-12', '2026-11-23'])
      expect(dayTypeOf(jst(`${d}T12:00:00`)), d).toBe('holiday');
    expect(dayTypeOf(jst('2026-10-13T12:00:00'))).toBe('weekday');
    expect(dayTypeOf(jst('2026-10-17T12:00:00'))).toBe('saturday');
    // 운행일 경계 04:00 — 공휴일 다음 날 03:00은 아직 공휴일 운행일.
    expect(dayTypeOf(jst('2026-10-13T03:00:00'))).toBe('holiday');
  });
  it('without a table only Sundays are holidays', () => {
    expect(dayTypeOf(jst('2026-10-12T12:00:00'))).toBe('weekday');
    expect(dayTypeOf(jst('2026-10-11T12:00:00'))).toBe('holiday');
  });
  it('table covers 2026–2035 with 15+ days each year', () => {
    for (let y = 2026; y <= 2035; y++)
      expect(HOLIDAYS.holidays.filter((h) => h.date.startsWith(String(y))).length).toBeGreaterThanOrEqual(15);
  });
});

describe('season table', () => {
  it('cherry bloom peaks early April, autumn tint late November, winter coats in January', () => {
    expect(seasonFromTable(92, SEASON).bloom).toBeCloseTo(1, 5);
    expect(seasonFromTable(200, SEASON).bloom).toBe(0);
    expect(seasonFromTable(325, SEASON).foliageTint).toBeCloseTo(1, 5);
    expect(seasonFromTable(10, SEASON).outfitPalette).toBeGreaterThan(0.9);
    expect(seasonFromTable(200, SEASON).outfitPalette).toBeLessThan(0.05);
  });
  it('wraps Dec 31 → Jan 1 continuously', () => {
    const a = seasonFromTable(365, SEASON);
    const b = seasonFromTable(1, SEASON);
    expect(Math.abs(a.outfitPalette - b.outfitPalette)).toBeLessThan(0.02);
    expect(Math.abs(a.leafDensity - b.leafDensity)).toBeLessThan(0.02);
  });
});

describe('weekday vs weekend crowd curve', () => {
  it('Saturday 8 am is quieter, 3 pm busier than the weekday curve', () => {
    expect(dayRatio(CROWD, jst('2026-10-17T08:30:00'), 'saturday')).toBeLessThan(0.6);
    expect(dayRatio(CROWD, jst('2026-10-17T15:00:00'), 'saturday')).toBeGreaterThan(1.05);
    expect(dayRatio(CROWD, jst('2026-10-16T08:30:00'), 'weekday')).toBe(1);
  });
});

describe('createSim environment', () => {
  it('applies a date change immediately (same frame)', () => {
    const log = createLogger();
    const sim = createSim({
      bus: createEventBus(log),
      log,
      initialClock: { kind: 'frozen', atMs: jst('2026-05-15T12:00:00') },
      holidays: HOLIDAYS,
      season: SEASON,
    });
    const spring = sim.environment();
    expect(spring.dayType).toBe('weekday');
    sim.clock.setMode({ kind: 'frozen', atMs: jst('2026-11-23T15:00:00') });
    const autumn = sim.environment();
    expect(autumn.dayType).toBe('holiday');
    expect(autumn.season.dayOfYear).toBe(327);
    expect(autumn.season.foliageTint).toBeGreaterThan(0.9);
    expect(autumn.season.outfitPalette).toBeGreaterThan(spring.season.outfitPalette);
  });
});
