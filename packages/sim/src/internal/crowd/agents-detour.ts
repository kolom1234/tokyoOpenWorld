// tier A 군중(10 §4.2, M06-T03 — ADR-0063): DetourCrowd(회피·분리) + 상태 기계(agent-fsm). 플레이어 반경 radiusA 안 목표 수(density)만큼
// 스폰(횡단 띠 제외 걷는 면, 핫스팟 가중 수락, 플레이어 spawnMinDistM 밖), despawnA 밖 제거. 플레이어는 조향 없는 에이전트(매 틱 순간이동 + 속도)로
// 넣어 보행자가 피한다. 결정론: 스폰 순번 seq → createRng(hash32(WORLD_SEED, 'pedA', seq)) + Detour 난수 시드.
import { Crowd, setRandomSeed } from '@recast-navigation/core';
import { createRng, hash32, type Vec3, WORLD_SEED } from '@sanpo/core';
import { NAV_FLAG, NAV_NO_SIGNAL } from '@sanpo/tile-format';
import type { CrowdAgentsParams, CrowdParams } from '../../api.ts';
import { type Agent, FILTER, type FsmCtx, type PedLamp, plan, STATE, stepAgent } from './agent-fsm.ts';
import { writeAgents } from './agent-output.ts';
import { hotspotWeight, maxHotspotWeight, tierATarget } from './density.ts';
import { CLIP } from './dummy.ts';
import { configureFilter, type NavWorld } from './nav-world.ts';
import { type CrossingHit, crossingPoints, keepLeftLat, type V3 } from './route.ts';

const KIND_A = 0x70656441; // 'pedA'
const AGENT = { radius: 0.3, height: 1.7, maxAcceleration: 6, collisionQueryRange: 2.5, pathOptimizationRange: 12 };
/** ANTICIPATE_TURNS | OBSTACLE_AVOIDANCE | SEPARATION | OPTIMIZE_VIS | OPTIMIZE_TOPO. */
const UPDATE_FLAGS = 1 | 2 | 4 | 8 | 16;
const SEPARATION = 1;
const HALF = { x: 8, y: 6, z: 8 };
const SPAWN_GAP_M = 0.65;

export interface TierAStats {
  agents: number;
  waiting: number;
  crossing: number;
  plans: number;
  spawned: number;
  despawned: number;
  /** 제거 사유: 내비메시 밖(INVALID)·오래 끼임. */
  offMesh: number;
  stuck: number;
}

export interface TierA {
  setPlayer(pos: Readonly<V3>, vel: Readonly<Vec3>): void;
  /** 스크램블 시험: 중심 radius 안 신호 횡단들의 양쪽 대기점에 count명(건너편 너머 목적지). 반환 = 만든 수. */
  scenario(center: Readonly<V3>, radius: number, count: number): number;
  /** dt(s) 진행 → out(WF − anchor)에 기록, 반환 = 쓴 수. */
  step(dt: number, gameMs: number, out: Float32Array, anchor: Readonly<V3>): number;
  stats(): TierAStats;
  /** 시험용: 에이전트 위치들. */
  positions(): V3[];
  destroy(): void;
}

interface TierCtx {
  nav: NavWorld;
  params: CrowdParams;
  p: CrowdAgentsParams;
  crowd: Crowd;
  agents: Agent[];
  player: { pos: V3 | undefined; vel: Vec3; ca: Agent['ca'] | undefined };
  st: { plans: number; spawned: number; despawned: number; offMesh: number; stuck: number };
  seq: number;
  filled: boolean;
  wMax: number;
  fsm: FsmCtx;
}

/** 걷는 면(횡단 아님) 무작위 점 — 중심에서 전체 필터로 닿는 곳. */
function randomWalkPoint(nav: NavWorld, center: V3, r: number, seed: number): V3 | undefined {
  setRandomSeed(seed & 0x7fffffff);
  const q = nav.query.findRandomPointAroundCircle(center, r, { filter: nav.allFilter, halfExtents: HALF });
  if (!q.success || (nav.navMesh.getPolyFlags(q.randomPolyRef).flags ?? 0) & NAV_FLAG.cross) return undefined;
  return q.randomPoint;
}

/** 스폰 자리: 다른 에이전트·플레이어와 SPAWN_GAP_M 이상(겹쳐 태어나면 Detour 충돌 풀이가 한동안 겹친 채로 둔다). */
function free(c: TierCtx, pos: V3): boolean {
  for (const o of c.agents) {
    const q = o.ca.position();
    if (Math.hypot(q.x - pos.x, q.z - pos.z) < SPAWN_GAP_M && Math.abs(q.y - pos.y) < 1.5) return false;
  }
  const pl = c.player.pos;
  return !pl || Math.hypot(pl.x - pos.x, pl.z - pos.z) >= SPAWN_GAP_M;
}

function newAgent(c: TierCtx, ca: Agent['ca'], s: number, rng: Agent['rng'], speed: number, pos: V3): Agent {
  return {
    ca,
    seq: s,
    rng,
    variant: Math.floor(rng.next() * 65536),
    speed,
    idleClip: rng.next() < c.p.phoneShare ? CLIP.phone : CLIP.idle,
    phase: rng.next(),
    yaw: rng.next() * Math.PI * 2,
    state: STATE.walk,
    dest: undefined,
    hit: undefined,
    lat: 0,
    depth: 0,
    target: undefined,
    react: 0,
    timer: 0,
    stuckS: 0,
    anchorX: pos.x,
    anchorZ: pos.z,
    needPlan: true,
    faceX: 0,
    faceZ: -1,
  };
}

function addAgent(c: TierCtx, pos: V3, s: number): Agent | undefined {
  if (!free(c, pos)) return undefined;
  const rng = createRng(hash32(WORLD_SEED, KIND_A, s));
  const speed = c.p.speed[0] + (c.p.speed[1] - c.p.speed[0]) * rng.next();
  const ca = c.crowd.addAgent(pos, {
    ...AGENT,
    maxSpeed: speed,
    separationWeight: SEPARATION,
    updateFlags: UPDATE_FLAGS,
  });
  if (!ca) return undefined;
  const a = newAgent(c, ca, s, rng, speed, pos);
  c.agents.push(a);
  c.st.spawned++;
  return a;
}

function removeAgent(c: TierCtx, i: number): void {
  const a = c.agents[i] as Agent;
  c.crowd.removeAgent(a.ca);
  c.agents[i] = c.agents[c.agents.length - 1] as Agent;
  c.agents.pop();
  c.st.despawned++;
}

function spawnSome(c: TierCtx, target: number): void {
  const center = c.player.pos;
  if (!center) return;
  const tries = c.filled ? c.p.spawnsPerTick : target;
  for (let k = 0; k < tries && c.agents.length < target; k++) {
    const s = ++c.seq;
    const q = randomWalkPoint(c.nav, center, c.p.radiusA, hash32(WORLD_SEED, KIND_A, s, 1));
    if (!q) continue;
    const d = Math.hypot(q.x - center.x, q.z - center.z);
    if (d > c.p.radiusA || (c.filled && d < c.p.spawnMinDistM)) continue;
    if (createRng(hash32(KIND_A, s, 2)).next() * c.wMax > hotspotWeight(c.params, q.x, q.z)) continue;
    addAgent(c, q, s);
  }
  c.filled = true;
}

/** 플레이어(내비 위일 때만): 조향 없는 에이전트로 순간이동 + 속도 — 보행자가 피한다. */
function syncPlayer(c: TierCtx): void {
  const pos = c.player.pos;
  if (!pos) return;
  const near = c.nav.query.findClosestPoint(pos, { filter: c.nav.allFilter, halfExtents: { x: 0.5, y: 1.5, z: 0.5 } });
  if (!near.success || Math.hypot(near.point.x - pos.x, near.point.z - pos.z) > 0.4) {
    if (c.player.ca) c.crowd.removeAgent(c.player.ca);
    c.player.ca = undefined;
    return;
  }
  c.player.ca ??=
    c.crowd.addAgent(near.point, { ...AGENT, radius: 0.35, maxSpeed: 12, maxAcceleration: 100, updateFlags: 0 }) ??
    undefined;
  c.player.ca?.teleport(near.point);
  c.player.ca?.requestMoveVelocity(c.player.vel);
}

function runScenario(c: TierCtx, center: Readonly<V3>, radius: number, count: number): number {
  const list = c.nav.crossingsNear(center.x, center.z, radius).filter((x) => x.signal !== NAV_NO_SIGNAL);
  let made = 0;
  for (let k = 0; made < count && list.length > 0 && k < count * 10; k++) {
    const s = ++c.seq;
    const rng = createRng(hash32(WORLD_SEED, KIND_A, s, 3));
    const rec = list[k % list.length] as (typeof list)[number];
    const hit: CrossingHit = { rec, fromA: rng.next() < 0.5 };
    const lat = keepLeftLat(rng.next());
    const depth = rng.next() * (2 + (6 * k) / (count * 10));
    const pts = crossingPoints(hit, lat, depth);
    const at = c.nav.query.findClosestPoint(pts.wait, { filter: c.nav.walkFilter, halfExtents: { x: 4, y: 4, z: 4 } });
    if (!at.success) continue;
    const a = addAgent(c, at.point, s);
    if (!a) continue;
    a.forced = hit;
    a.lat = lat;
    a.depth = depth;
    const far = { x: pts.exit.x + pts.dir[0] * 8, y: pts.exit.y, z: pts.exit.z + pts.dir[1] * 8 };
    a.dest = randomWalkPoint(c.nav, far, 6, hash32(KIND_A, s, 4)) ?? far;
    made++;
  }
  c.filled = true;
  return made;
}

function stepTier(c: TierCtx, dt: number, gameMs: number, out: Float32Array, anchor: Readonly<V3>): number {
  syncPlayer(c);
  const target = tierATarget(c.params, gameMs);
  const pl = c.player.pos;
  for (let i = c.agents.length - 1; i >= 0; i--) {
    const a = c.agents[i] as Agent;
    const pos = a.ca.position();
    const far = pl ? Math.hypot(pos.x - pl.x, pos.z - pl.z) > c.p.despawnA : false;
    const why = stepAgent(c.fsm, a, dt);
    if (why === 1) c.st.offMesh++;
    else if (why === 2) c.st.stuck++;
    if (why !== 0 || far) removeAgent(c, i);
  }
  let budget = c.p.plansPerTick;
  for (const a of c.agents) {
    if (budget <= 0) break;
    if (!a.needPlan) continue;
    budget--;
    c.st.plans++;
    plan(c.fsm, a);
  }
  if (c.agents.length < target) spawnSome(c, target);
  c.crowd.update(dt);
  return writeAgents(c.agents, c.params, out, anchor, dt);
}

export function createTierA(nav: NavWorld, params: CrowdParams, ped: (code: number) => PedLamp): TierA {
  const p = params.agents;
  if (!p) throw new Error('crowd: agents params missing');
  const crowd = new Crowd(nav.navMesh, { maxAgents: p.maxA + 2, maxAgentRadius: 0.6 });
  configureFilter(crowd.getFilter(FILTER.walk), false);
  configureFilter(crowd.getFilter(FILTER.all), true);
  const c: TierCtx = {
    nav,
    params,
    p,
    crowd,
    agents: [],
    player: { pos: undefined, vel: { x: 0, y: 0, z: 0 }, ca: undefined },
    st: { plans: 0, spawned: 0, despawned: 0, offMesh: 0, stuck: 0 },
    seq: 0,
    filled: false,
    wMax: maxHotspotWeight(params),
    fsm: {
      nav,
      p,
      ped: (code) => (code === NAV_NO_SIGNAL ? 'W' : ped(code)),
      pickDest: (a, pos) => {
        for (let k = 0; k < 4; k++) {
          const d = randomWalkPoint(
            nav,
            pos,
            p.dest[1],
            hash32(KIND_A, a.seq, Math.floor(a.rng.next() * 0xffffffff), k),
          );
          if (d && Math.hypot(d.x - pos.x, d.z - pos.z) >= p.dest[0]) return d;
        }
        return undefined;
      },
    },
  };
  return {
    setPlayer(pos, vel) {
      c.player.pos = { x: pos.x, y: pos.y, z: pos.z };
      c.player.vel = { x: vel.x, y: vel.y, z: vel.z };
    },
    scenario: (center, radius, count) => runScenario(c, center, radius, count),
    step: (dt, gameMs, out, anchor) => stepTier(c, dt, gameMs, out, anchor),
    stats: () => ({
      agents: c.agents.length,
      waiting: c.agents.filter((a) => a.state === STATE.wait).length,
      crossing: c.agents.filter((a) => a.state === STATE.cross).length,
      ...c.st,
    }),
    positions: () => c.agents.map((a) => a.ca.position()),
    destroy: () => crowd.destroy(),
  };
}
