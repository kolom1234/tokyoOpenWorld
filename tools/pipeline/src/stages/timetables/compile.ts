// 시간표 공통(M07-T02, ADR-0071): 트립 시각 계산(core tripLegs — sim이 위치를 그리는 곡선과 같다), 같은 선로 간격 검사,
// 운행일 경계(04:00–28:00) 검사. 합성(synthetic.ts)·GTFS(gtfs.ts)가 함께 쓴다. see docs/10-simulation.md §6.1–6.2
import { tripLegs } from '@sanpo/core';
import {
  type RailNetwork,
  type RailTrackMeta,
  SERVICE_DAY_START_S,
  type TimetableFile,
  type TimetableTrip,
} from '@sanpo/tile-format';

/** 같은 선로·같은 방향 트립 간 최소 간격(s, M07-T02 수락). */
export const MIN_HEADWAY_S = 90;
/** 운행일 끝(초) — 다음 운행일 04:00. */
export const SERVICE_DAY_END_S = SERVICE_DAY_START_S + 86_400;

export interface TrackView {
  meta: RailTrackMeta;
  /** 이 선로 표본 제한속도(m/s). */
  limits: Float32Array;
}

export function trackView(net: RailNetwork, id: string): TrackView {
  const meta = net.tracks.find((t) => t.id === id);
  if (!meta) throw new Error(`timetable: track ${id} not in rail.bin`);
  return { meta, limits: net.speed.subarray(meta.ptOffset, meta.ptOffset + meta.ptCount) };
}

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;

export type TripHead = Pick<TimetableTrip, 'id' | 'route' | 'cars' | 'carLengthM' | 'from' | 'to'>;

export interface StopPlan {
  station: string;
  s: number;
  /** 최소 정차(s). */
  dwellS: number;
  /** 고정 출발 시각(GTFS) — 도착 + 정차보다 이르면 늦춘다. */
  depS?: number;
}

/**
 * 트립 하나: 시작 = enterS(from에 있는 시각) 또는 firstArrS(첫 정차 도착 — 거꾸로 enterS 계산). 정차 i 도착 = 앞 출발 + 구간 곡선 시간,
 * 출발 = max(고정 출발, 도착 + 정차). 시각은 0.1 s로 반올림해 이어 쓴다(sim은 출발 시각부터 같은 곡선을 그린다).
 */
export function compileTrip(
  tv: TrackView,
  head: TripHead,
  start: { enterS: number } | { firstArrS: number },
  stops: readonly StopPlan[],
): TimetableTrip {
  // 위치는 0.01 m로 반올림한 값으로 곡선을 만든다(sim이 파일 값 그대로 같은 곡선을 다시 만든다).
  const from = r2(head.from);
  const to = r2(head.to);
  const ss = stops.map((s) => r2(s.s));
  const legs = tripLegs(tv.limits, tv.meta.stepM, from, to, ss);
  const d0 = legs[0]?.duration ?? 0;
  const enterS = r1('enterS' in start ? start.enterS : start.firstArrS - d0);
  let t = enterS;
  const out: TimetableTrip['stops'] = [];
  for (let i = 0; i < stops.length; i++) {
    const p = stops[i] as StopPlan;
    const arrS = r1(t + (legs[i]?.duration ?? 0));
    const depS = r1(Math.max(p.depS ?? 0, arrS + p.dwellS));
    out.push({ station: p.station, s: ss[i] as number, arrS, depS });
    t = depS;
  }
  const exitS = r1(t + (legs[stops.length]?.duration ?? 0));
  return { ...head, from, to, track: tv.meta.id, dir: tv.meta.heading, enterS, exitS, stops: out };
}

export interface HeadwayViolation {
  calendar: string;
  track: string;
  a: string;
  b: string;
  /** 비교점(enter·<역>:arr·<역>:dep·exit). */
  at: string;
  gapS: number;
}

/** 두 트립의 공통 비교점 시각 쌍(시작·끝은 위치가 같을 때만). 정차 패턴이 같은 트립은 구간 곡선이 같아 끝점 비교로 충분하다. */
function checkpoints(p: TimetableTrip, q: TimetableTrip): [string, number, number][] {
  const out: [string, number, number][] = [];
  if (Math.abs(p.from - q.from) < 0.5) out.push(['enter', p.enterS, q.enterS]);
  for (const a of p.stops) {
    const b = q.stops.find((x) => x.station === a.station);
    if (!b) continue;
    out.push([`${a.station}:arr`, a.arrS, b.arrS], [`${a.station}:dep`, a.depS, b.depS]);
  }
  if (Math.abs(p.to - q.to) < 0.5) out.push(['exit', p.exitS, q.exitS]);
  return out;
}

/** 같은 선로(= 같은 방향) 이웃 트립 간격: 비교점마다 뒤 − 앞 ≥ min(추월·역전도 음수로 잡힌다). minGapS = 전체 최솟값. */
export function checkHeadways(
  file: TimetableFile,
  min = MIN_HEADWAY_S,
): { minGapS: number; violations: HeadwayViolation[] } {
  let minGapS = Number.POSITIVE_INFINITY;
  const violations: HeadwayViolation[] = [];
  for (const cal of file.calendars) {
    const byTrack = new Map<string, TimetableTrip[]>();
    for (const t of cal.trips) byTrack.set(t.track, [...(byTrack.get(t.track) ?? []), t]);
    for (const [track, list] of byTrack) {
      const sorted = [...list].sort((p, q) => p.enterS - q.enterS);
      for (let i = 1; i < sorted.length; i++) {
        const p = sorted[i - 1] as TimetableTrip;
        const q = sorted[i] as TimetableTrip;
        for (const [at, tp, tq] of checkpoints(p, q)) {
          const gapS = r1(tq - tp);
          minGapS = Math.min(minGapS, gapS);
          if (gapS < min) violations.push({ calendar: cal.id, track, a: p.id, b: q.id, at, gapS });
        }
      }
    }
  }
  return { minGapS, violations };
}

/** 운행일 밖(04:00 전 시작·다음 04:00 뒤 끝) 트립 id — 운행일끼리 겹치지 않게. */
export function outsideServiceDay(file: TimetableFile): string[] {
  const out: string[] = [];
  for (const cal of file.calendars)
    for (const t of cal.trips) if (t.enterS < SERVICE_DAY_START_S || t.exitS > SERVICE_DAY_END_S) out.push(t.id);
  return out;
}
