// M11-T06 사용량 집계: GraphQL 행 → 이름별 사용량(KV 작업 분리·DO·Queues·ID 비노출), 누적 GB-월, Workers Logs 텔레메트리 집계·외삽.
import { describe, expect, it } from 'vitest';
import { emptyUsage } from '../lib/usage.ts';
import { labeler, type Names, tallyCounters, tallyStorage } from '../lib/usage-collect.ts';
import { extrapolate, parseAggregates } from '../lib/usage-logs.ts';

const ID_OTHER = '425a66aa000000000000000000000001';
const ID_OURS = '938aa34bc73f4cce935ab383fbc0a098';
const DO_ID = 'be70aaaa000000000000000000000002';
const Q_ID = 'e24eaaaa000000000000000000000003';
const dashed = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;

const names = (): Names => ({
  kv: labeler(new Map([[ID_OTHER, 'CITYDATA_KV']]), 'KV namespace'),
  durable: labeler(new Map([[DO_ID, 'open-finance-pulse-worker/SecLimiterDO']]), 'DO namespace'),
  doScript: new Map(),
  queue: labeler(new Map([[Q_ID, 'ofp-ingest']]), 'queue'),
});

describe('graphql tally', () => {
  it('splits KV actions, adds DO and Queues, keeps names only and marks ours', () => {
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
        doi: [
          { sum: { requests: 5_022 }, dimensions: { scriptName: 'open-finance-pulse-worker', namespaceId: DO_ID } },
        ],
        dop: [
          { sum: { duration: 14.21 }, dimensions: { namespaceId: dashed(DO_ID) } },
          { sum: { duration: 0.35 }, dimensions: { namespaceId: 'efa3aaaa000000000000000000000004' } },
        ],
        q: [
          { sum: { billableOperations: 70_000 }, dimensions: { queueId: Q_ID } },
          { sum: { billableOperations: 6_492 }, dimensions: { queueId: '539caaaa000000000000000000000005' } },
        ],
        ae: [{ count: 4, dimensions: { dataset: 'sanpo_errors' } }],
        ops: [
          { sum: { requests: 7 }, dimensions: { actionType: 'GetObject', bucketName: 'sanpo-world-prod' } },
          { sum: { requests: 9 }, dimensions: { actionType: 'DeleteObject', bucketName: 'sanpo-world-prod' } },
        ],
      },
      u,
      names(),
    );
    expect(u.workersCpuMs).toEqual([{ name: 'tokyo-sanpo', ours: true, n: 2.5 }]);
    expect(u.logEvents).toEqual([]); // 로그는 텔레메트리(usage-logs.ts)
    expect(u.kvWrites).toEqual([{ name: 'CITYDATA_KV', ours: false, n: 8 }]);
    expect(u.kvDeletes[0]?.n).toBe(2);
    expect(u.kvLists[0]).toEqual({ name: 'KV namespace #1', ours: true, n: 1 }); // 이름 맵에 없으면 번호(ours는 ID로 판정)
    expect(u.doRequests).toEqual([{ name: 'open-finance-pulse-worker/SecLimiterDO', ours: false, n: 5_022 }]);
    expect(u.doDurationGbS.map((e) => [e.name, e.n])).toEqual([
      ['open-finance-pulse-worker/SecLimiterDO', 14.21],
      ['DO namespace #1', 0.35],
    ]);
    expect(u.queueOps.map((e) => [e.name, e.n])).toEqual([
      ['ofp-ingest', 70_000],
      ['queue #1', 6_492],
    ]);
    expect(u.aeWrites[0]).toEqual({ name: 'sanpo_errors', ours: true, n: 4 });
    expect(u.r2ClassB[0]?.n).toBe(7);
    expect(u.r2ClassA).toEqual([]);
    expect(JSON.stringify(u)).not.toMatch(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}/);
  });
  it('accrues GB-month as daily peaks ÷ 30 and accepts dashed KV ids', () => {
    const cycle = emptyUsage();
    const today = emptyUsage();
    const st = (date: string, storageClass: string, payloadSize: number) => ({
      max: { payloadSize, metadataSize: 0 },
      dimensions: { bucketName: 'sanpo-world-dev', date, storageClass },
    });
    tallyStorage(
      {
        ks: [{ max: { byteCount: 300 }, dimensions: { namespaceId: dashed(ID_OTHER), date: '2026-10-26' } }],
        st: [
          st('2026-10-25', 'Standard', 1_500),
          st('2026-10-26', 'Standard', 3_000),
          st('2026-10-26', 'InfrequentAccess', 999),
        ],
      },
      cycle,
      today,
      names(),
    );
    expect(cycle.r2StorageBytes).toEqual([{ name: 'sanpo-world-dev', ours: true, n: 150 }]);
    expect(today.r2StorageBytes[0]?.n).toBe(3_000);
    expect(cycle.kvStorageBytes).toEqual([{ name: 'CITYDATA_KV', ours: false, n: 10 }]);
  });
  it('numbers unknown ids stably', () => {
    const name = labeler(new Map(), 'queue');
    expect([name('a'), name('b'), name('a')]).toEqual(['queue #1', 'queue #2', 'queue #1']);
  });
});

describe('workers logs', () => {
  const agg = (script: string, type: string, value: number) => ({
    groups: [
      { key: '$workers.scriptName', value: script },
      { key: '$metadata.type', value: type },
    ],
    value,
  });
  it('counts console lines and invocation logs, not trace spans', () => {
    const m = parseAggregates([
      agg('orange-brook-ac24', 'span', 129_913),
      agg('orange-brook-ac24', 'cf-worker', 89_054),
      agg('orange-brook-ac24', 'cf-worker-event', 5_954),
      agg('tokyo-sanpo', 'cf-worker-event', 120),
    ]);
    expect(m.get('orange-brook-ac24')).toEqual({ logs: 95_008, invocations: 5_954 });
    expect(m.get('tokyo-sanpo')).toEqual({ logs: 120, invocations: 120 });
  });
  it('uses the window as is when it covers the cycle, else logs per invocation × cycle invocations', () => {
    const window = new Map([
      ['a', { logs: 1_600, invocations: 100 }],
      ['b', { logs: 50, invocations: 0 }],
    ]);
    const inv = new Map([
      ['a', 400],
      ['b', 10],
    ]);
    expect([...extrapolate(window, inv, true)]).toEqual([
      ['a', 1_600],
      ['b', 50],
    ]);
    expect([...extrapolate(window, inv, false)]).toEqual([
      ['a', 6_400],
      ['b', 50],
    ]);
  });
});
