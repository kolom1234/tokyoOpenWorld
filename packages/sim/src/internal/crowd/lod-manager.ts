// 군중 LOD(10 §4.2, M06-T04 — ADR-0064): tier A(DetourCrowd, radiusA 안) ↔ tier B(흐름) 승강격. 히스테리시스 ± lodBandM(80 m ± 5) —
// 85 m 밖 A → B(정체성·목적지·대기·횡단 상태·위상 유지, 위치 그대로), 75 m 안 B → A(자리가 비고 A 상한 아래일 때). 틱당 이동 수 상한(비용 평탄화).
import type { CrowdAgentsParams } from '../../api.ts';
import type { TierAPool } from './agents-detour.ts';
import { identityOf } from './appearance.ts';
import { type FlowAgent, newFlow, sidePos } from './flow.ts';
import type { V3 } from './route.ts';

const MAX_MOVES_PER_TICK = 24;

/** 흐름 보행자가 화면에 그려지는 자리(가로 오프셋 포함) — 승격 위치(튀지 않게). */
export function outputPos(f: FlowAgent): V3 {
  return sidePos(f);
}

export interface LodMoves {
  promoted: number;
  demoted: number;
}

export function lodStep(a: TierAPool, flows: FlowAgent[], player: V3, p: CrowdAgentsParams): LodMoves {
  const out: LodMoves = { promoted: 0, demoted: 0 };
  const far = p.radiusA + p.lodBandM;
  const near = p.radiusA - p.lodBandM;
  for (let i = a.agents.length - 1; i >= 0 && out.demoted < MAX_MOVES_PER_TICK; i--) {
    const pos = (a.agents[i] as (typeof a.agents)[number]).ca.position();
    if (Math.hypot(pos.x - player.x, pos.z - player.z) <= far) continue;
    flows.push(newFlow(a.removeAt(i), pos));
    out.demoted++;
  }
  for (let i = flows.length - 1; i >= 0 && out.promoted < MAX_MOVES_PER_TICK; i--) {
    if (a.agents.length >= p.maxA) break;
    const f = flows[i] as FlowAgent;
    if (Math.hypot(f.pos.x - player.x, f.pos.z - player.z) >= near) continue;
    if (!a.addAt(outputPos(f), identityOf(f))) continue;
    flows[i] = flows[flows.length - 1] as FlowAgent;
    flows.pop();
    out.promoted++;
  }
  return out;
}
