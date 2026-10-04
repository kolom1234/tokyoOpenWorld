// tier A 출력(M06-T03): 에이전트 → SAB 인스턴스 칸(stride 8 — ADR-0061 필드). yaw = 속도 방향(느리면 유지, 대기 중 = 건널 방향)을 초당 TURN_RAD_S로 돌린다,
// 클립 = 실제 속력(0.25 m/s 미만 = 대기·휴대폰, 1.05 미만 느린 걸음, 1.5 초과 빠른 걸음), 위상 = 속력 ÷ 보행 주기 적분.
import type { CrowdParams } from '../../api.ts';
import { STRIDE } from '../worker/instance-buffer.ts';
import { type Agent, STATE } from './agent-fsm.ts';
import { CLIP } from './dummy.ts';
import type { V3 } from './route.ts';

const TURN_RAD_S = 5;

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
    const pos = a.ca.position();
    const v = a.ca.velocity();
    const sp = Math.hypot(v.x, v.z);
    let want = a.yaw;
    if (sp > 0.15) want = Math.atan2(-v.x, -v.z);
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
    n++;
  }
  return n;
}
