// GTFS(GTFS-JP) 읽기(M07-T02): 디렉터리 또는 zip의 stops·routes·trips·stop_times·calendar(+calendar_dates 이름 추정) → 표.
// CSV = RFC 4180(따옴표·쌍따옴표·CRLF·BOM). 시각 "HH:MM:SS"(24 넘김) → 운행일 0시 기준 초. see docs/03-data-sources.md §2
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { TimetableDay } from '@sanpo/tile-format';
import { readZip } from '../../lib/zip.ts';

/** CSV 텍스트 → 행(첫 행 = 머리글). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 머리글 이름으로 접근하는 레코드들. */
export function csvRecords(text: string): Record<string, string>[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** "HH:MM:SS"(또는 "H:MM:SS", 24 넘김) → 초. */
export function gtfsTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`gtfs: bad time "${s}"`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export interface GtfsStop {
  name: string;
  lat: number;
  lon: number;
  parent: string;
}
export interface GtfsStopTime {
  stop: string;
  seq: number;
  arrS: number;
  depS: number;
}
export interface GtfsTables {
  stops: Map<string, GtfsStop>;
  routes: Map<string, { shortName: string; longName: string }>;
  trips: { id: string; route: string; service: string }[];
  stopTimes: Map<string, GtfsStopTime[]>;
  /** service_id → 요일 유형(calendar.txt 요일 열, 없으면 이름 추정). */
  calendars: Map<string, TimetableDay[]>;
}

/** calendar.txt 요일 열 → 요일 유형(월–금 = 평일, 토, 일 = 휴일 — 공휴일은 sim이 휴일로 본다). */
function daysOfCalendar(r: Record<string, string>): TimetableDay[] {
  const out: TimetableDay[] = [];
  if (['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].some((d) => r[d] === '1')) out.push('weekday');
  if (r.saturday === '1') out.push('saturday');
  if (r.sunday === '1') out.push('holiday');
  return out;
}

/** calendar.txt가 없는 피드(calendar_dates만): service_id 이름으로 추정(平日·土休日 등). */
export function daysOfServiceName(id: string): TimetableDay[] {
  if (/土休|休日|holiday|sunday|日曜/i.test(id)) return /土|saturday/i.test(id) ? ['saturday', 'holiday'] : ['holiday'];
  if (/土曜|saturday/i.test(id)) return ['saturday'];
  if (/平日|weekday/i.test(id)) return ['weekday'];
  return [];
}

/** 디렉터리(*.txt) 또는 zip → 파일 이름 → 텍스트(없으면 undefined). */
function fileReader(source: string): (name: string) => string | undefined {
  if (statSync(source).isDirectory())
    return (name) => (existsSync(join(source, name)) ? readFileSync(join(source, name), 'utf8') : undefined);
  const entries = readZip(new Uint8Array(readFileSync(source)));
  const dec = new TextDecoder('utf-8');
  return (name) => {
    const e = [...entries.values()].find((x) => x.name === name || x.name.endsWith(`/${name}`));
    return e ? dec.decode(e.read()) : undefined;
  };
}

export function readGtfs(source: string): GtfsTables {
  const read = fileReader(source);
  const need = (name: string): Record<string, string>[] => {
    const t = read(name);
    if (t === undefined) throw new Error(`gtfs: ${name} missing in ${source}`);
    return csvRecords(t);
  };
  const stops = new Map<string, GtfsStop>();
  for (const r of need('stops.txt'))
    stops.set(r.stop_id ?? '', {
      name: r.stop_name ?? '',
      lat: Number(r.stop_lat),
      lon: Number(r.stop_lon),
      parent: r.parent_station ?? '',
    });
  const routes = new Map(
    need('routes.txt').map((r) => [
      r.route_id ?? '',
      { shortName: r.route_short_name ?? '', longName: r.route_long_name ?? '' },
    ]),
  );
  const trips = need('trips.txt').map((r) => ({
    id: r.trip_id ?? '',
    route: r.route_id ?? '',
    service: r.service_id ?? '',
  }));
  const stopTimes = new Map<string, GtfsStopTime[]>();
  for (const r of need('stop_times.txt')) {
    const arr = r.arrival_time || r.departure_time || '';
    const dep = r.departure_time || r.arrival_time || '';
    if (!arr) continue;
    const list = stopTimes.get(r.trip_id ?? '') ?? [];
    list.push({ stop: r.stop_id ?? '', seq: Number(r.stop_sequence), arrS: gtfsTime(arr), depS: gtfsTime(dep) });
    stopTimes.set(r.trip_id ?? '', list);
  }
  for (const l of stopTimes.values()) l.sort((p, q) => p.seq - q.seq);
  const calendars = new Map<string, TimetableDay[]>();
  for (const r of csvRecords(read('calendar.txt') ?? '')) calendars.set(r.service_id ?? '', daysOfCalendar(r));
  for (const t of trips) if (!calendars.has(t.service)) calendars.set(t.service, daysOfServiceName(t.service));
  return { stops, routes, trips, stopTimes, calendars };
}
