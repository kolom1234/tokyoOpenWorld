// tier A 군중(10 §4.2, M06-T03 — ADR-0063): DetourCrowd(회피·분리) 에이전트 풀 + 상태 기계(agent-fsm). 스폰·tier 경계는 crowd-sim·lod-manager가 정하고
// 여기는 정체성(appearance)을 받아 에이전트를 만들고 지운다. 플레이어는 조향 없는 에이전트(매 틱 순간이동 + 속도)로 넣어 보행자가 피한다.
import { Crowd } from '@recast-navigation/core';
import type { Vec3 } from '@sanpo/core';
import type { CrowdAgentsParams } from '../../api.ts';
import { type Agent, FILTER, type FsmCtx, plan, STATE, startCross, stepAgent } from './agent-fsm.ts';
import { identityOf, type PedIdentity } from './appearance.ts';
import { configureFilter, type NavWorld } from './nav-world.ts';
import type { V3 } from './route.ts';

const AGENT = { radius: 0.3, height: 1.7, maxAcceleration: 6, collisionQueryRange: 2.5, pathOptimizationRange: 12 };
/** ANTICIPATE_TURNS | OBSTACLE_AVOIDANCE | SEPARATION | OPTIMIZE_VIS | OPTIMIZE_TOPO. */
const UPDATE_FLAGS = 1 | 2 | 4 | 8 | 16;
const SEPARATION = 1;
/** 스폰·승격 자리: 다른 에이전트·플레이어와 이만큼 떨어져야(겹쳐 태어나면 Detour 충돌 풀이가 한동안 겹친 채로 둔다). */
export const SPAWN_GAP_M = 0.65;

export interface TierAPool {
  readonly agents: readonly Agent[];
  /** 정체성으로 에이전트 생성(자리 비었을 때만). 대기·횡단·멈춤 상태는 그대로 이어 간다(승격 연속성). */
  addAt(pos: V3, id: PedIdentity, forced?: Agent['forced']): Agent | undefined;
  /** i번 에이전트를 지우고 정체성을 돌려준다(강등 — 위치는 호출 측이 먼저 읽는다). */
  removeAt(i: number): PedIdentity;
  free(pos: V3): boolean;
  setPlayer(pos: Readonly<V3> | undefined, vel: Readonly<Vec3>): void;
  /** 상태 전이·경로 계획(틱당 상한)·Detour 갱신. 반환 = 제거 사유별 수. */
  step(dt: number): { offMesh: number; stuck: number; plans: number };
  destroy(): void;
}

export function createTierAPool(nav: NavWorld, p: CrowdAgentsParams, fsm: FsmCtx): TierAPool {
  const crowd = new Crowd(nav.navMesh, { maxAgents: p.maxA + 2, maxAgentRadius: 0.6 });
  configureFilter(crowd.getFilter(FILTER.walk), false);
  configureFilter(crowd.getFilter(FILTER.all), true);
  const agents: Agent[] = [];
  const player = {
    pos: undefined as V3 | undefined,
    vel: { x: 0, y: 0, z: 0 },
    ca: undefined as Agent['ca'] | undefined,
  };

  const free = (pos: V3): boolean => {
    for (const o of agents) {
      const q = o.ca.position();
      if (Math.hypot(q.x - pos.x, q.z - pos.z) < SPAWN_GAP_M && Math.abs(q.y - pos.y) < 1.5) return false;
    }
    const pl = player.pos;
    return !pl || Math.hypot(pl.x - pos.x, pl.z - pos.z) >= SPAWN_GAP_M;
  };
  const removeAt = (i: number): PedIdentity => {
    const a = agents[i] as Agent;
    crowd.removeAgent(a.ca);
    agents[i] = agents[agents.length - 1] as Agent;
    agents.pop();
    return identityOf(a);
  };
  return {
    agents,
    free,
    addAt(pos, id, forced) {
      if (agents.length >= p.maxA || !free(pos)) return undefined;
      const a = makeAgent(crowd, fsm, pos, id, forced);
      if (a) agents.push(a);
      return a;
    },
    removeAt,
    setPlayer(pos, vel) {
      player.pos = pos ? { ...pos } : undefined;
      player.vel = { ...vel };
    },
    step: (dt) => stepPool(nav, crowd, agents, player, fsm, p, removeAt, dt),
    destroy: () => crowd.destroy(),
  };
}

/** 정체성 → Detour 에이전트(승격 연속성: 대기·멈춤은 그대로 서 있고, 횡단 중이면 바로 출구로). */
function makeAgent(crowd: Crowd, fsm: FsmCtx, pos: V3, id: PedIdentity, forced: Agent['forced']): Agent | undefined {
  // 횡단 중 승격이면 횡단 포함 필터로 놓는다(걷기 필터면 Detour가 가장 가까운 보도로 옮겨 놓아 튄다).
  const ca = crowd.addAgent(pos, {
    ...AGENT,
    queryFilterType: id.state === STATE.cross ? FILTER.all : FILTER.walk,
    maxSpeed: id.speed,
    separationWeight: SEPARATION,
    updateFlags: UPDATE_FLAGS,
  });
  if (!ca) return undefined;
  const a: Agent = { ...id, ca, target: undefined, stuckS: 0, anchorX: pos.x, anchorZ: pos.z, needPlan: true, forced };
  if (a.state === STATE.wait || a.state === STATE.dwell) a.needPlan = false;
  else if (a.state === STATE.cross && a.hit) {
    a.needPlan = false;
    startCross(fsm, a);
  }
  return a;
}

function stepPool(
  nav: NavWorld,
  crowd: Crowd,
  agents: Agent[],
  player: { pos: V3 | undefined; vel: Vec3; ca: Agent['ca'] | undefined },
  fsm: FsmCtx,
  p: CrowdAgentsParams,
  removeAt: (i: number) => PedIdentity,
  dt: number,
): { offMesh: number; stuck: number; plans: number } {
  syncPlayer(nav, crowd, player);
  const out = { offMesh: 0, stuck: 0, plans: 0 };
  for (let i = agents.length - 1; i >= 0; i--) {
    const why = stepAgent(fsm, agents[i] as Agent, dt);
    if (why === 0) continue;
    if (why === 1) out.offMesh++;
    else out.stuck++;
    removeAt(i);
  }
  let budget = p.plansPerTick;
  for (const a of agents) {
    if (budget <= 0) break;
    if (!a.needPlan) continue;
    budget--;
    out.plans++;
    plan(fsm, a);
  }
  crowd.update(dt);
  return out;
}

/** 플레이어(내비 위일 때만): 조향 없는 에이전트로 순간이동 + 속도 — 보행자가 피한다. */
function syncPlayer(
  nav: NavWorld,
  crowd: Crowd,
  player: { pos: V3 | undefined; vel: Vec3; ca: Agent['ca'] | undefined },
): void {
  const pos = player.pos;
  const near = pos
    ? nav.query.findClosestPoint(pos, { filter: nav.allFilter, halfExtents: { x: 0.5, y: 1.5, z: 0.5 } })
    : undefined;
  if (!pos || !near?.success || Math.hypot(near.point.x - pos.x, near.point.z - pos.z) > 0.4) {
    if (player.ca) crowd.removeAgent(player.ca);
    player.ca = undefined;
    return;
  }
  player.ca ??=
    crowd.addAgent(near.point, { ...AGENT, radius: 0.35, maxSpeed: 12, maxAcceleration: 100, updateFlags: 0 }) ??
    undefined;
  player.ca?.teleport(near.point);
  player.ca?.requestMoveVelocity(player.vel);
}
