// 트립 운동(M07-T03, 10 §6.2, ADR-0071·0072): s(trip, t) = 시각의 순수 함수. 구간 곡선 = core tripLegs(시간표 컴파일러와 같은 입력 —
// 파일의 from·to·정차 s·선로 제한속도) → 구간 0은 enterS, 구간 i는 정차 i−1 depS에서 출발, 도착 뒤 depS까지 정차.
// 문: 도착 +3 s부터 열림(DOOR_MOVE_S), 출발 −5 s에 닫힘 끝. 빨리감기·시각 점프 = 같은 함수(누적 없음).
import { profileAt, type RunProfile, tripLegs } from '@sanpo/core';
import type { TimetableTrip } from '@sanpo/tile-format';
import type { TrackRt } from './network.ts';

/** 도착 뒤 문 열기 시작·출발 전 닫힘 끝(s, 10 §6.2). */
export const DOOR_OPEN_AFTER_S = 3;
export const DOOR_CLOSED_BEFORE_S = 5;
/** 문 한 번 여닫는 시간(s). */
export const DOOR_MOVE_S = 2.5;

export interface TripMotion {
  trip: TimetableTrip;
  legs: RunProfile[];
  /** 정차 i 실제 도착(출발 시각 + 곡선 시간 — 파일 arrS와 ≤ 0.05 s). */
  arrive: number[];
  /** 정차 i 문 쪽(진행 방향 왼쪽 −1·오른쪽 +1, 선로 정차 메타). */
  side: number[];
}

export function tripMotion(tr: TrackRt, trip: TimetableTrip): TripMotion {
  const legs = tripLegs(
    tr.limits,
    tr.meta.stepM,
    trip.from,
    trip.to,
    trip.stops.map((s) => s.s),
  );
  const arrive = trip.stops.map(
    (_, i) => (i === 0 ? trip.enterS : (trip.stops[i - 1]?.depS as number)) + (legs[i]?.duration ?? 0),
  );
  const side = trip.stops.map((s) => (tr.meta.stops.find((m) => m.station === s.station)?.side === 'L' ? -1 : 1));
  return { trip, legs, arrive, side };
}

export interface MotionState {
  /** 편성 중심 s(m). */
  s: number;
  v: number;
  /** 정차 중인 정차 번호(−1 = 주행·시발 전·종착 뒤). */
  stop: number;
  /** 다음(또는 지금) 정차 번호(−1 = 없음). */
  next: number;
  /** 문 열림 0..1 × 쪽(−1 왼쪽·+1 오른쪽) — 닫힘 = 0. */
  doors: number;
}

function doorsAt(m: TripMotion, i: number, t: number): number {
  const st = m.trip.stops[i];
  if (!st) return 0;
  const a = m.arrive[i] as number;
  const open = Math.min(Math.max((t - a - DOOR_OPEN_AFTER_S) / DOOR_MOVE_S, 0), 1);
  const close = Math.min(Math.max((st.depS - DOOR_CLOSED_BEFORE_S - t) / DOOR_MOVE_S, 0), 1);
  return Math.min(open, close) * (m.side[i] as number) + 0; // −0 → 0
}

/** t(운행일 초)의 편성 상태. out을 채워 돌려준다(할당 없음). */
export function motionAt(m: TripMotion, t: number, out: MotionState): MotionState {
  const stops = m.trip.stops;
  let start = m.trip.enterS;
  for (let i = 0; i <= stops.length; i++) {
    const leg = m.legs[i] as RunProfile;
    if (t < start + leg.duration || i === stops.length) {
      const p = profileAt(leg, t - start);
      out.s = p.s;
      out.v = p.v;
      out.stop = -1;
      out.next = i < stops.length ? i : -1;
      out.doors = 0;
      return out;
    }
    const st = stops[i];
    if (st && t < st.depS) {
      out.s = st.s;
      out.v = 0;
      out.stop = i;
      out.next = i;
      out.doors = doorsAt(m, i, t);
      return out;
    }
    start = st?.depS ?? start;
  }
  return out;
}
