// M11-T06 사용량 판정: 청구 주기, 포함량 70 % 초과(ours·account 따로), 주기 말 예상·초과 요금, 급증 참고표. 집계 = usage-collect.test.ts.
import { describe, expect, it } from 'vitest';
import {
  add,
  billingCycle,
  emptyUsage,
  evaluate,
  markdown,
  overThreshold,
  r2Class,
  spikes,
  type Usage,
} from '../lib/usage.ts';

const NOW = new Date('2026-10-31T03:00:00Z');
const CYCLE = billingCycle(NOW, 25);

function usage(entries: [keyof Usage, string, boolean, number][]): Usage {
  const u = emptyUsage();
  for (const [m, name, ours, n] of entries) add(u, m, name, ours, n);
  return u;
}

const row = (rows: ReturnType<typeof evaluate>, metric: keyof Usage, scope: 'ours' | 'account') =>
  rows.find((r) => r.metric === metric && r.scope === scope);

describe('billing cycle', () => {
  it('starts on the billing day at 00:00 UTC', () => {
    expect(CYCLE.start.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(CYCLE.end.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(CYCLE.elapsed).toBeCloseTo((6 * 24 + 3) / (31 * 24), 6);
    expect(CYCLE.daysLeft).toBe(24); // 11-01 … 11-24
    const jan = billingCycle(new Date('2026-01-10T00:00:00Z'), 25);
    expect([jan.start.toISOString(), jan.end.toISOString()]).toEqual([
      '2025-12-25T00:00:00.000Z',
      '2026-01-25T00:00:00.000Z',
    ]);
    expect(billingCycle(new Date('2026-11-25T00:00:00Z'), 25).start.toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(() => billingCycle(NOW, 31)).toThrow();
  });
});

describe('paid plan', () => {
  it('flags only cycle-to-date usage above 70 % of the included amount, per scope', () => {
    const cycle = usage([
      ['kvWrites', 'CITYDATA_KV', false, 700_001],
      ['kvReads', 'CITYDATA_KV', false, 7_000_000],
      ['workersRequests', 'tokyo-sanpo', true, 173],
    ]);
    const today = usage([['kvWrites', 'CITYDATA_KV', false, 5_000]]);
    const rows = evaluate(cycle, today, 'paid', CYCLE);
    expect(overThreshold(rows).map((r) => `${r.metric}/${r.scope}`)).toEqual(['kvWrites/account']);
    expect(row(rows, 'kvWrites', 'ours')?.used).toBe(0);
    expect(row(rows, 'kvReads', 'account')?.ratio).toBe(0.7);
    expect(row(rows, 'workersRequests', 'ours')?.used).toBe(173);
  });
  it('does not open an issue for the daily KV write count that triggered #27', () => {
    const today = usage([['kvWrites', 'CITYDATA_KV', false, 1_300]]);
    const cycle = usage([['kvWrites', 'CITYDATA_KV', false, 75_617]]);
    expect(overThreshold(evaluate(cycle, today, 'paid', CYCLE))).toEqual([]);
  });
  it('projects the cycle end and prices the overage on account rows only', () => {
    const half = { ...CYCLE, elapsed: 0.5, daysLeft: 15 };
    const cycle = usage([
      ['kvWrites', 'CITYDATA_KV', false, 800_000],
      ['kvWrites', 'tokyo-sanpo KV', true, 100_000],
      ['r2StorageBytes', 'sanpo-world-dev', true, 8e9],
      ['doDurationGbS', 'ofp/SecLimiterDO', false, 300_000],
      ['queueOps', 'ofp-ingest', false, 600_000],
    ]);
    const today = usage([['r2StorageBytes', 'sanpo-world-dev', true, 14e9]]);
    const rows = evaluate(cycle, today, 'paid', half);
    const kv = row(rows, 'kvWrites', 'account');
    expect(kv?.projectedRatio).toBeCloseTo(1.8, 6);
    expect(kv?.extraUsd).toBeCloseTo(4, 6); // (1.8M − 1M) × $5/M
    expect(kv?.top).toBe('CITYDATA_KV 89 % · tokyo-sanpo KV 11 %');
    expect(row(rows, 'kvWrites', 'ours')?.extraUsd).toBe(0);
    const r2 = row(rows, 'r2StorageBytes', 'account');
    expect(r2?.projectedRatio).toBeCloseTo(1.5, 6); // 누적 8 GB-월 + 14 GB × 15일 ÷ 30 = 15 GB-월
    expect(r2?.extraUsd).toBeCloseTo(0.075, 6); // 5 GB-월 × $0.015
    expect(row(rows, 'doDurationGbS', 'account')?.extraUsd).toBeCloseTo(2.5, 6); // (600k − 400k) GB-s × $12.50/M
    expect(row(rows, 'queueOps', 'account')?.extraUsd).toBeCloseTo(0.08, 6); // 0.2M × $0.40/M
    expect(row(rows, 'aeWrites', 'account')?.extraUsd).toBe(0);
  });
});

describe('free plan (CF_PLAN=free)', () => {
  it('keeps the daily limits', () => {
    const today = usage([
      ['kvWrites', 'CITYDATA_KV', false, 1_300],
      ['queueOps', 'ofp-ingest', false, 7_001],
    ]);
    const rows = evaluate(emptyUsage(), today, 'free', CYCLE);
    expect(overThreshold(rows).map((r) => `${r.metric}/${r.scope}`)).toEqual(['kvWrites/account', 'queueOps/account']);
    expect(Number.isNaN(row(rows, 'kvWrites', 'account')?.projectedRatio)).toBe(true);
    expect(row(rows, 'workersCpuMs', 'account')).toBeUndefined();
    expect(markdown(rows, [], 'free', CYCLE, NOW)).toContain('| KV writes | account | 1,300 | 1,000/day | ⚠️ 130.0 % |');
  });
});

describe('spike reference', () => {
  it('compares today with the earlier days of the cycle', () => {
    const cycle = usage([
      ['kvWrites', 'CITYDATA_KV', false, 72_000],
      ['workersRequests', 'a', false, 6_000],
    ]);
    const today = usage([
      ['kvWrites', 'CITYDATA_KV', false, 60_000],
      ['workersRequests', 'a', false, 1_000],
    ]);
    const sp = spikes(cycle, today, 'paid', CYCLE, NOW);
    const kv = sp.find((s) => s.metric === 'kvWrites');
    expect(kv?.accountAvg).toBe(2_000); // (72,000 − 60,000) ÷ 6일
    expect(kv?.spike).toBe(true);
    expect(sp.find((s) => s.metric === 'workersRequests')?.spike).toBe(false); // 포함량 1 % 미만
    expect(sp.some((s) => s.metric === 'r2StorageBytes')).toBe(false);
  });
});

describe('r2', () => {
  it('classifies R2 operations', () => {
    expect(r2Class('PutObject')).toBe('A');
    expect(r2Class('CompleteMultipartUpload')).toBe('A');
    expect(r2Class('GetObject')).toBe('B');
    expect(r2Class('HeadObject')).toBe('B');
    expect(r2Class('DeleteObject')).toBe('free');
  });
});
