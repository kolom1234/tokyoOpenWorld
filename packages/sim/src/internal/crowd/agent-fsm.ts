// tier A 보행자 상태 기계(10 §4.2, M06-T03 — ADR-0063): 걷기(목적지) → 접근(횡단 대기점) → 대기(보행 신호 W 전) → 횡단(띠 → 건너편) → 다시 계획.
// 녹색 점멸(F)엔 새로 건너지 않고, 건너는 중 F·D면 서두른다(최고 속력 × 1.35). 신호 없는 횡단은 바로 건넌다(차량이 양보 — T05).
// 계획(경로 탐색)은 틱당 상한이 있어 needPlan 표시만 하고 agents-detour가 순서대로 처리한다.
import type { CrowdAgent } from '@recast-navigation/core';
import { NAV_FLAG } from '@sanpo/tile-format';
import type { CrowdAgentsParams } from '../../api.ts';
import { type PedIdentity, STATE } from './appearance.ts';
import type { NavWorld } from './nav-world.ts';
import { type CrossingHit, crossingPoints, firstCrossing, keepLeftLat, type V3 } from './route.ts';

export { STATE } from './appearance.ts';
/** crowd 필터 번호(crowd.getFilter): 0 = 걷기만, 1 = 횡단 포함. */
export const FILTER = { walk: 0, all: 1 } as const;
const ARRIVE_M = 1.2;
const DEST_ARRIVE_M = 2;
/** 대기 줄: 대기점 이 거리 안에서 막히면 그 자리에서 대기. */
const CROWDED_M = 4;
const HURRY = 1.35;
/** 이 시간 동안 0.25 m도 못 가면 다시 계획, 그 3배면 제거. */
export const STUCK_S = 4;

/** tier A 보행자 = 정체성 + Detour 에이전트·목표·끼임 판정. */
export interface Agent extends PedIdentity {
  ca: CrowdAgent;
  target: V3 | undefined;
  stuckS: number;
  anchorX: number;
  anchorZ: number;
  needPlan: boolean;
  /** 시나리오(스크램블 시험): 첫 계획에서 이 횡단부터. */
  forced?: CrossingHit | undefined;
}

export type PedLamp = 'W' | 'F' | 'D';

export interface FsmCtx {
  nav: NavWorld;
  p: CrowdAgentsParams;
  /** 횡단 신호 코드 → 보행 램프(NAV_NO_SIGNAL = 항상 W). */
  ped: (code: number) => PedLamp;
  /** 목적지 고르기(실패 = undefined). */
  pickDest: (a: PedIdentity, pos: V3) => V3 | undefined;
}

const dist2 = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.z - b.z);
const lerp = (r: [number, number], t: number): number => r[0] + (r[1] - r[0]) * t;

export function snapWalk(c: FsmCtx, p: V3, reach = 2): V3 | undefined {
  const r = c.nav.query.findClosestPoint(p, { filter: c.nav.walkFilter, halfExtents: { x: reach, y: 3, z: reach } });
  return r.success ? r.point : undefined;
}

function moveTo(a: Agent, target: V3, filter: number, speed: number): void {
  a.ca.updateParameters({ queryFilterType: filter, maxSpeed: speed });
  a.ca.requestMoveTarget(target);
  a.target = target;
  a.stuckS = 0;
}

/** 띠 끝 너머 진행 방향으로 처음 걷기(횡단 아님) 폴리곤에 닿는 점(0.5 m 간격, 10 m까지) — 끝이 도로 한가운데·다른 횡단에 이어지는 경우. */
export function exitPoint(c: FsmCtx, from: V3, dir: readonly [number, number]): V3 | undefined {
  for (let s = 0; s <= 10; s += 0.5) {
    const p = { x: from.x + dir[0] * s, y: from.y, z: from.z + dir[1] * s };
    const r = c.nav.query.findClosestPoint(p, { filter: c.nav.walkFilter, halfExtents: { x: 0.3, y: 2, z: 0.3 } });
    if (r.success && Math.hypot(r.point.x - p.x, r.point.z - p.z) < 0.25) return r.point;
  }
  // 앞이 막힘(좁은 모서리) — 한 점(최근접)으로 모이면 겹쳐 쌓이므로 끝 근처 걷는 면의 무작위 점.
  const q = c.nav.query.findRandomPointAroundCircle(from, 3, {
    filter: c.nav.walkFilter,
    halfExtents: { x: 3, y: 3, z: 3 },
  });
  return q.success ? q.randomPoint : snapWalk(c, from, 6);
}

/** 횡단 시작(대기점 → 건너편). */
export function startCross(c: FsmCtx, a: Agent): void {
  if (!a.hit) return;
  const pts = crossingPoints(a.hit, a.lat, a.depth);
  const exit = exitPoint(c, pts.exit, pts.dir) ?? pts.exit;
  a.state = STATE.cross;
  moveTo(a, exit, FILTER.all, a.speed * 1.08);
}

/** 다음 구간 결정(두 tier 공용): 걷기 = 목적지까지(횡단 없음), 접근 = 첫 횡단의 대기점. 목적지가 없거나 경로가 없으면 undefined. */
export type RouteLeg = { kind: 'walk'; to: V3 } | { kind: 'approach'; to: V3 };

export function decideRoute(c: FsmCtx, a: PedIdentity, pos: V3, forced?: CrossingHit): RouteLeg | undefined {
  if (!a.dest || dist2(pos, a.dest) < DEST_ARRIVE_M) a.dest = c.pickDest(a, pos);
  if (!a.dest) return undefined;
  let hit = forced;
  if (!hit) {
    const path = c.nav.query.computePath(pos, a.dest, { filter: c.nav.allFilter, halfExtents: { x: 2, y: 3, z: 2 } });
    if (!path.success || path.path.length < 2) {
      a.dest = undefined;
      return undefined;
    }
    hit = firstCrossing(path.path, c.nav.crossingsNear(pos.x, pos.z, dist2(pos, a.dest) + 10));
  }
  if (!hit) {
    a.hit = undefined;
    a.state = STATE.walk;
    return { kind: 'walk', to: a.dest };
  }
  // 시나리오(forced)는 스폰한 대기점(lat·depth)을 그대로 쓴다.
  if (!forced && (hit.rec.id !== a.hit?.rec.id || hit.fromA !== a.hit.fromA)) {
    a.lat = keepLeftLat(a.rng.next());
    a.depth = a.rng.next() * a.rng.next() * 3;
  }
  a.hit = hit;
  const pts = crossingPoints(hit, a.lat, a.depth);
  a.faceX = pts.dir[0];
  a.faceZ = pts.dir[1];
  a.state = STATE.approach;
  return { kind: 'approach', to: snapWalk(c, pts.wait) ?? pts.wait };
}

/** 경로 계획(tier A): decideRoute → 걷기 필터로 이동. */
export function plan(c: FsmCtx, a: Agent): boolean {
  a.needPlan = false;
  const forced = a.forced;
  a.forced = undefined;
  const leg = decideRoute(c, a, a.ca.position(), forced);
  if (!leg) return false;
  moveTo(a, leg.to, FILTER.walk, a.speed);
  return true;
}

/** 대기점 도착·대기 중: W면 반응 시간 뒤 출발, F·D면 반응 시간을 다시 뽑는다. */
function waitStep(c: FsmCtx, a: Agent, dt: number): void {
  const lamp = a.hit ? c.ped(a.hit.rec.signal) : 'W';
  if (lamp === 'W') {
    a.react -= dt;
    if (a.react <= 0) startCross(c, a);
  } else a.react = lerp(c.p.reactionS, a.rng.next());
}

/** 도착: 목표 반경 안, 또는 붐벼 4 m 안에서 1 s 막힘(대기 줄 뒤·출구 무리). */
function arrived(a: Agent, pos: V3): boolean {
  const t = a.target as V3;
  const d = dist2(pos, t);
  if (a.state === STATE.walk) return d < DEST_ARRIVE_M;
  if (d < ARRIVE_M) return true;
  return d < CROWDED_M && a.stuckS > 1;
}

/** 횡단 폴리곤 위인가 — 그 위에서 걷기 필터로 바꾸면 Detour가 에이전트를 INVALID로 만든다. */
function onCross(c: FsmCtx, pos: V3): boolean {
  const r = c.nav.query.findNearestPoly(pos, { filter: c.nav.allFilter, halfExtents: { x: 0.2, y: 1, z: 0.2 } });
  return r.success && (c.nav.navMesh.getPolyFlags(r.nearestRef).flags & NAV_FLAG.cross) !== 0;
}

/** 틱마다 상태 전이(경로 계획은 표시만). 반환 = 제거 사유(0 = 유지, 1 = 내비메시 밖, 2 = 오래 끼임). */
export function stepAgent(c: FsmCtx, a: Agent, dt: number): 0 | 1 | 2 {
  const pos = a.ca.position();
  if (a.state === STATE.wait) {
    waitStep(c, a, dt);
    return 0;
  }
  if (a.state === STATE.dwell) {
    a.timer -= dt;
    if (a.timer <= 0) a.needPlan = true;
    return 0;
  }
  if (a.ca.state() === 0) return 1;
  if (a.state === STATE.cross && a.target && arrived(a, pos) && onCross(c, pos)) {
    // 출구가 아직 횡단 위(출구 탐색 실패) — 가장 가까운 보도로(필터는 횡단 포함 그대로). 못 찾으면 끼임 처리로.
    const next = snapWalk(c, pos, 6);
    if (next && dist2(next, a.target) > 0.3) {
      moveTo(a, next, FILTER.all, a.speed);
      return 0;
    }
  } else if (a.target && arrived(a, pos)) {
    if (a.state === STATE.approach) {
      a.ca.resetMoveTarget();
      a.state = STATE.wait;
      a.react = lerp(c.p.reactionS, a.rng.next());
      waitStep(c, a, 0);
    } else if (a.state === STATE.walk && a.rng.next() < c.p.dwellShare) {
      a.ca.resetMoveTarget();
      a.state = STATE.dwell;
      a.timer = lerp(c.p.dwellS, a.rng.next());
    } else a.needPlan = true;
    return 0;
  }
  if (a.state === STATE.cross && a.hit && c.ped(a.hit.rec.signal) !== 'W')
    a.ca.updateParameters({ maxSpeed: a.speed * HURRY });
  // 끼임: STUCK_S 동안 0.25 m 못 가면 다시 계획, 3배면 제거.
  if (Math.hypot(pos.x - a.anchorX, pos.z - a.anchorZ) > 0.25) {
    a.anchorX = pos.x;
    a.anchorZ = pos.z;
    a.stuckS = 0;
    return 0;
  }
  a.stuckS += dt;
  if (a.stuckS > STUCK_S * 3) return 2;
  if (a.stuckS > STUCK_S && !a.needPlan && !(a.state === STATE.cross && onCross(c, pos))) {
    a.dest = undefined;
    a.needPlan = true;
    a.stuckS = STUCK_S / 2;
  }
  return 0;
}
