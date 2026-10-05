// M07-T02 sim 시간표 색인: 운행일 04:00 경계(자정 넘김 트립은 전날 운행일), 요일 유형별 묶음, 운행 중 트립 검색.
import type { TimetableFile, TimetableTrip } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { activeTrips, indexTimetable, isTimetableFile, serviceTimeOf } from '../src/internal/rail/timetable.ts';

/** JST 날짜·시각 → UTC ms. */
const jst = (y: number, mo: number, d: number, h: number, mi = 0) => Date.UTC(y, mo - 1, d, h - 9, mi);

const trip = (id: string, enterS: number, exitS: number): TimetableTrip => ({
  id,
  route: 'r',
  track: 'k',
  dir: 'n',
  cars: 1,
  carLengthM: 20,
  from: 10,
  to: 990,
  enterS,
  exitS,
  stops: [],
});

const FILE: TimetableFile = {
  schema: 1,
  line: 'l',
  source: 'synthetic',
  approximate: true,
  routes: [{ id: 'r', name: { ja: 'r', en: 'r' }, color: '#000000' }],
  calendars: [
    {
      id: 'weekday',
      days: ['weekday'],
      trips: [trip('wd-late', 98_900, 99_500), trip('wd-early', 18_000, 18_800), trip('wd-mid', 43_000, 43_700)],
    },
    { id: 'holiday', days: ['saturday', 'holiday'], trips: [trip('hd-early', 18_100, 18_900)] },
  ],
};

describe('service day', () => {
  it('maps times before 04:00 JST to the previous service day (t > 86400)', () => {
    const a = serviceTimeOf(jst(2026, 10, 6, 3, 30));
    expect(a.t).toBe(27.5 * 3600);
    expect(a.dayStartMs).toBe(jst(2026, 10, 5, 0));
    const b = serviceTimeOf(jst(2026, 10, 6, 4, 0));
    expect(b.t).toBe(4 * 3600);
    expect(b.dayStartMs).toBe(jst(2026, 10, 6, 0));
  });
});

describe('active trips', () => {
  const lines = [indexTimetable(FILE)];
  const ids = (ms: number) => activeTrips(lines, ms).map((a) => a.trip.id);

  it('picks the calendar of the service day', () => {
    expect(isTimetableFile(FILE)).toBe(true);
    expect(isTimetableFile({ schema: 2 })).toBe(false);
    // 2026-10-05 = 월요일(평일), 10-04 = 일요일(휴일).
    expect(ids(jst(2026, 10, 5, 5, 5))).toEqual(['wd-early']);
    expect(ids(jst(2026, 10, 4, 5, 5))).toEqual(['hd-early']);
    expect(ids(jst(2026, 10, 5, 12, 15))).toEqual([]);
    expect(ids(jst(2026, 10, 5, 11, 58))).toEqual(['wd-mid']);
  });

  it('keeps a past-midnight trip on its own service day (Monday 27:30 = Tuesday 03:30)', () => {
    const a = activeTrips(lines, jst(2026, 10, 6, 3, 30));
    expect(a.map((x) => x.trip.id)).toEqual(['wd-late']);
    expect(a[0]?.t).toBe(27.5 * 3600);
    // 일요일 운행일의 03:30(= 월요일 03:30)은 휴일 묶음 — 평일 늦은 트립 아님.
    expect(ids(jst(2026, 10, 5, 3, 30))).toEqual([]);
  });
});
