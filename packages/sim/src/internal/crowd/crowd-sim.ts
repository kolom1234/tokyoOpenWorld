// 군중 오케스트레이터(10 §4, M06-T03·T04 — ADR-0063·0064): 목표 총수 = (maxA + maxB) × 시간대 곡선 × 날씨 배율. 처음(또는 절반 아래로 줄면) 반경 radiusB 안
// 어디든 채우고(radiusA 안 = tier A), 그 뒤엔 멀리(farSpawnM 밖) 또는 시야 밖에서만 tier B로 스폰 — 가까이 오는 사람은 걸어서 들어온다(팝핑 없음).
// tier B는 despawnB 밖 제거, A↔B는 lod-manager. 출력 = A 다음 B(SAB 칸).
import { setRandomSeed } from '@recast-navigation/core';
import { hash32, type Vec3, WORLD_SEED } from '@sanpo/core';
import { NAV_FLAG, NAV_NO_SIGNAL } from '@sanpo/tile-format';
import type { CrowdAgentsParams, CrowdParams } from '../../api.ts';
import type { Agent, FsmCtx, PedLamp } from './agent-fsm.ts';
import { writeAgents, writeFlows } from './agent-output.ts';
import { createTierAPool, type TierAPool } from './agents-detour.ts';
import { newIdentity, type PedIdentity, STATE } from './appearance.ts';
import { hotspotWeight, maxHotspotWeight, totalTarget } from './density.ts';
import { type FlowAgent, newFlow, planFlow, stepFlow } from './flow.ts';
import { lodStep, outputPos } from './lod-manager.ts';
import type { NavWorld } from './nav-world.ts';
import { type CrossingHit, crossingPoints, keepLeftLat, type V3 } from './route.ts';

const KIND = 0x70656441; // 'pedA'
const xz = (p: V3) => ({ x: p.x, z: p.z });
const HALF = { x: 8, y: 6, z: 8 };
/** 시야 밖 판정: 카메라 전방과 이 각보다 벌어지면(cos). */
const OUT_OF_VIEW_COS = Math.cos((65 * Math.PI) / 180);

export interface CrowdSimStats {
  agents: number;
  flow: number;
  waiting: number;
  crossing: number;
  plans: number;
  spawned: number;
  despawned: number;
  offMesh: number;
  stuck: number;
  promoted: number;
  demoted: number;
  /** 처음 채우기 끝(목표의 90 % — 골든뷰 안정 조건, M06-T07). */
  filled: boolean;
}

export interface CrowdSim {
  setPlayer(pos: Readonly<V3>, vel: Readonly<Vec3>, fwd?: Readonly<Vec3>): void;
  /** 날씨 등 밀도 배율(비 0.6 — 10 §4.1). */
  setDensityScale(k: number): void;
  /** 스크램블 시험: 중심 radius 안 신호 횡단 대기점에 count명(tier A). 반환 = 만든 수. */
  scenario(center: Readonly<V3>, radius: number, count: number): number;
  step(dt: number, gameMs: number, out: Float32Array, anchor: Readonly<V3>): number;
  stats(): CrowdSimStats;
  /** 시험용: tier A 위치. */
  positions(): V3[];
  /** 시험용: 모든 보행자(순번·tier·그려지는 위치). */
  peds(): { seq: number; tier: 'A' | 'B'; x: number; z: number }[];
  /** 시험용(M06-T07 스크램블 지표): tier A 상태·횡단·위치. */
  inspect(): readonly Agent[];
  destroy(): void;
}

interface Ctx {
  nav: NavWorld;
  params: CrowdParams;
  p: CrowdAgentsParams;
  fsm: FsmCtx;
  a: TierAPool;
  flows: FlowAgent[];
  player: { pos: V3 | undefined; vel: Vec3; fwd: Vec3 | undefined };
  st: CrowdSimStats;
  seq: number;
  filled: boolean;
  scale: number;
  wMax: number;
}

/** 걷는 면(횡단 아님) 무작위 점 — center 근처 폴리곤에서 전체 필터로 닿는 곳(목적지 — 연결된 곳만). */
function randomWalkPoint(nav: NavWorld, center: V3, r: number, seed: number): V3 | undefined {
  // Detour 난수(frand)는 전역 — 호출마다 시드(결정론).
  setRandomSeed(seed & 0x7fffffff);
  const q = nav.query.findRandomPointAroundCircle(center, r, { filter: nav.allFilter, halfExtents: HALF });
  if (!q.success || (nav.navMesh.getPolyFlags(q.randomPolyRef).flags ?? 0) & NAV_FLAG.cross) return undefined;
  return q.randomPoint;
}

/** 면적 균일 스폰 후보: 원 안 무작위 xz → 가장 가까운 걷는 폴리곤(4 m 안, 세로 ±150 m — freecam 상공에서도). 연결성과 무관(섬 같은 작은 영역도). */
function spawnCandidate(c: Ctx, center: V3, r: number, seed: number): V3 | undefined {
  const a = ((seed & 0xffff) / 0x10000) * Math.PI * 2;
  const d = Math.sqrt(((seed >>> 16) & 0xffff) / 0x10000) * r;
  const p = { x: center.x + Math.cos(a) * d, y: center.y, z: center.z + Math.sin(a) * d };
  const q = c.nav.query.findNearestPoly(p, { filter: c.nav.allFilter, halfExtents: { x: 4, y: 150, z: 4 } });
  if (!q.success || !q.nearestRef || (c.nav.navMesh.getPolyFlags(q.nearestRef).flags ?? 0) & NAV_FLAG.cross)
    return undefined;
  return q.nearestPoint;
}

/** 새 사람 하나: 목표 수가 모자랄 때. 채우기 단계면 어디든, 아니면 멀리·시야 밖. */
function spawnOne(c: Ctx, fill: boolean): void {
  const center = c.player.pos;
  if (!center) return;
  const s = ++c.seq;
  const q = spawnCandidate(c, center, c.p.radiusB, hash32(WORLD_SEED, KIND, s, 1));
  if (!q) return;
  const dx = q.x - center.x;
  const dz = q.z - center.z;
  const d = Math.hypot(dx, dz);
  if (d > c.p.radiusB) return;
  if (!fill) {
    const f = c.player.fwd;
    const behind = f !== undefined && (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) || 1) < OUT_OF_VIEW_COS;
    if (d < c.p.farSpawnM && !(behind && d > c.p.radiusA + c.p.lodBandM)) return;
  }
  if ((hash32(KIND, s, 2) / 0xffffffff) * c.wMax > hotspotWeight(c.params, q.x, q.z)) return;
  const id = newIdentity(s, c.p);
  if (d < c.p.radiusA && c.a.addAt(q, id)) {
    c.st.spawned++;
    return;
  }
  if (d >= c.p.radiusA - c.p.lodBandM) {
    c.flows.push(newFlow(id, q));
    c.st.spawned++;
  }
}

function spawn(c: Ctx, target: number): void {
  const total = c.a.agents.length + c.flows.length;
  if (total >= target) return;
  const fill = !c.filled || total < target / 2;
  // 평소: 모자람이 3 % 넘으면 3배로 시도(멀리·시야 밖 후보는 대부분 버려진다).
  const steady = target - total > target * 0.03 ? c.p.spawnsPerTick * 3 : c.p.spawnsPerTick;
  const tries = Math.min(target - total, fill ? c.p.fillPerTick : steady);
  for (let k = 0; k < tries; k++) spawnOne(c, fill);
  if (c.a.agents.length + c.flows.length >= target * 0.9) c.filled = true;
}

function stepFlows(c: Ctx, dt: number): void {
  const pl = c.player.pos;
  let budget = c.p.plansPerTickB;
  for (let i = c.flows.length - 1; i >= 0; i--) {
    const f = c.flows[i] as FlowAgent;
    if (pl && Math.hypot(f.pos.x - pl.x, f.pos.z - pl.z) > c.p.despawnB) {
      c.flows[i] = c.flows[c.flows.length - 1] as FlowAgent;
      c.flows.pop();
      c.st.despawned++;
      continue;
    }
    if (f.needPlan && budget > 0) {
      budget--;
      c.st.plans++;
      planFlow(c.fsm, f);
    }
    stepFlow(c.fsm, f, dt);
  }
}

function runScenario(c: Ctx, center: Readonly<V3>, radius: number, count: number): number {
  const list = c.nav.crossingsNear(center.x, center.z, radius).filter((x) => x.signal !== NAV_NO_SIGNAL);
  let made = 0;
  for (let k = 0; made < count && list.length > 0 && k < count * 10; k++) {
    const s = ++c.seq;
    const id = newIdentity(s, c.p);
    const rec = list[k % list.length] as (typeof list)[number];
    const hit: CrossingHit = { rec, fromA: id.rng.next() < 0.5 };
    id.lat = keepLeftLat(id.rng.next());
    id.depth = id.rng.next() * (2 + (6 * k) / (count * 10));
    const pts = crossingPoints(hit, id.lat, id.depth);
    const at = c.nav.query.findClosestPoint(pts.wait, { filter: c.nav.walkFilter, halfExtents: { x: 4, y: 4, z: 4 } });
    if (!at.success) continue;
    const far = { x: pts.exit.x + pts.dir[0] * 8, y: pts.exit.y, z: pts.exit.z + pts.dir[1] * 8 };
    id.dest = randomWalkPoint(c.nav, far, 6, hash32(KIND, s, 4)) ?? far;
    if (!c.a.addAt(at.point, id, hit)) continue;
    made++;
  }
  c.filled = true;
  return made;
}

/**
 * 핫스팟 건너편 목적지(M06-T07): 원 안이고 난수 < crossShare면 중심 반대쪽(중심 너머 15–45 m) 근처 걷는 점 — 스크램블을 건너는 흐름(대각 포함).
 */
function acrossHotspot(nav: NavWorld, params: CrowdParams, a: PedIdentity, pos: V3): V3 | undefined {
  for (const h of params.density?.hotspots ?? []) {
    const [cx, cz] = h.centerWF;
    const dx = cx - pos.x;
    const dz = cz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > h.radiusM || d < 1 || a.rng.next() >= (h.crossShare ?? 0)) continue;
    const k = (d + 15 + a.rng.next() * 30) / d;
    const target = { x: pos.x + dx * k, y: pos.y, z: pos.z + dz * k };
    return randomWalkPoint(nav, target, 12, hash32(KIND, a.seq, Math.floor(a.rng.next() * 0xffffffff), 9));
  }
  return undefined;
}

function fsmOf(
  nav: NavWorld,
  params: CrowdParams,
  ped: (code: number) => PedLamp,
  walkLeft: (code: number) => number,
): FsmCtx {
  const p = params.agents as CrowdAgentsParams;
  return {
    nav,
    p,
    ped: (code) => (code === NAV_NO_SIGNAL ? 'W' : ped(code)),
    walkLeft: (code) => (code === NAV_NO_SIGNAL ? Number.POSITIVE_INFINITY : walkLeft(code)),
    pickDest: (a, pos) => {
      const across = acrossHotspot(nav, params, a, pos);
      if (across) return across;
      for (let k = 0; k < 4; k++) {
        const d = randomWalkPoint(nav, pos, p.dest[1], hash32(KIND, a.seq, Math.floor(a.rng.next() * 0xffffffff), k));
        if (d && Math.hypot(d.x - pos.x, d.z - pos.z) >= p.dest[0]) return d;
      }
      return undefined;
    },
  };
}

/** 한 틱: tier A(상태·계획·Detour) → tier B(이동·계획·먼 것 제거) → 승강격 → 스폰 → 출력(A 다음 B). */
function stepAll(c: Ctx, dt: number, gameMs: number, out: Float32Array, anchor: Readonly<V3>): number {
  const r = c.a.step(dt);
  c.st.offMesh += r.offMesh;
  c.st.stuck += r.stuck;
  c.st.despawned += r.offMesh + r.stuck;
  c.st.plans += r.plans;
  stepFlows(c, dt);
  if (c.player.pos) {
    const m = lodStep(c.a, c.flows, c.player.pos, c.p);
    c.st.promoted += m.promoted;
    c.st.demoted += m.demoted;
  }
  spawn(c, totalTarget(c.params, gameMs, c.scale));
  return writeFlows(c.flows, c.params, out, anchor, dt, writeAgents(c.a.agents, c.params, out, anchor, dt));
}

export function createCrowdSim(
  nav: NavWorld,
  params: CrowdParams,
  ped: (code: number) => PedLamp,
  walkLeft: (code: number) => number = () => Number.POSITIVE_INFINITY,
): CrowdSim {
  const p = params.agents;
  if (!p) throw new Error('crowd: agents params missing');
  const fsm = fsmOf(nav, params, ped, walkLeft);
  const zero = { agents: 0, flow: 0, waiting: 0, crossing: 0, plans: 0, spawned: 0, despawned: 0 };
  const c: Ctx = {
    nav,
    params,
    p,
    fsm,
    a: createTierAPool(nav, p, fsm),
    flows: [],
    player: { pos: undefined, vel: { x: 0, y: 0, z: 0 }, fwd: undefined },
    st: { ...zero, offMesh: 0, stuck: 0, promoted: 0, demoted: 0, filled: false },
    seq: 0,
    filled: false,
    scale: 1,
    wMax: maxHotspotWeight(params),
  };
  return {
    setPlayer(pos, vel, fwd) {
      c.player = { pos: { ...pos }, vel: { ...vel }, fwd: fwd ? { ...fwd } : c.player.fwd };
      c.a.setPlayer(c.player.pos, c.player.vel);
    },
    setDensityScale(k) {
      c.scale = k;
    },
    scenario: (center, radius, count) => runScenario(c, center, radius, count),
    step: (dt, gameMs, out, anchor) => stepAll(c, dt, gameMs, out, anchor),
    stats() {
      const all = [...c.a.agents, ...c.flows];
      c.st.agents = c.a.agents.length;
      c.st.flow = c.flows.length;
      c.st.waiting = all.filter((x) => x.state === STATE.wait).length;
      c.st.crossing = all.filter((x) => x.state === STATE.cross).length;
      return { ...c.st, filled: c.filled };
    },
    positions: () => c.a.agents.map((x) => x.ca.position()),
    inspect: () => c.a.agents,
    peds: () => [
      ...c.a.agents.map((x) => ({ seq: x.seq, tier: 'A' as const, ...xz(x.ca.position()) })),
      ...c.flows.map((f) => ({ seq: f.seq, tier: 'B' as const, ...xz(outputPos(f)) })),
    ],
    destroy: () => c.a.destroy(),
  };
}
