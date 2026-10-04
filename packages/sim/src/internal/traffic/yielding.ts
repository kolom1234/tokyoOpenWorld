// 양보·정지 규칙(10 §5.1·§5.2, M06-T05 — ADR-0065): 차 앞 "가상 정지 지점"까지 거리 — 적신호(황색은 편하게 설 수 있을 때만, 정지선 못 서게 가까우면 통과 약속),
// 교차로 안 막힘(나가는 차선에 자리 없으면 들어가지 않음), 우회전 = 대향 직진 양보(좌측통행), 회전·직진 모두 앞 경로의 보행자(횡단 중)·플레이어 앞에서 정지.
// 횡단보도 위 정차 금지(M06-T06, ADR-0066): 정지 지점 앞 35 m 안에서 경로가 횡단보도 띠(nav.bin 횡단 기록)에 들어가면 그 앞 1 m에서 선다 — OSM 교차점이
// 짧은 간선으로 쪼개진 곳(스크램블)도 경로(지금·다음·그다음 차선) 기준이라 같다. 연결로 너머 신호 차선의 적신호도 미리 본다.
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
/** 횡단보도 확인: 정지 지점 앞 거리(m)·띠 가장자리 여유(m)·띠 앞 정지 거리(m)·표본 간격(m). */
const CROSS_LOOK_M = 35;
const CROSS_EDGE_M = 0.8;
const CROSS_STOP_M = 1;
const CROSS_STEP_M = 0.75;
/** 정지선을 미리 보는 거리(m). */
const STOP_LOOK_M = 80;

/** 횡단보도 띠(nav.bin 횡단 기록): 중심선 a→b(WF xyz — xz만 씀)·반폭. */
export interface CrossBand {
  a: readonly number[];
  b: readonly number[];
  halfWidth: number;
}

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
  /** 반경 r 안 횡단보도 띠(군중 내비 월드). 없으면 횡단보도 정차 규칙 없음. */
  crossingsNear?(x: number, z: number, r: number): readonly CrossBand[];
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

/**
 * 앞 경로: 지금 → 다음 → 그다음 차선 + 후속이 하나뿐인 동안 이어서(셀 경계 포털 조각·연결로) STOP_LOOK_M까지 — 0.x m 포털 조각 때문에
 * 신호 차선이 세 번째 너머에 있어도 본다.
 */
function pathOf(c: YieldCtx, v: YieldVehicle): Lane[] {
  const path = [v.lane];
  let d = v.lane.length - v.s;
  for (const l of [v.next, v.next2]) {
    if (!l || d >= STOP_LOOK_M) return path;
    path.push(l);
    d += l.length;
  }
  while (d < STOP_LOOK_M && path.length < 8) {
    const succ = c.graph.successors(path[path.length - 1] as Lane);
    if (succ.length !== 1) break;
    path.push(succ[0] as Lane);
    d += (succ[0] as Lane).length;
  }
  return path;
}

/** 차 앞에서 경로를 따라 d m 앞 점. 경로가 짧으면 undefined. */
function pathPoint(c: YieldCtx, v: YieldVehicle, path: readonly Lane[], d: number): LanePoint | undefined {
  let s = v.s + d;
  for (const l of path) {
    if (s <= l.length) return c.graph.pointAt(l, s, scratch);
    s -= l.length;
  }
  return undefined;
}

function inBand(x: number, z: number, b: CrossBand): boolean {
  const ax = b.a[0] as number;
  const az = b.a[2] as number;
  const ux = (b.b[0] as number) - ax;
  const uz = (b.b[2] as number) - az;
  const L2 = ux * ux + uz * uz || 1;
  const t = Math.min(Math.max(((x - ax) * ux + (z - az) * uz) / L2, 0), 1);
  return Math.hypot(x - ax - ux * t, z - az - uz * t) <= b.halfWidth + CROSS_EDGE_M;
}

/**
 * 정지 지점(차 앞 dStop m) 앞 CROSS_LOOK_M 안에서 경로가 처음 횡단보도 띠에 드는 거리(entry). 차 앞이 이미 든 띠는 무시(지나가는 중) — inside = 그런 띠가 있음.
 */
function crosswalkBefore(
  c: YieldCtx,
  v: YieldVehicle,
  path: readonly Lane[],
  dStop: number,
): { entry: number | undefined; inside: boolean } {
  const none = { entry: undefined, inside: false };
  const sp = c.crossingsNear ? pathPoint(c, v, path, dStop) : undefined;
  if (!sp || !c.crossingsNear) return none;
  const bands = c.crossingsNear(sp.x, sp.z, CROSS_LOOK_M + 12);
  if (bands.length === 0) return none;
  const p0 = pathPoint(c, v, path, 0) as LanePoint;
  const skip = bands.filter((b) => inBand(p0.x, p0.z, b));
  for (let d = Math.max(0, dStop - CROSS_LOOK_M); d < dStop; d += CROSS_STEP_M) {
    const p = pathPoint(c, v, path, d);
    if (!p) break;
    for (const b of bands) if (!skip.includes(b) && inBand(p.x, p.z, b)) return { entry: d, inside: skip.length > 0 };
  }
  return { entry: undefined, inside: skip.length > 0 };
}

interface StopAhead {
  /** 차 앞에서 정지선까지(m). */
  d: number;
  lane: Lane;
  /** 정지선 신호(신호 차선이면). */
  lamp: 'G' | 'Y' | 'R' | undefined;
}

const stopOf = (c: YieldCtx, d: number, lane: Lane): StopAhead => ({
  d,
  lane,
  lamp: lane.signal === LANE_NO_SIGNAL ? undefined : c.lamp(lane.signal),
});

/** 정지선 — 지금 차선 끝(교차로 규칙 전부), 포털로 이어진 도로 조각 끝(같음), 그 너머 경로의 신호 차선 끝(적·설 수 있는 황색). 없으면 undefined. */
function stopAhead(c: YieldCtx, v: YieldVehicle, path: readonly Lane[]): StopAhead | undefined {
  let d = v.lane.length - v.s;
  if (d < STOP_LOOK_M && stopAtEnd(c, v, v.lane, d, v.next, v.next2)) return stopOf(c, d, v.lane);
  for (let i = 1; i < path.length; i++) {
    const l = path[i] as Lane;
    d += l.length;
    if (d >= STOP_LOOK_M) return undefined;
    if (l.kind !== 0) continue;
    // 셀 경계 포털로 이어진 도로 조각(짧은 조각 끝이 정지선일 수 있다)은 교차로 규칙까지.
    if (i === 1 && stopAtEnd(c, v, l, d, path[2], path[3] ?? c.graph.successors(l)[0])) return stopOf(c, d, l);
    if (l.signal === LANE_NO_SIGNAL) continue;
    const st = stopOf(c, d, l);
    if (st.lamp === 'R' || (st.lamp === 'Y' && d > (v.v * v.v) / (2 * YELLOW_DECEL))) return st;
  }
  return undefined;
}

/** 정지 지점까지 간격: 정지선 − 여유, 그 앞 횡단보도가 있으면 띠 앞 1 m. 황색인데 이미 횡단보도 안이면 통과(정지선이 띠 안일 때 — 스크램블). */
function stopGap(c: YieldCtx, v: YieldVehicle): number {
  const path = pathOf(c, v);
  const st = stopAhead(c, v, path);
  if (!st) return Number.POSITIVE_INFINITY;
  const cw = crosswalkBefore(c, v, path, st.d);
  if (cw.inside && st.lamp === 'Y' && cw.entry === undefined) {
    if (st.lane === v.lane) v.committed = true;
    return Number.POSITIVE_INFINITY;
  }
  return cw.entry === undefined ? st.d - STOP_MARGIN : Math.min(st.d - STOP_MARGIN, cw.entry - CROSS_STOP_M);
}

/** 가상 정지 지점까지 순간격(m, 앞차 간격과 같은 뜻) — 없으면 ∞. */
export function virtualGap(c: YieldCtx, v: YieldVehicle): number {
  const l = v.lane;
  const toEnd = l.length - v.s;
  let gap = stopGap(c, v);
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
