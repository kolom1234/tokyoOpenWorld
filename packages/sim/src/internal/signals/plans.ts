// 신호 계획(10 §5.2, M06-T02 — ADR-0062): content/sim/signal-plans.json → 단계 경계 누적·주기. 그룹 = [차량 A, 차량 B, 보행 A, 보행 B].
import type { SignalPlansFile, SignalState } from '../../api.ts';

export type VehicleLamp = SignalState['vehicle'];
export type PedLamp = SignalState['ped'];

export interface CompiledPlan {
  name: string;
  cycleS: number;
  /** 단계 시작(s, 주기 안). */
  starts: number[];
  phases: { durS: number; groups: [VehicleLamp, VehicleLamp, PedLamp, PedLamp] }[];
}

const VEH = new Set(['G', 'Y', 'R']);
const PED = new Set(['W', 'F', 'D']);

export function compilePlans(f: SignalPlansFile): CompiledPlan[] {
  return f.plans.map((p) => {
    let t = 0;
    const starts: number[] = [];
    const phases = p.phases.map((ph) => {
      const [a, b, pa, pb] = ph.groups;
      if (ph.durS <= 0 || !VEH.has(a ?? '') || !VEH.has(b ?? '') || !PED.has(pa ?? '') || !PED.has(pb ?? ''))
        throw new Error(`signal plan ${p.name}: bad phase ${JSON.stringify(ph)}`);
      starts.push(t);
      t += ph.durS;
      return { durS: ph.durS, groups: ph.groups as CompiledPlan['phases'][number]['groups'] };
    });
    return { name: p.name, cycleS: t, starts, phases };
  });
}
