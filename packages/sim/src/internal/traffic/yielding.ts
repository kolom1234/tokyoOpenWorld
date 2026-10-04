// 양보·정지 규칙(10 §5.1·§5.2, M06-T05 — ADR-0065): 차 앞 "가상 정지 지점"까지 거리 — 적신호(황색은 편하게 설 수 있을 때만, 정지선 못 서게 가까우면 통과 약속),
// 교차로 안 막힘(나가는 차선에 자리 없으면 들어가지 않음), 우회전 = 대향 직진 양보(좌측통행), 회전·직진 모두 앞 경로의 보행자(횡단 중)·플레이어 앞에서 정지.
import { LANE_NO_SIGNAL, LANE_TURN } from '@sanpo/tile-format';
import type { Lane, LaneGraph, LanePoint } from './lane-graph.ts';

/** 황색에서 "설 수 있다" 감속(m/s²)·정지선 앞 여유(m). */
const YELLOW_DECEL = 3;
const STOP_MARGIN = 0.5;
/** 보행자 확인: 경로 점 반경(m)·앞으로 볼 거리(m). */
const PED_R = 1.8;
const PED_LOOK_M = 22;
/** 대향 직진 확인 거리(m)·속력(m/s). */
const ONCOMING_M = 45;
const ONCOMING_V = 1.5;

export interface YieldVehicle {
  lane: Lane;
  s: number;
  v: number;
  len: number;
  next: Lane | undefined;
  next2: Lane | undefined;
  /** 이 차선 정지선 통과를 약속함(황색에 너무 가까웠음). */
  committed: boolean;
}

export interface YieldCtx {
  graph: LaneGraph;
  lamp(code: number): 'G' | 'Y' | 'R';
  /** 반경 r 안에 보행자(또는 도로 위 플레이어)가 있나. */
  pedNear(x: number, z: number, r: number): boolean;
  /** 차선 시작부터 len(m) 안에 차가 있나(교차로 출구 자리). */
  occupiedNearStart(lane: Lane, len: number): boolean;
  /** 대향 접근 차선에 다가오는 직진 차가 있나(우회전 양보). */
  oncoming(lane: Lane, withinM: number, minV: number): boolean;
}

const scratch: LanePoint = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };

/** 차선 l의 s0 … s1 구간에 보행자가 있으면 첫 거리(l 기준), 없으면 undefined. */
function pedOnLane(c: YieldCtx, l: Lane, s0: number, s1: number): number | undefined {
  for (let s = Math.max(0, s0); s <= Math.min(l.length, s1); s += 1.5) {
    const p = c.graph.pointAt(l, s, scratch);
    if (c.pedNear(p.x, p.z, PED_R)) return s;
  }
  return undefined;
}

/** 차선 l 끝(정지선, 차 앞에서 d m)에서 서야 하나 — 신호·교차로 막힘·우회전 양보·연결로 위 보행자. n·n2 = l 다음·그다음. */
function stopAtEnd(
  c: YieldCtx,
  v: YieldVehicle,
  l: Lane,
  d: number,
  n: Lane | undefined,
  n2: Lane | undefined,
): boolean {
  if (l.signal !== LANE_NO_SIGNAL && !(v.committed && l === v.lane)) {
    const lamp = c.lamp(l.signal);
    const canStop = d > (v.v * v.v) / (2 * YELLOW_DECEL);
    if (lamp === 'R' || (lamp === 'Y' && canStop)) return true;
    if (!canStop && l === v.lane) v.committed = true;
  }
  if (!n || n.kind !== 1) return false;
  if (n2 && c.occupiedNearStart(n2, v.len + 3)) return true;
  if (n.turn === LANE_TURN.right && c.oncoming(l, ONCOMING_M, ONCOMING_V)) return true;
  if (pedOnLane(c, n, 0, n.length) !== undefined) return true;
  return n2 !== undefined && pedOnLane(c, n2, 0, 8) !== undefined;
}

/** 가상 정지 지점까지 순간격(m, 앞차 간격과 같은 뜻) — 없으면 ∞. */
export function virtualGap(c: YieldCtx, v: YieldVehicle): number {
  const l = v.lane;
  const toEnd = l.length - v.s;
  let gap = Number.POSITIVE_INFINITY;
  if (toEnd < 80 && stopAtEnd(c, v, l, toEnd, v.next, v.next2)) gap = toEnd - STOP_MARGIN;
  // 셀 경계 포털로 이어진 도로 조각(짧은 조각 끝이 정지선일 수 있다)은 그 끝도 미리 본다.
  else if (v.next && v.next.kind === 0 && toEnd + v.next.length < 80) {
    const d2 = toEnd + v.next.length;
    if (stopAtEnd(c, v, v.next, d2, v.next2, c.graph.successors(v.next)[0])) gap = d2 - STOP_MARGIN;
  }
  // 같은 차선 앞(신호 없는 횡단·연결로 위)의 보행자.
  const ahead = pedOnLane(c, l, v.s + v.len / 2, v.s + PED_LOOK_M);
  if (ahead !== undefined) gap = Math.min(gap, ahead - v.s - v.len / 2 - 2);
  // 연결로 위에 이미 있으면 출구 첫 8 m의 보행자.
  if (l.kind === 1 && v.next) {
    const p = pedOnLane(c, v.next, 0, 8);
    if (p !== undefined) gap = Math.min(gap, toEnd + p - v.len / 2 - 2);
  }
  return gap;
}
