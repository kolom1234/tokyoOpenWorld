// M11-T06 사용량 판정: R2 작업 등급, 70 % 경계(ours·account 따로), 표.
import { describe, expect, it } from 'vitest';
import { evaluate, FREE_LIMITS, markdown, r2Class, type Usage } from '../lib/usage.ts';

const zero = (): Usage => ({
  workersRequestsDay: 0,
  kvReadsDay: 0,
  kvWritesDay: 0,
  r2ClassAMonth: 0,
  r2ClassBMonth: 0,
  r2StorageBytes: 0,
  aeWritesDay: 0,
});

describe('cloudflare usage', () => {
  it('classifies R2 operations', () => {
    expect(r2Class('PutObject')).toBe('A');
    expect(r2Class('CompleteMultipartUpload')).toBe('A');
    expect(r2Class('GetObject')).toBe('B');
    expect(r2Class('HeadObject')).toBe('B');
    expect(r2Class('DeleteObject')).toBe('free');
  });
  it('flags metrics at or above 70 % per scope', () => {
    const ours = { ...zero(), workersRequestsDay: 69_999 };
    const account = { ...zero(), workersRequestsDay: 70_000, kvWritesDay: 9_252 };
    const { over, rows } = evaluate(ours, account);
    expect(rows).toHaveLength(Object.keys(FREE_LIMITS).length * 2);
    expect(over.map((r) => `${r.metric}/${r.scope}`)).toEqual(['workersRequestsDay/account', 'kvWritesDay/account']);
    const md = markdown(rows, 'now');
    expect(md).toContain('| kvWritesDay | account | 9,252 | 1,000 | ⚠️ 925.2 % |');
    expect(md).toContain('| workersRequestsDay | ours | 69,999 | 100,000 | 70.0 % |');
  });
});
