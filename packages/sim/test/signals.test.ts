// 신호 제어기(M06-T02 수락): 스크램블 계획 사이클이 계획표와 1 s 안에서 일치 — 단계 경계(오프셋 반영)마다 그룹 상태, 주기 반복, 기본 2현시 상호 배타.
import { describe, expect, it } from 'vitest';
import plansFile from '../../../content/sim/signal-plans.json';
import type { SignalPlansFile } from '../src/api.ts';
import { decodeSignal, offsetOf, signalState } from '../src/internal/signals/controller.ts';

import { compilePlans } from '../src/internal/signals/plans.ts';

const plans = compilePlans(plansFile as unknown as SignalPlansFile);
const code = (id: number, plan: number, group: number, slot = 0) => (id * 64 + slot) * 16 + plan * 4 + group;

describe('signal controller', () => {
  it('decodes codes like the pipeline packs them (24-bit, f32-exact)', () => {
    const c = code(0x3fff, 1, 3, 59);
    expect(c).toBeLessThan(2 ** 24);
    expect(Math.fround(c)).toBe(c);
    expect(decodeSignal(c)).toEqual({ id: 0x3fff, slot: 59, plan: 1, group: 3 });
  });

  it('runs the scramble plan within 1 s of the plan table at every phase boundary', () => {
    const p = plans[1];
    if (!p) throw new Error('no scramble plan');
    expect(p.name).toBe('scramble');
    expect(p.cycleS).toBe(120);
    const id = 4242;
    const off = 0; // 사이트 계획(≥ 1)은 오프셋 0 — 한 사이트 ID 여러 개여도 같은 박자
    const t0 = 1_800_000_000 - ((((1_800_000_000 + off) % p.cycleS) + p.cycleS) % p.cycleS); // 주기 시작 시각
    const table = (plansFile as unknown as SignalPlansFile).plans[1]?.phases ?? [];
    let start = 0;
    for (const [k, ph] of table.entries()) {
      // 단계 시작 + 0.5 s(경계 1 s 허용 안쪽)와 끝 − 0.5 s 모두 그 단계여야 한다.
      for (const t of [start + 0.5, start + ph.durS - 0.5]) {
        for (let g = 0; g < 4; g++) {
          const s = signalState(plans, code(id, 1, g), t0 + t);
          expect(s.phase).toBe(k);
          if (g < 2) expect(s.vehicle).toBe(ph.groups[g]);
          else expect(s.ped).toBe(ph.groups[g]);
        }
      }
      start += ph.durS;
    }
    // 전방향 보행: 26 s 녹 + 6 s 점멸 동안 차량 모두 적.
    const walk = signalState(plans, code(id, 1, 2), t0 + 87 + 10);
    expect([
      walk.ped,
      signalState(plans, code(id, 1, 0), t0 + 97).vehicle,
      signalState(plans, code(id, 1, 1), t0 + 97).vehicle,
    ]).toEqual(['W', 'R', 'R']);
    // 주기 반복.
    expect(signalState(plans, code(id, 1, 0), t0 + 10).vehicle).toBe(
      signalState(plans, code(id, 1, 0), t0 + 130).vehicle,
    );
  });

  it('offsets standard intersections by the progression slot but keeps site plans in phase', () => {
    expect(offsetOf(10, 120)).toBe(20);
    expect(signalState(plans, code(1, 0, 0, 0), 5000).phase).not.toBe(
      signalState(plans, code(1, 0, 0, 30), 5000).phase,
    );
    expect(signalState(plans, code(1, 1, 0, 0), 5000).phase).toBe(signalState(plans, code(999, 1, 0, 17), 5000).phase);
  });

  it('applies the progression offset to coordinated plans only (minor = 100 s, ADR-0069)', () => {
    const minor = plans.findIndex((p) => p.name === 'minor');
    expect(minor).toBe(2);
    expect(plans[minor]?.cycleS).toBe(100);
    expect(plans.map((p) => p.coordinated)).toEqual([true, false, true]);
    // 연동 칸 20(= 40 s): 시각을 40 s 늦추면 같은 단계.
    expect(signalState(plans, code(5, minor, 0, 20), 3000).phase).toBe(
      signalState(plans, code(5, minor, 0, 0), 3040).phase,
    );
    for (let t = 0; t < 100; t += 0.5) {
      const s = (g: number) => signalState(plans, code(9, minor, g), 2_000_000 + t);
      expect(s(0).vehicle === 'G' && s(1).vehicle === 'G').toBe(false);
    }
  });

  it('never gives conflicting greens in the standard plan', () => {
    for (let t = 0; t < 120; t += 0.5) {
      const s = (g: number) => signalState(plans, code(77, 0, g), 1_000_000 + t);
      expect(s(0).vehicle === 'G' && s(1).vehicle === 'G').toBe(false);
      // 보행 A는 차량 B 녹색과 같이 녹색이 아니다(교차 충돌).
      expect(s(2).ped !== 'D' && s(1).vehicle !== 'R').toBe(false);
      expect(s(3).ped !== 'D' && s(0).vehicle !== 'R').toBe(false);
    }
  });
});
