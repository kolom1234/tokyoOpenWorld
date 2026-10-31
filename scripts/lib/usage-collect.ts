// Cloudflare GraphQL Analytics → 요금제 판정 입력(M11-T06): 청구 주기 누적·오늘(UTC) 카운터(Workers·KV·DO·Queues·AE·R2)
// + 일별 최대 저장량(KV·R2 Standard) + Workers Logs(usage-logs.ts). 모든 창은 [시작, at) — `--at`으로 대시보드 시점과 대조할 수 있다.
// 이름(Worker·KV 제목·DO 클래스·큐·버킷·데이터셋)만 남기고 ID는 버린다. 이름 = REST(권한 없으면 번호로 표기 + 안내).
import { graphql, rest } from './cf-api.ts';
import { add, type Cycle, emptyUsage, GB_MONTH_DAYS, type Metric, r2Class, type Usage } from './usage.ts';
import { logCounts } from './usage-logs.ts';

const OUR_SCRIPT = /^tokyo-sanpo/;
const OUR_BUCKET = /^sanpo-world-/;
const OUR_DATASET = /^sanpo_errors/;
const OUR_QUEUE = /^sanpo/;
/** apps/worker/wrangler.jsonc KV id(production·staging) — 판정에만 쓰고 출력하지 않는다. */
const OUR_KV = new Set(['938aa34bc73f4cce935ab383fbc0a098', '52e1d2e4354047cda47550e03f0750b4']);
/** 자원 ID 정규화 — kvStorageAdaptiveGroups 등은 하이픈 UUID, 다른 데이터셋·REST는 32자리 hex. */
const normId = (id: string): string => id.replace(/-/g, '').toLowerCase();
/** KV 작업 → 지표(모르는 종류는 가장 비싼 쓰기로 센다). */
const KV_ACTION: Record<string, Metric> = { read: 'kvReads', write: 'kvWrites', delete: 'kvDeletes', list: 'kvLists' };

export interface Counters {
  w?: { sum: { requests: number; cpuTimeUs: number }; dimensions: { scriptName: string } }[];
  kv?: { sum: { requests: number }; dimensions: { actionType: string; namespaceId: string } }[];
  doi?: { sum: { requests: number }; dimensions: { scriptName: string; namespaceId: string } }[];
  dop?: { sum: { duration: number }; dimensions: { namespaceId: string } }[];
  q?: { sum: { billableOperations: number }; dimensions: { queueId: string } }[];
  ae?: { count: number; dimensions: { dataset: string } }[];
  ops?: { sum: { requests: number }; dimensions: { actionType: string; bucketName: string } }[];
}

export interface Storage {
  ks?: { max: { byteCount: number }; dimensions: { namespaceId: string; date: string } }[];
  st?: {
    max: { payloadSize: number; metadataSize: number };
    dimensions: { bucketName: string; date: string; storageClass: string };
  }[];
}

/** 자원 ID → 표시 이름(ID 자체는 돌려주지 않는다). */
export interface Names {
  kv: (id: string) => string;
  durable: (id: string) => string;
  /** DO 네임스페이스 → Worker 이름(ours 판정). */
  doScript: ReadonlyMap<string, string>;
  queue: (id: string) => string;
}

const range = (t: string) => `filter: {datetime_geq: ${t}, datetime_lt: $t1}`;
const counterFields = (p: string, t: string): string => `
  ${p}w: workersInvocationsAdaptive(limit: 1000, ${range(t)}) { sum { requests cpuTimeUs } dimensions { scriptName } }
  ${p}kv: kvOperationsAdaptiveGroups(limit: 1000, ${range(t)}) { sum { requests } dimensions { actionType namespaceId } }
  ${p}doi: durableObjectsInvocationsAdaptiveGroups(limit: 1000, ${range(t)}) { sum { requests } dimensions { scriptName namespaceId } }
  ${p}dop: durableObjectsPeriodicGroups(limit: 1000, ${range(t)}) { sum { duration } dimensions { namespaceId } }
  ${p}q: queueMessageOperationsAdaptiveGroups(limit: 1000, ${range(t)}) { sum { billableOperations } dimensions { queueId } }
  ${p}ae: workersAnalyticsEngineAdaptiveGroups(limit: 1000, ${range(t)}) { count dimensions { dataset } }
  ${p}ops: r2OperationsAdaptiveGroups(limit: 1000, ${range(t)}) { sum { requests } dimensions { actionType bucketName } }`;

const QUERY = `query($acc: string!, $ct0: Time!, $dt0: Time!, $t1: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
  ${counterFields('c_', '$ct0')}
  ${counterFields('d_', '$dt0')}
  ks: kvStorageAdaptiveGroups(limit: 1000, ${range('$ct0')}) { max { byteCount } dimensions { namespaceId date } }
  st: r2StorageAdaptiveGroups(limit: 1000, ${range('$ct0')}) { max { payloadSize metadataSize } dimensions { bucketName date storageClass } }
} } }`;

export function tallyCounters(g: Counters, u: Usage, names: Names): void {
  for (const w of g.w ?? []) {
    const name = w.dimensions.scriptName;
    const ours = OUR_SCRIPT.test(name);
    add(u, 'workersRequests', name, ours, w.sum.requests);
    add(u, 'workersCpuMs', name, ours, w.sum.cpuTimeUs / 1000);
  }
  for (const k of g.kv ?? []) {
    const id = normId(k.dimensions.namespaceId);
    add(u, KV_ACTION[k.dimensions.actionType] ?? 'kvWrites', names.kv(id), OUR_KV.has(id), k.sum.requests);
  }
  const doScript = new Map(names.doScript);
  for (const d of g.doi ?? []) {
    const id = normId(d.dimensions.namespaceId);
    doScript.set(id, d.dimensions.scriptName);
    add(u, 'doRequests', names.durable(id), OUR_SCRIPT.test(d.dimensions.scriptName), d.sum.requests);
  }
  for (const d of g.dop ?? []) {
    const id = normId(d.dimensions.namespaceId);
    add(u, 'doDurationGbS', names.durable(id), OUR_SCRIPT.test(doScript.get(id) ?? ''), d.sum.duration);
  }
  for (const q of g.q ?? []) {
    const name = names.queue(normId(q.dimensions.queueId));
    add(u, 'queueOps', name, OUR_QUEUE.test(name), q.sum.billableOperations);
  }
  for (const a of g.ae ?? []) add(u, 'aeWrites', a.dimensions.dataset, OUR_DATASET.test(a.dimensions.dataset), a.count);
  for (const o of g.ops ?? []) {
    const c = r2Class(o.dimensions.actionType);
    if (c === 'free') continue;
    const b = o.dimensions.bucketName;
    add(u, c === 'A' ? 'r2ClassA' : 'r2ClassB', b, OUR_BUCKET.test(b), o.sum.requests);
  }
}

interface Point {
  metric: Metric;
  name: string;
  ours: boolean;
  date: string;
  bytes: number;
}

/** 저장량: 주기 값 = 누적 GB-월(일별 최대의 합 ÷ 30), 오늘 값 = 가장 최근 날의 최대. */
export function tallyStorage(s: Storage, cycleUse: Usage, today: Usage, names: Names): void {
  const points: Point[] = [];
  for (const k of s.ks ?? []) {
    const id = normId(k.dimensions.namespaceId);
    const p = { name: names.kv(id), ours: OUR_KV.has(id), date: k.dimensions.date, bytes: k.max.byteCount };
    points.push({ metric: 'kvStorageBytes', ...p });
  }
  for (const r of s.st ?? []) {
    if (r.dimensions.storageClass !== 'Standard') continue;
    const b = r.dimensions.bucketName;
    const bytes = r.max.payloadSize + r.max.metadataSize;
    points.push({ metric: 'r2StorageBytes', name: b, ours: OUR_BUCKET.test(b), date: r.dimensions.date, bytes });
  }
  const latest = new Map<string, string>();
  for (const p of points) {
    add(cycleUse, p.metric, p.name, p.ours, p.bytes / GB_MONTH_DAYS);
    const key = `${p.metric}/${p.name}`;
    if ((latest.get(key) ?? '') < p.date) latest.set(key, p.date);
  }
  for (const p of points)
    if (latest.get(`${p.metric}/${p.name}`) === p.date) add(today, p.metric, p.name, p.ours, p.bytes);
}

/** 이름 맵 → 조회 함수(없는 ID는 `<prefix> #n` — ID는 쓰지 않는다). */
export function labeler(map: ReadonlyMap<string, string>, prefix: string): (id: string) => string {
  const numbered = new Map<string, string>();
  return (id) => {
    const t = map.get(id) ?? numbered.get(id);
    if (t) return t;
    const label = `${prefix} #${numbered.size + 1}`;
    numbered.set(id, label);
    return label;
  };
}

/** REST 목록(페이지) → 정규화 ID별 항목. 실패(권한 없음)하면 undefined. */
async function list<T>(acc: string, path: string): Promise<T[] | undefined> {
  const out: T[] = [];
  try {
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const r = await rest<T[]>(`/accounts/${acc}${path}?per_page=100&page=${page}`);
      out.push(...r.result);
      pages = r.result_info?.total_pages ?? 1;
    }
    return out;
  } catch {
    return undefined;
  }
}

export async function lookupNames(acc: string, notes: string[]): Promise<Names> {
  const [kv, dos, qs] = await Promise.all([
    list<{ id: string; title: string }>(acc, '/storage/kv/namespaces'),
    list<{ id: string; name: string; script?: string; class?: string }>(acc, '/workers/durable_objects/namespaces'),
    list<{ queue_id: string; queue_name: string }>(acc, '/queues'),
  ]);
  const missing = [kv ? '' : 'KV (Workers KV Storage: Read)', dos ? '' : 'DO (Workers Scripts: Read)'];
  missing.push(qs ? '' : 'Queues (Queues: Read)');
  if (missing.some(Boolean)) notes.push(`Names unavailable, numbered instead: ${missing.filter(Boolean).join(', ')}.`);
  const kvMap = new Map((kv ?? []).map((n) => [normId(n.id), n.title]));
  for (const id of OUR_KV) if (!kvMap.has(id)) kvMap.set(id, 'tokyo-sanpo KV');
  const doName = (n: { name: string; script?: string; class?: string }) =>
    n.script && n.class ? `${n.script}/${n.class}` : n.name;
  return {
    kv: labeler(kvMap, 'KV namespace'),
    durable: labeler(new Map((dos ?? []).map((n) => [normId(n.id), doName(n)])), 'DO namespace'),
    doScript: new Map((dos ?? []).flatMap((n) => (n.script ? [[normId(n.id), n.script] as const] : []))),
    queue: labeler(new Map((qs ?? []).map((q) => [normId(q.queue_id), q.queue_name])), 'queue'),
  };
}

export interface Collected {
  cycle: Usage;
  today: Usage;
  notes: string[];
}

const pick = (raw: Record<string, unknown>, p: string): Counters =>
  Object.fromEntries(['w', 'kv', 'doi', 'dop', 'q', 'ae', 'ops'].map((k) => [k, raw[`${p}${k}`]])) as Counters;

/** Workers Logs: 텔레메트리(정확·외삽) → 실패하면 호출 수(호출 1건 = 로그 1건)로 추정. */
async function addLogs(acc: string, out: Collected, cycle: Cycle, midnight: Date, at: Date): Promise<void> {
  const inv = new Map(out.cycle.workersRequests.map((e) => [e.name, e.n]));
  const logs = await logCounts(acc, cycle.start, midnight, at, inv);
  if (!logs) {
    for (const k of ['cycle', 'today'] as const)
      for (const e of out[k].workersRequests) add(out[k], 'logEvents', e.name, e.ours, e.n);
    out.notes.push(
      'Workers Logs telemetry query failed (token needs Workers Observability) — estimated as 1 log per invocation.',
    );
    return;
  }
  for (const [name, n] of logs.cycle) add(out.cycle, 'logEvents', name, OUR_SCRIPT.test(name), n);
  for (const [name, n] of logs.today) add(out.today, 'logEvents', name, OUR_SCRIPT.test(name), n);
  out.notes.push(logs.note);
}

export async function collect(acc: string, at: Date, cycle: Cycle): Promise<Collected> {
  const midnight = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const q = await graphql<{ viewer: { accounts: Record<string, unknown>[] } }>(QUERY, {
    acc,
    ct0: cycle.start.toISOString(),
    dt0: midnight.toISOString(),
    t1: at.toISOString(),
  });
  const raw = q.viewer.accounts[0] ?? {};
  const out: Collected = { cycle: emptyUsage(), today: emptyUsage(), notes: [] };
  const names = await lookupNames(acc, out.notes);
  tallyCounters(pick(raw, 'c_'), out.cycle, names);
  tallyCounters(pick(raw, 'd_'), out.today, names);
  tallyStorage(raw as Storage, out.cycle, out.today, names);
  await addLogs(acc, out, cycle, midnight, at);
  return out;
}
