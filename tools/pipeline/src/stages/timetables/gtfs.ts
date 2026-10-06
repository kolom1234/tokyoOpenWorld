// GTFS → 노선 시간표(M07-T02, ADR-0071): 도쿄메트로 GTFS(ODPT, 키 = ODPT_CONSUMER_KEY — fetch.ts)의 긴자선 트립을 rail.bin 선로에 얹는다.
// 트립 방향 = 첫 → 마지막 정류장 WF 벡터와 선로(시작 → 끝) 방향 내적이 가장 큰 선로. 우리 선로 위 정차역(이름 대조)만 남기고,
// 시발·종착이 우리 정차면 그 자리에서 나타나고/사라진다(그 밖은 선로 끝 = 터널 안). 시각 = GTFS 출발(도착은 같은 주행 곡선).
import { lonLatToWF } from '@sanpo/geo';
import type {
  RailNetwork,
  RailTrackMeta,
  TimetableCalendar,
  TimetableDay,
  TimetableFile,
  TimetableTrip,
} from '@sanpo/tile-format';
import { compileTrip, type StopPlan, trackView } from './compile.ts';
import type { GtfsStopTime, GtfsTables } from './gtfs-read.ts';

/** content/sim/rail-lines.json 노선의 `gtfs` 항목. */
export interface GtfsLineMap {
  source: string;
  /** route_short_name·route_long_name·route_id 중 하나에 들어 있으면 이 노선. */
  routes: string[];
  /** 시발역에서 출발 전 나타나 있는 시간(s). */
  originDwellS: number;
  /** 종착역 도착 뒤 머무는 시간(s). */
  terminalDwellS: number;
  /** 중간역 최소 정차(s). */
  minDwellS: number;
}

export interface GtfsCompileStats {
  trips: number;
  skippedNoStop: number;
  skippedNoDays: number;
}

const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, '_');

/** 정류장 → 우리 역 id(이름 대조, 부모 역 이름도). 끝 "駅" 무시. */
function stationOf(g: GtfsTables, stopId: string, names: ReadonlyMap<string, string>): string | undefined {
  const norm = (n: string) => n.replace(/駅$/, '').trim();
  const st = g.stops.get(stopId);
  if (!st) return undefined;
  return names.get(norm(st.name)) ?? names.get(norm(g.stops.get(st.parent)?.name ?? ''));
}

/** 선로 방향(시작 → 끝, 단위 아님). */
function trackDir(net: RailNetwork, t: RailTrackMeta): [number, number] {
  const a = t.ptOffset * 3;
  const b = (t.ptOffset + t.ptCount - 1) * 3;
  return [
    (net.points[b] as number) - (net.points[a] as number),
    (net.points[b + 2] as number) - (net.points[a + 2] as number),
  ];
}

function pickTrack(
  net: RailNetwork,
  line: string,
  g: GtfsTables,
  st: readonly GtfsStopTime[],
): RailTrackMeta | undefined {
  const a = g.stops.get(st[0]?.stop ?? '');
  const b = g.stops.get(st.at(-1)?.stop ?? '');
  if (!a || !b) return undefined;
  const pa = lonLatToWF({ lon: a.lon, lat: a.lat });
  const pb = lonLatToWF({ lon: b.lon, lat: b.lat });
  let best: RailTrackMeta | undefined;
  let bestDot = 0;
  for (const t of net.tracks.filter((q) => q.line === line)) {
    const [dx, dz] = trackDir(net, t);
    const dot = dx * (pb.x - pa.x) + dz * (pb.z - pa.z);
    if (dot > bestDot) [best, bestDot] = [t, dot];
  }
  return best;
}

/** GTFS 트립 하나 → 우리 선로 트립(정차가 없으면 null). */
function compileOne(
  net: RailNetwork,
  line: RailNetwork['lines'][number],
  map: GtfsLineMap,
  g: GtfsTables,
  names: ReadonlyMap<string, string>,
  trip: { id: string; cal: string },
): TimetableTrip | null {
  const st = g.stopTimes.get(trip.id) ?? [];
  const track = pickTrack(net, line.id, g, st);
  if (!track || st.length < 2) return null;
  const tv = trackView(net, track.id);
  const ours = [...track.stops].sort((p, q) => p.s - q.s);
  const hits = st
    .map((x, i) => ({ x, i, station: stationOf(g, x.stop, names) }))
    .map((h) => ({ ...h, stop: ours.find((o) => o.station === h.station) }))
    .filter((h) => h.stop !== undefined);
  const first = hits[0];
  const last = hits.at(-1);
  if (!first?.stop || !last?.stop) return null;
  const half = (line.formation.cars * line.formation.carLengthM) / 2;
  const origin = first.i === 0;
  const terminus = last.i === st.length - 1;
  const plans: StopPlan[] = hits.map((h) => ({
    station: h.stop?.station as string,
    s: h.stop?.s as number,
    dwellS: h.i === st.length - 1 ? map.terminalDwellS : map.minDwellS,
    ...(h.i === st.length - 1 ? {} : { depS: h.x.depS }),
  }));
  const head = {
    id: `${line.id}-${trip.cal}-${safeId(trip.id)}`,
    route: line.id,
    cars: line.formation.cars,
    carLengthM: line.formation.carLengthM,
    from: origin ? first.stop.s : half,
    to: terminus ? last.stop.s : Math.max(half, track.lengthM - half),
  };
  const firstArrS = origin ? first.x.depS - map.originDwellS : first.x.arrS;
  return compileTrip(tv, head, { firstArrS }, plans);
}

/** 노선 하나: route 이름이 맞는 트립 → 요일 묶음별(같은 요일 집합 = 한 묶음) 시간표. */
export function compileGtfsLine(
  g: GtfsTables,
  lineId: string,
  map: GtfsLineMap,
  net: RailNetwork,
  names: ReadonlyMap<string, string>,
): { file: TimetableFile; stats: GtfsCompileStats } {
  const line = net.lines.find((l) => l.id === lineId);
  if (!line) throw new Error(`gtfs: line ${lineId} not in rail.bin`);
  const routeIds = new Set(
    [...g.routes]
      .filter(([id, r]) => map.routes.some((n) => [id, r.shortName, r.longName].some((v) => v.includes(n))))
      .map(([id]) => id),
  );
  const stats: GtfsCompileStats = { trips: 0, skippedNoStop: 0, skippedNoDays: 0 };
  const cals = new Map<string, TimetableCalendar>();
  for (const t of g.trips.filter((q) => routeIds.has(q.route))) {
    const days = g.calendars.get(t.service) ?? [];
    if (days.length === 0) {
      stats.skippedNoDays++;
      continue;
    }
    const calId = (['weekday', 'saturday', 'holiday'] as TimetableDay[]).filter((d) => days.includes(d)).join('-');
    const trip = compileOne(net, line, map, g, names, { id: t.id, cal: calId });
    if (!trip) {
      stats.skippedNoStop++;
      continue;
    }
    const cal = cals.get(calId) ?? { id: calId, days: calId.split('-') as TimetableDay[], trips: [] };
    cal.trips.push(trip);
    cals.set(calId, cal);
    stats.trips++;
  }
  const calendars = [...cals.values()].sort((p, q) => (p.id < q.id ? -1 : 1));
  for (const c of calendars) c.trips.sort((p, q) => p.enterS - q.enterS || (p.id < q.id ? -1 : 1));
  const file: TimetableFile = {
    schema: 1,
    line: lineId,
    source: 'gtfs',
    approximate: false,
    routes: [{ id: line.id, name: line.name, color: line.color }],
    calendars,
  };
  return { file, stats };
}
