// 비용 회로 차단기 판정(ADR-0104): ours 90 % 초과·account 예상 추가 요금 > $1, 주기 초반 외삽은 경과 3일 하한.
import { describe, expect, it } from 'vitest';
import { BREAKER, evaluateBreaker } from '../lib/breaker.ts';
import { add, billingCycle, emptyUsage, evaluate, type Usage } from '../lib/usage.ts';

function usage(entries: [keyof Usage, string, boolean, number][]): Usage {
  const u = emptyUsage();
  for (const [m, name, ours, n] of entries) add(u, m, name, ours, n);
  return u;
}

const at = (iso: string) => {
  const now = new Date(iso);
  return { now, cycle: billingCycle(now, 25) };
};

describe('cost circuit breaker', () => {
  it('stays closed for normal usage', () => {
    const { cycle } = at('2026-11-05T00:00:00Z');
    const u = usage([
      ['workersRequests', 'tokyo-sanpo', true, 200_000],
      ['kvWrites', 'other-project', false, 100_000],
    ]);
    const trip = evaluateBreaker(evaluate(u, emptyUsage(), 'paid', cycle), 'paid', cycle);
    expect(trip.tripped).toBe(false);
    expect(trip.extraUsd).toBe(0);
  });

  it('trips when any ours metric passes 90 % of the allowance', () => {
    const { cycle } = at('2026-11-20T00:00:00Z');
    const u = usage([['r2ClassB', 'sanpo-world-prod', true, 9_100_000]]);
    const trip = evaluateBreaker(evaluate(u, emptyUsage(), 'paid', cycle), 'paid', cycle);
    expect(trip.tripped).toBe(true);
    expect(trip.reasons[0]).toContain('ours');
    expect(trip.reasons[0]).toContain('91.0 %');
  });

  it('trips when the account projected overage passes $1 (other projects included)', () => {
    const { cycle } = at('2026-11-09T00:00:00Z'); // 15일 경과 ≈ 0.48
    // KV 쓰기 0.7M / 0.48 ≈ 1.45M → 0.45M 초과 × $5 = $2.3
    const u = usage([['kvWrites', 'orange-brook KV', false, 700_000]]);
    const trip = evaluateBreaker(evaluate(u, emptyUsage(), 'paid', cycle), 'paid', cycle);
    expect(trip.tripped).toBe(true);
    expect(trip.extraUsd).toBeGreaterThan(BREAKER.accountExtraUsd);
    expect(trip.reasons.at(-1)).toContain('account');
  });

  it('floors early-cycle extrapolation at 3 days (no trip from a first-hour burst)', () => {
    const { cycle } = at('2026-10-25T01:00:00Z'); // 1시간 경과
    // 1시간에 KV 쓰기 20k — 그대로 외삽하면 ≈ 14.9M(초과 $69), 3일 하한이면 ≈ 0.2M(초과 없음).
    const u = usage([['kvWrites', 'other-project', false, 20_000]]);
    const rows = evaluate(u, emptyUsage(), 'paid', cycle);
    expect(rows.find((r) => r.metric === 'kvWrites' && r.scope === 'account')?.extraUsd).toBeGreaterThan(1);
    expect(evaluateBreaker(rows, 'paid', cycle).tripped).toBe(false);
  });

  it('still trips on overage already incurred early in the cycle', () => {
    const { cycle } = at('2026-10-25T06:00:00Z');
    const u = usage([['workersRequests', 'tokyo-sanpo', true, 14_000_000]]); // 이미 포함량 140 %
    const trip = evaluateBreaker(evaluate(u, emptyUsage(), 'paid', cycle), 'paid', cycle);
    expect(trip.tripped).toBe(true);
    expect(trip.reasons.some((r) => r.startsWith('ours'))).toBe(true);
    expect(trip.extraUsd).toBeGreaterThan(1);
  });
});
