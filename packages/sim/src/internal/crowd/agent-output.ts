// 군중 출력(M06-T03 tier A·T04 tier B): 보행자 → SAB 인스턴스 칸(stride 8 — ADR-0061 필드). yaw = 속도 방향(느리면 유지, 대기 중 = 건널 방향)을 초당 TURN_RAD_S로 돌린다,
// 클립 = 실제 속력(0.25 m/s 미만 = 대기·휴대폰, 1.05 미만 느린 걸음, 1.5 초과 빠른 걸음), 위상 = 속력 ÷ 보행 주기 적분.
import type { CrowdParams } from '../../api.ts';
import { STRIDE } from '../worker/instance-buffer.ts';
import { type Agent, STATE } from './agent-fsm.ts';
import type { PedIdentity } from './appearance.ts';
import { CLIP } from './dummy.ts';
import { type FlowAgent, sidePos } from './flow.ts';
import type { V3 } from './route.ts';

const TURN_RAD_S = 5;

/** tier B: 꺾은선 위치 + 진행 방향 오른쪽 가로 오프셋(side). start = 이미 쓴 칸 수. 반환 = 끝 칸 수. */
export function writeFlows(
  flows: readonly FlowAgent[],
  params: CrowdParams,
  out: Float32Array,
  anchor: Readonly<V3>,
  dt: number,
  start: number,
): number {
  let n = start;
  for (const f of flows) {
    if ((n + 1) * STRIDE > out.length) break;
    // 진행 방향(저역 통과 h) 오른쪽 = (−hz, hx)(WF +X 동·−Z 북: 북향 (0, −1)의 오른쪽 = 동 (1, 0)).
    const pos = sidePos(f);
    writeOne(out, n, f, pos, f.vx, f.vz, params, anchor, dt);
    n++;
  }
  return n;
}

function writeOne(
  out: Float32Array,
  n: number,
  a: PedIdentity,
  pos: V3,
  vx: number,
  vz: number,
  params: CrowdParams,
  anchor: Readonly<V3>,
  dt: number,
): void {
  const sp = Math.hypot(vx, vz);
  let want = a.yaw;
  if (sp > 0.15) want = Math.atan2(-vx, -vz);
  else if (a.state === STATE.wait) want = Math.atan2(-a.faceX, -a.faceZ);
  let dy = ((((want - a.yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  dy = Math.max(-TURN_RAD_S * dt, Math.min(TURN_RAD_S * dt, dy));
  a.yaw += dy;
  const moving = sp > 0.25;
  const clip = !moving ? a.idleClip : sp < 1.05 ? CLIP.walkSlow : sp > 1.5 ? CLIP.walkFast : CLIP.walk;
  const rate = moving ? sp / params.gaitCycleM : 1 / params.idleLoopS;
  a.phase = (a.phase + rate * dt) % 1;
  const o = n * STRIDE;
  out[o] = pos.x - anchor.x;
  out[o + 1] = pos.y - anchor.y;
  out[o + 2] = pos.z - anchor.z;
  out[o + 3] = a.yaw;
  out[o + 4] = clip + Math.min(moving ? sp : 0, 9.99) / 10;
  out[o + 5] = a.phase;
  out[o + 6] = a.variant;
  out[o + 7] = rate;
}

/** tier A: Detour 위치·속도. 반환 = 쓴 칸 수. */
export function writeAgents(
  agents: readonly Agent[],
  params: CrowdParams,
  out: Float32Array,
  anchor: Readonly<V3>,
  dt: number,
): number {
  let n = 0;
  for (const a of agents) {
    if ((n + 1) * STRIDE > out.length) break;
    const v = a.ca.velocity();
    writeOne(out, n, a, a.ca.position(), v.x, v.z, params, anchor, dt);
    n++;
  }
  return n;
}
