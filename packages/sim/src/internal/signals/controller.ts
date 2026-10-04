// 신호 제어기(10 §5.2, M06-T02 — ADR-0062): 상태 = 게임 시각의 순수 함수(빨리감기·시각 점프 즉시 일관). 코드 = 교차로 ID × 16 + 계획 × 4 + 그룹
// (파이프라인 derive/props/signal-sites.ts와 같은 비트 배치). 주기 오프셋 = 기본 계획은 hash32(WORLD_SEED, 'signal', ID) mod 주기,
// 사이트 계획(스크램블 등 — 계획 ≥ 1)은 0: 한 사이트가 1020 묶음 여러 개(ID 여러 개)여도 같은 박자.
import { hash32, WORLD_SEED } from '@sanpo/core';
import type { SignalState } from '../../api.ts';
import type { CompiledPlan } from './plans.ts';

export const decodeSignal = (code: number) => ({
  id: Math.floor(code / 16),
  plan: Math.floor(code / 4) % 4,
  group: code % 4,
});

export const offsetOf = (id: number, cycleS: number): number =>
  hash32(WORLD_SEED, 'signal', id) % Math.max(1, Math.round(cycleS));

/** code의 그룹 상태(시각 = 초, 절대 — 게임 시각 ms ÷ 1000). 알 수 없는 계획 = 0번. */
export function signalState(plans: readonly CompiledPlan[], code: number, timeS: number): SignalState {
  const { id, plan, group } = decodeSignal(code);
  const p = plans[plan] ?? plans[0];
  if (!p || p.phases.length === 0) return { vehicle: 'R', ped: 'D', phase: 0, remainingS: 0, cycleS: 0 };
  const off = plan === 0 ? offsetOf(id, p.cycleS) : 0;
  const t = (((timeS + off) % p.cycleS) + p.cycleS) % p.cycleS;
  let k = p.starts.length - 1;
  while (k > 0 && (p.starts[k] as number) > t) k--;
  const ph = p.phases[k] as CompiledPlan['phases'][number];
  const g = ph.groups;
  const vehicle = group < 2 ? (g[group] as SignalState['vehicle']) : 'R';
  const ped = group >= 2 ? (g[group] as SignalState['ped']) : 'D';
  return { vehicle, ped, phase: k, remainingS: (p.starts[k] as number) + ph.durS - t, cycleS: p.cycleS };
}
