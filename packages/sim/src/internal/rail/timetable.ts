// 열차 시간표 색인(M07-T02, ADR-0071): global/timetables/<lineId>.json(파이프라인 컴파일) → 요일 유형별 트립(enterS 순) →
// 게임 시각에 운행 중인 트립. 운행일 = 04:00 JST 경계(시각 = 운행일 0시 기준 초, 24:00 넘김) — 전날 운행일의 자정 넘김 트립도 본다.
// 위치(s(trip, t))는 motion-profile(M07-T03)이 core tripLegs로 계산한다. see docs/10-simulation.md §6.1–6.2
import { SERVICE_DAY_START_S, type TimetableFile, type TimetableTrip } from '@sanpo/tile-format';
import type { DayType } from '../../api.ts';
import { dayTypeOf } from '../clock/world-clock.ts';

const JST_OFFSET_MS = 9 * 3600_000;
const DAY_S = 86_400;

/** 게임 시각 → 운행일 0시(UTC ms)·운행일 초(04:00 = 14400 … 27:59:59 = 100799). */
export function serviceTimeOf(gameTimeMs: number): { dayStartMs: number; t: number } {
  const jstS = (gameTimeMs + JST_OFFSET_MS) / 1000;
  let day = Math.floor(jstS / DAY_S);
  let t = jstS - day * DAY_S;
  if (t < SERVICE_DAY_START_S) {
    day -= 1;
    t += DAY_S;
  }
  return { dayStartMs: day * DAY_S * 1000 - JST_OFFSET_MS, t };
}

interface CalendarIndex {
  trips: TimetableTrip[];
  /** 가장 긴 트립(exitS − enterS) — 운행 중 검색 창. */
  maxDurS: number;
}

export interface LineTimetable {
  line: string;
  source: TimetableFile['source'];
  approximate: boolean;
  routes: TimetableFile['routes'];
  byDay: Map<DayType, CalendarIndex>;
}

export interface ActiveTrip {
  line: string;
  trip: TimetableTrip;
  /** 그 트립 운행일 초(전날 운행일 트립이면 t + 86400). */
  t: number;
}

/** 런타임 형태 확인(스키마 검증은 파이프라인 — 여기는 깨진 응답만 거른다). */
export function isTimetableFile(x: unknown): x is TimetableFile {
  const f = x as Partial<TimetableFile> | null;
  return (
    !!f &&
    f.schema === 1 &&
    typeof f.line === 'string' &&
    Array.isArray(f.calendars) &&
    f.calendars.every((c) => Array.isArray(c.days) && Array.isArray(c.trips))
  );
}

export function indexTimetable(f: TimetableFile): LineTimetable {
  const byDay = new Map<DayType, CalendarIndex>();
  for (const c of f.calendars) {
    const trips = [...c.trips].sort((p, q) => p.enterS - q.enterS);
    const maxDurS = trips.reduce((m, t) => Math.max(m, t.exitS - t.enterS), 0);
    for (const d of c.days) byDay.set(d, { trips, maxDurS });
  }
  return { line: f.line, source: f.source, approximate: f.approximate, routes: f.routes, byDay };
}

/** enterS ≤ t인 마지막 트립 다음 번호(이진 탐색). */
function upperBound(trips: readonly TimetableTrip[], t: number): number {
  let lo = 0;
  let hi = trips.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((trips[mid] as TimetableTrip).enterS <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function collect(line: LineTimetable, day: DayType, t: number, out: ActiveTrip[]): void {
  const c = line.byDay.get(day);
  if (!c) return;
  for (let i = upperBound(c.trips, t) - 1; i >= 0; i--) {
    const trip = c.trips[i] as TimetableTrip;
    if (trip.enterS < t - c.maxDurS) break;
    if (t <= trip.exitS) out.push({ line: line.line, trip, t });
  }
}

/** 게임 시각에 운행 중(enterS ≤ t ≤ exitS)인 트립 — 오늘 운행일 + 전날 운행일(28:00 넘김 대비). 요일 = 운행일 기준. */
export function activeTrips(lines: readonly LineTimetable[], gameTimeMs: number, out: ActiveTrip[] = []): ActiveTrip[] {
  out.length = 0;
  const { dayStartMs, t } = serviceTimeOf(gameTimeMs);
  const today = dayTypeOf(dayStartMs + SERVICE_DAY_START_S * 1000);
  const yesterday = dayTypeOf(dayStartMs - DAY_S * 1000 + SERVICE_DAY_START_S * 1000);
  for (const l of lines) {
    collect(l, today, t, out);
    collect(l, yesterday, t + DAY_S, out);
  }
  return out;
}
