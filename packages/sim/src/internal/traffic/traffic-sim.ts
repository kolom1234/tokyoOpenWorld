// 교통(10 §5.1, M06-T05 — ADR-0065): 차선 위 차량 = (차선, s, v). 틱마다 차선별 정렬 → 앞차 간격(다음 차선까지 이어 봄)·가상 정지(yielding) → IDM → 이동·차선 넘김
// (다음 차선 = 들어갈 때 미리 고름 — 신호·회전 양보 판단용). 막다른 끝·despawnM 밖 = 제거, 모자라면 스폰(spawner). 감시: 적신호 통과 = 위반, 신호 대기 아닌데 150 s 정지 = 교착.
// 출력(SAB stride 8): x,y,z(WF − anchor)·yaw·속력·바퀴 회전(회전 수 0..1)·variant(차종·색·씨앗)·flags(bit0 제동등, bit1 좌·bit2 우 깜빡이).
import type { Rng } from '@sanpo/core';
import { hash32, WORLD_SEED } from '@sanpo/core';
import { LANE_NO_SIGNAL, LANE_TURN } from '@sanpo/tile-format';
import { STRIDE } from '../worker/instance-buffer.ts';
import { IDM_DEFAULT, idmAccel } from './idm.ts';
import type { Lane, LaneGraph, LanePoint } from './lane-graph.ts';
import { chooseNext } from './routing.ts';
import { newVehicle, pickSpawn, type TrafficParams } from './spawner.ts';
import { type CrossBand, virtualGap, type YieldCtx, type YieldVehicle } from './yielding.ts';

const KIND_SPAWN = 0x73706e76; // 'spnv'
const WHEEL_R = 0.33;
const DEADLOCK_S = 150;
/** 앞을 볼 최대 거리(m) — 다음·그다음 차선까지. */
const LOOK_M = 120;

export interface Vehicle extends YieldVehicle {
  seq: number;
  rng: Rng;
  type: number;
  variant: number;
  v0f: number;
  a: number;
  stillS: number;
  wheel: number;
  /** 차선 위 위치에서 계산한 yaw(출력). */
  yaw: number;
  /** 지나온 차선(최근 먼저, ≤ 4) — 차체 중심이 아직 거기 있을 수 있다(짧은 포털 조각·연결로 — 출력 연속, M06-T06). */
  trail: Lane[];
  /** 마지막 출력 차체 중심(WF, 바닥) — 물리 키네마틱 프레임(M06-T06). 아직 출력 전 = NaN. */
  px: number;
  py: number;
  pz: number;
}

export interface TrafficStats {
  vehicles: number;
  spawned: number;
  despawned: number;
  violations: number;
  deadlocks: number;
  /** 누적: Σ v·dt, Σ 제한속도·dt(평균 속도 비율 = 앞/뒤). */
  distM: number;
  limitM: number;
}

export interface TrafficSim {
  setPlayer(pos: { x: number; y: number; z: number }, fwd?: { x: number; z: number }): void;
  /** 셀이 빠져 지운 차선 위 차 제거. */
  dropLanes(ids: readonly number[]): void;
  step(dt: number, gameMs: number, out: Float32Array, anchor: { x: number; y: number; z: number }): number;
  stats(): TrafficStats;
  /** 시험용. */
  vehicles(): readonly Vehicle[];
}

export interface TrafficDeps {
  graph: LaneGraph;
  params: TrafficParams;
  lamp(code: number): 'G' | 'Y' | 'R';
  pedNear(x: number, z: number, r: number): boolean;
  /** 횡단보도 띠(군중 내비 월드, M06-T06) — 횡단보도 위 정차 금지. 없으면 규칙 없음. */
  crossingsNear?(x: number, z: number, r: number): readonly CrossBand[];
  /** 평균 속도 비율 집계 대상 차선(없으면 전부). */
  measure?: (l: Lane) => boolean;
  /** 시험·디버그: 적신호 통과 순간. */
  onViolation?: (v: Vehicle, lane: Lane) => void;
}

interface Ctx extends TrafficDeps {
  list: Vehicle[];
  byLane: Map<number, Vehicle[]>;
  player: { x: number; y: number; z: number } | undefined;
  fwd: { x: number; z: number } | undefined;
  st: TrafficStats;
  seq: number;
  filled: boolean;
  yc: YieldCtx;
}

const scratch: LanePoint = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };

function index(c: Ctx): void {
  c.byLane.clear();
  for (const v of c.list) {
    const a = c.byLane.get(v.lane.idx);
    if (a) a.push(v);
    else c.byLane.set(v.lane.idx, [v]);
  }
  for (const a of c.byLane.values()) a.sort((p, q) => p.s - q.s);
}

/** 앞차까지 순간격·속력 차 — 같은 차선 → 다음 → 그다음(LOOK_M까지). */
function leader(c: Ctx, v: Vehicle): { gap: number; dv: number } {
  const same = c.byLane.get(v.lane.idx) ?? [];
  const i = same.indexOf(v);
  const ahead = same[i + 1];
  if (ahead) return { gap: ahead.s - v.s - ahead.len, dv: v.v - ahead.v };
  let base = v.lane.length - v.s;
  for (const l of [v.next, v.next2]) {
    if (!l || base > LOOK_M) break;
    const first = (c.byLane.get(l.idx) ?? [])[0];
    if (first) return { gap: base + first.s - first.len, dv: v.v - first.v };
    base += l.length;
  }
  return { gap: Number.POSITIVE_INFINITY, dv: 0 };
}

function choose(c: Ctx, v: Vehicle, from: Lane): Lane | undefined {
  return chooseNext(c.graph.successors(from), v.rng);
}

/** 차선 끝을 넘김: 위반 감시·다음 차선으로(없으면 false = 제거). */
function advance(c: Ctx, v: Vehicle): boolean {
  while (v.s >= v.lane.length) {
    const l = v.lane;
    if (l.signal !== LANE_NO_SIGNAL && !v.committed && c.lamp(l.signal) === 'R') {
      c.st.violations++;
      c.onViolation?.(v, l);
    }
    const n = v.next;
    if (!n) return false;
    v.s -= l.length;
    v.trail.unshift(l);
    if (v.trail.length > 4) v.trail.pop();
    v.lane = n;
    v.next = v.next2;
    v.next2 = v.next ? choose(c, v, v.next) : undefined;
    v.committed = false;
  }
  return true;
}

function stepVehicle(c: Ctx, v: Vehicle, dt: number): boolean {
  const lead = leader(c, v);
  const stopGap = virtualGap(c.yc, v);
  const gap = Math.min(lead.gap, stopGap);
  const dv = stopGap < lead.gap ? v.v : lead.dv;
  const v0 = v.lane.speed * v.v0f;
  v.a = idmAccel(v.v, v0, gap, dv, IDM_DEFAULT);
  const nv = Math.max(0, v.v + v.a * dt);
  v.s += (v.v + nv) * 0.5 * dt;
  v.v = nv;
  if (c.measure?.(v.lane) ?? true) {
    c.st.distM += v.v * dt;
    c.st.limitM += v.lane.speed * dt;
  }
  v.wheel = (v.wheel + (v.v * dt) / (2 * Math.PI * WHEEL_R)) % 1;
  const waitingRed = v.lane.signal !== LANE_NO_SIGNAL && c.lamp(v.lane.signal) !== 'G';
  v.stillS = v.v < 0.1 && !waitingRed ? v.stillS + dt : 0;
  if (v.stillS > DEADLOCK_S) {
    c.st.deadlocks++;
    return false;
  }
  return advance(c, v);
}

function spawn(c: Ctx, target: number): void {
  const pl = c.player;
  if (!pl) return;
  const fill = !c.filled || c.list.length < target / 2;
  const tries = Math.min(target - c.list.length, fill ? 20 : c.params.spawnsPerTick);
  for (let k = 0; k < tries; k++) {
    const s = ++c.seq;
    const cand = pickSpawn(c.graph, hash32(WORLD_SEED, KIND_SPAWN, s), pl, c.params.spawnM);
    if (!cand) return;
    const d = Math.hypot(cand.x - pl.x, cand.z - pl.z);
    const f = c.fwd;
    const behind = f !== undefined && (cand.x - pl.x) * f.x + (cand.z - pl.z) * f.z < 0;
    if (!fill && d < c.params.farM && !behind) continue;
    const others = c.byLane.get(cand.lane.idx) ?? [];
    if (others.some((o) => Math.abs(o.s - cand.s) < 12)) continue;
    // 신호 정지선 60 m 앞엔 스폰하지 않음(적신호에 못 설 수 있다).
    if (cand.lane.signal !== LANE_NO_SIGNAL && cand.lane.length - cand.s < 60) continue;
    const nv = newVehicle(s);
    const v: Vehicle = {
      ...nv,
      lane: cand.lane,
      s: cand.s,
      v: cand.lane.speed * nv.v0f * 0.6,
      next: undefined,
      next2: undefined,
      committed: false,
      a: 0,
      stillS: 0,
      wheel: 0,
      yaw: 0,
      trail: [],
      px: Number.NaN,
      py: Number.NaN,
      pz: Number.NaN,
    };
    v.next = choose(c, v, cand.lane);
    v.next2 = v.next ? choose(c, v, v.next) : undefined;
    c.list.push(v);
    others.push(v);
    c.byLane.set(cand.lane.idx, others);
    c.st.spawned++;
  }
  if (c.list.length >= target * 0.9) c.filled = true;
}

function yieldCtx(c: Omit<Ctx, 'yc'>): YieldCtx {
  return {
    graph: c.graph,
    lamp: c.lamp,
    pedNear: c.pedNear,
    ...(c.crossingsNear ? { crossingsNear: c.crossingsNear } : {}),
    occupiedNearStart: (lane, len) => {
      const first = (c.byLane.get(lane.idx) ?? [])[0];
      return first !== undefined && first.s - first.len < len;
    },
    oncoming(lane, withinM, minV) {
      const end = c.graph.pointAt(lane, lane.length);
      const ex = end.x;
      const ez = end.z;
      const dx = end.dx;
      const dz = end.dz;
      for (const o of c.list) {
        if (o.lane === lane || o.lane.kind !== 0 || o.v < minV || o.lane.length - o.s > withinM) continue;
        if (o.next?.turn !== LANE_TURN.straight) continue;
        const oe = c.graph.pointAt(o.lane, o.lane.length, scratch);
        if (oe.dx * dx + oe.dz * dz > -0.7 || Math.hypot(oe.x - ex, oe.z - ez) > 45) continue;
        return true;
      }
      return false;
    },
  };
}

/** 차체 중심 = 앞 − 길이/2 — 새 차선 앞부분이면 지나온 차선을 거슬러(차선 넘김 때 중심이 앞으로 튀지 않게, M06-T06). */
function centerOf(c: Ctx, v: Vehicle): LanePoint {
  let back = v.s - v.len / 2;
  if (back >= 0) return c.graph.pointAt(v.lane, back, scratch);
  for (const l of v.trail) {
    back += l.length;
    if (back >= 0) return c.graph.pointAt(l, back, scratch);
  }
  const first = v.trail[v.trail.length - 1];
  return first ? c.graph.pointAt(first, 0, scratch) : c.graph.pointAt(v.lane, 0, scratch);
}

function writeOut(c: Ctx, out: Float32Array, anchor: { x: number; y: number; z: number }): number {
  let n = 0;
  for (const v of c.list) {
    if ((n + 1) * STRIDE > out.length) break;
    const p = centerOf(c, v);
    v.yaw = Math.atan2(-p.dx, -p.dz);
    const turnSoon = v.lane.kind === 1 ? v.lane.turn : v.lane.length - v.s < 30 ? (v.next?.turn ?? 0) : 0;
    const flags =
      (v.a < -0.5 || v.v < 0.1 ? 1 : 0) | (turnSoon === LANE_TURN.left ? 2 : turnSoon === LANE_TURN.right ? 4 : 0);
    const o = n * STRIDE;
    v.px = p.x;
    v.py = p.y;
    v.pz = p.z;
    out[o] = p.x - anchor.x;
    out[o + 1] = p.y - anchor.y;
    out[o + 2] = p.z - anchor.z;
    out[o + 3] = v.yaw;
    out[o + 4] = v.v;
    out[o + 5] = v.wheel;
    out[o + 6] = v.variant;
    out[o + 7] = flags;
    n++;
  }
  return n;
}

const hourJst = (ms: number): number => Math.floor((((ms / 3_600_000 + 9) % 24) + 24) % 24);

export function createTrafficSim(d: TrafficDeps): TrafficSim {
  const base = {
    ...d,
    list: [] as Vehicle[],
    byLane: new Map<number, Vehicle[]>(),
    player: undefined as Ctx['player'],
    fwd: undefined as Ctx['fwd'],
    st: { vehicles: 0, spawned: 0, despawned: 0, violations: 0, deadlocks: 0, distM: 0, limitM: 0 },
    seq: 0,
    filled: false,
  };
  const c: Ctx = { ...base, yc: yieldCtx(base) };
  c.yc = yieldCtx(c);
  return {
    setPlayer(pos, fwd) {
      c.player = { ...pos };
      if (fwd) c.fwd = { ...fwd };
    },
    dropLanes(ids) {
      const gone = new Set(ids);
      const keep = c.list.filter(
        (v) => !gone.has(v.lane.idx) && !(v.next && gone.has(v.next.idx)) && !(v.next2 && gone.has(v.next2.idx)),
      );
      c.st.despawned += c.list.length - keep.length;
      c.list = keep;
    },
    step(dt, gameMs, out, anchor) {
      index(c);
      const pl = c.player;
      const next: Vehicle[] = [];
      for (const v of c.list) {
        const far =
          pl && Math.hypot(c.graph.pointAt(v.lane, v.s, scratch).x - pl.x, scratch.z - pl.z) > c.params.despawnM;
        if (!far && stepVehicle(c, v, dt)) next.push(v);
        else c.st.despawned++;
      }
      c.list = next;
      index(c);
      const k = c.params.diurnal[hourJst(gameMs)] ?? 1;
      spawn(c, Math.round(c.params.maxVehicles * k));
      c.st.vehicles = c.list.length;
      return writeOut(c, out, anchor);
    },
    stats: () => ({ ...c.st }),
    vehicles: () => c.list,
  };
}
