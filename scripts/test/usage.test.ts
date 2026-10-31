// M11-T06 사용량 판정: 청구 주기, 포함량 70 % 초과(ours·account 따로), 주기 말 예상·초과 요금, 급증 참고표, GraphQL 집계(ID 비노출).
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
import { tallyCounters, tallyStorage } from '../lib/usage-collect.ts';

const NOW = new Date('2026-10-31T03:00:00Z');
const CYCLE = billingCycle(NOW, 25);
const ID_OTHER = '425a66aa000000000000000000000001';
const ID_OURS = '938aa34bc73f4cce935ab383fbc0a098';

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
    const half = { ...CYCLE, elapsed: 0.5 };
    const cycle = usage([
      ['kvWrites', 'CITYDATA_KV', false, 800_000],
      ['kvWrites', 'tokyo-sanpo KV', true, 100_000],
      ['r2StorageBytes', 'sanpo-world-dev', true, 8e9],
    ]);
    const today = usage([['r2StorageBytes', 'sanpo-world-dev', true, 14e9]]);
    const rows = evaluate(cycle, today, 'paid', half);
    const kv = row(rows, 'kvWrites', 'account');
    expect(kv?.projectedRatio).toBeCloseTo(1.8, 6);
    expect(kv?.extraUsd).toBeCloseTo(4, 6); // (1.8M − 1M) × $5/M
    expect(kv?.top).toBe('CITYDATA_KV 89 % · tokyo-sanpo KV 11 %');
    expect(row(rows, 'kvWrites', 'ours')?.extraUsd).toBe(0);
    const r2 = row(rows, 'r2StorageBytes', 'account');
    expect(r2?.projectedRatio).toBeCloseTo(1.1, 6); // 평균 8 GB 절반 + 최근 14 GB 절반 = 11 GB
    expect(r2?.extraUsd).toBeCloseTo(0.015, 6);
    expect(row(rows, 'aeWrites', 'account')?.extraUsd).toBe(0);
  });
});

describe('free plan (CF_PLAN=free)', () => {
  it('keeps the daily limits', () => {
    const today = usage([['kvWrites', 'CITYDATA_KV', false, 1_300]]);
    const rows = evaluate(emptyUsage(), today, 'free', CYCLE);
    expect(overThreshold(rows).map((r) => `${r.metric}/${r.scope}`)).toEqual(['kvWrites/account']);
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

describe('graphql tally', () => {
  const kvName = (id: string) => (id === ID_OTHER ? 'CITYDATA_KV' : 'KV namespace #1');
  it('splits KV actions, keeps names only and marks ours', () => {
    const u = emptyUsage();
    tallyCounters(
      {
        w: [{ sum: { requests: 10, cpuTimeUs: 2_500 }, dimensions: { scriptName: 'tokyo-sanpo' } }],
        kv: [
          { sum: { requests: 5 }, dimensions: { actionType: 'write', namespaceId: ID_OTHER } },
          { sum: { requests: 2 }, dimensions: { actionType: 'delete', namespaceId: ID_OTHER } },
          { sum: { requests: 1 }, dimensions: { actionType: 'list', namespaceId: ID_OURS } },
          { sum: { requests: 3 }, dimensions: { actionType: 'other', namespaceId: ID_OTHER } },
        ],
        ae: [{ count: 4, dimensions: { dataset: 'sanpo_errors' } }],
        ops: [
          { sum: { requests: 7 }, dimensions: { actionType: 'GetObject', bucketName: 'sanpo-world-prod' } },
          { sum: { requests: 9 }, dimensions: { actionType: 'DeleteObject', bucketName: 'sanpo-world-prod' } },
        ],
      },
      u,
      kvName,
    );
    expect(u.workersCpuMs).toEqual([{ name: 'tokyo-sanpo', ours: true, n: 2.5 }]);
    expect(u.logEvents[0]?.n).toBe(10);
    expect(u.kvWrites).toEqual([{ name: 'CITYDATA_KV', ours: false, n: 8 }]);
    expect(u.kvDeletes[0]?.n).toBe(2);
    expect(u.kvLists[0]?.ours).toBe(true);
    expect(u.aeWrites[0]).toEqual({ name: 'sanpo_errors', ours: true, n: 4 });
    expect(u.r2ClassB[0]?.n).toBe(7);
    expect(u.r2ClassA).toEqual([]);
    expect(JSON.stringify(u)).not.toMatch(/[0-9a-f]{32}/);
  });
  it('averages daily storage peaks and accepts dashed KV ids', () => {
    const cycle = emptyUsage();
    const today = emptyUsage();
    const dashed = `${ID_OTHER.slice(0, 8)}-${ID_OTHER.slice(8, 12)}-${ID_OTHER.slice(12, 16)}-${ID_OTHER.slice(16, 20)}-${ID_OTHER.slice(20)}`;
    const st = (date: string, storageClass: string, payloadSize: number) => ({
      max: { payloadSize, metadataSize: 0 },
      dimensions: { bucketName: 'sanpo-world-dev', date, storageClass },
    });
    tallyStorage(
      {
        ks: [{ max: { byteCount: 300 }, dimensions: { namespaceId: dashed, date: '2026-10-26' } }],
        st: [
          st('2026-10-25', 'Standard', 100),
          st('2026-10-26', 'Standard', 300),
          st('2026-10-26', 'InfrequentAccess', 999),
        ],
      },
      cycle,
      today,
      (id) => (id === ID_OTHER ? 'CITYDATA_KV' : `?${id}`),
    );
    expect(cycle.r2StorageBytes).toEqual([{ name: 'sanpo-world-dev', ours: true, n: 200 }]);
    expect(today.r2StorageBytes[0]?.n).toBe(300);
    expect(cycle.kvStorageBytes).toEqual([{ name: 'CITYDATA_KV', ours: false, n: 150 }]);
  });
  it('classifies R2 operations', () => {
    expect(r2Class('PutObject')).toBe('A');
    expect(r2Class('CompleteMultipartUpload')).toBe('A');
    expect(r2Class('GetObject')).toBe('B');
    expect(r2Class('HeadObject')).toBe('B');
    expect(r2Class('DeleteObject')).toBe('free');
  });
});
