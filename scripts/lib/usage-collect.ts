// Cloudflare GraphQL Analytics → 요금제 판정 입력(M11-T06): 청구 주기 누적·오늘(UTC) 카운터 + 일별 최대 저장량(KV·R2 Standard).
// 이름(Worker·KV 네임스페이스 제목·버킷·데이터셋)만 남기고 ID는 버린다. KV 제목 = REST(Workers KV Storage: Read — 없으면 번호로 표기).
import { graphql, rest } from './cf-api.ts';
import { add, type Cycle, emptyUsage, type Metric, r2Class, type Usage } from './usage.ts';

const OUR_SCRIPT = /^tokyo-sanpo/;
const OUR_BUCKET = /^sanpo-world-/;
const OUR_DATASET = /^sanpo_errors/;
/** apps/worker/wrangler.jsonc KV id(production·staging) — 판정에만 쓰고 출력하지 않는다. */
const OUR_KV = new Set(['938aa34bc73f4cce935ab383fbc0a098', '52e1d2e4354047cda47550e03f0750b4']);
/** KV 네임스페이스 ID 정규화 — kvStorageAdaptiveGroups는 하이픈 UUID, 작업 데이터셋·REST는 32자리 hex. */
const kvId = (id: string): string => id.replace(/-/g, '').toLowerCase();
/** KV 작업 → 지표(모르는 종류는 가장 비싼 쓰기로 센다). */
const KV_ACTION: Record<string, Metric> = { read: 'kvReads', write: 'kvWrites', delete: 'kvDeletes', list: 'kvLists' };

export interface Counters {
  w?: { sum: { requests: number; cpuTimeUs: number }; dimensions: { scriptName: string } }[];
  kv?: { sum: { requests: number }; dimensions: { actionType: string; namespaceId: string } }[];
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

/** KV 네임스페이스 ID → 표시 이름(ID 자체는 돌려주지 않는다). */
export type KvName = (id: string) => string;

const counterFields = (p: string, d: string, t: string): string => `
  ${p}w: workersInvocationsAdaptive(limit: 1000, filter: {date_geq: ${d}}) { sum { requests cpuTimeUs } dimensions { scriptName } }
  ${p}kv: kvOperationsAdaptiveGroups(limit: 1000, filter: {date_geq: ${d}}) { sum { requests } dimensions { actionType namespaceId } }
  ${p}ae: workersAnalyticsEngineAdaptiveGroups(limit: 1000, filter: {date_geq: ${d}}) { count dimensions { dataset } }
  ${p}ops: r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: ${t}, datetime_lt: $t1}) { sum { requests } dimensions { actionType bucketName } }`;

const QUERY = `query($acc: string!, $c0: Date!, $ct0: Time!, $d0: Date!, $dt0: Time!, $t1: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
  ${counterFields('c_', '$c0', '$ct0')}
  ${counterFields('d_', '$d0', '$dt0')}
  ks: kvStorageAdaptiveGroups(limit: 1000, filter: {date_geq: $c0}) { max { byteCount } dimensions { namespaceId date } }
  st: r2StorageAdaptiveGroups(limit: 1000, filter: {datetime_geq: $ct0, datetime_lt: $t1}) { max { payloadSize metadataSize } dimensions { bucketName date storageClass } }
} } }`;

export function tallyCounters(g: Counters, u: Usage, kvName: KvName): void {
  for (const w of g.w ?? []) {
    const name = w.dimensions.scriptName;
    const ours = OUR_SCRIPT.test(name);
    add(u, 'workersRequests', name, ours, w.sum.requests);
    add(u, 'workersCpuMs', name, ours, w.sum.cpuTimeUs / 1000);
    add(u, 'logEvents', name, ours, w.sum.requests);
  }
  for (const k of g.kv ?? []) {
    const id = kvId(k.dimensions.namespaceId);
    add(u, KV_ACTION[k.dimensions.actionType] ?? 'kvWrites', kvName(id), OUR_KV.has(id), k.sum.requests);
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

/** 저장량: 주기 값 = 일별 최대의 합 ÷ 측정된 날 수(GB-월 추정), 오늘 값 = 가장 최근 날의 최대. */
export function tallyStorage(s: Storage, cycleUse: Usage, today: Usage, kvName: KvName): void {
  const points: Point[] = [];
  for (const k of s.ks ?? []) {
    const id = kvId(k.dimensions.namespaceId);
    const name = kvName(id);
    points.push({
      metric: 'kvStorageBytes',
      name,
      ours: OUR_KV.has(id),
      date: k.dimensions.date,
      bytes: k.max.byteCount,
    });
  }
  for (const r of s.st ?? []) {
    if (r.dimensions.storageClass !== 'Standard') continue;
    const b = r.dimensions.bucketName;
    const bytes = r.max.payloadSize + r.max.metadataSize;
    points.push({ metric: 'r2StorageBytes', name: b, ours: OUR_BUCKET.test(b), date: r.dimensions.date, bytes });
  }
  const days = new Set(points.map((p) => p.date)).size;
  const latest = new Map<string, string>();
  for (const p of points) {
    add(cycleUse, p.metric, p.name, p.ours, p.bytes / days);
    const key = `${p.metric}/${p.name}`;
    if ((latest.get(key) ?? '') < p.date) latest.set(key, p.date);
  }
  for (const p of points)
    if (latest.get(`${p.metric}/${p.name}`) === p.date) add(today, p.metric, p.name, p.ours, p.bytes);
}

/** KV 제목 조회. 실패(권한 없음)하면 우리 것은 'tokyo-sanpo KV', 나머지는 번호로 — ID는 쓰지 않는다. */
export async function kvNames(acc: string): Promise<{ name: KvName; note: string | undefined }> {
  const titles = new Map<string, string>();
  let note: string | undefined;
  try {
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const r = await rest<{ id: string; title: string }[]>(
        `/accounts/${acc}/storage/kv/namespaces?per_page=100&page=${page}`,
      );
      for (const n of r.result) titles.set(kvId(n.id), n.title);
      pages = r.result_info?.total_pages ?? 1;
    }
  } catch {
    note = 'KV namespace names unavailable (the token lacks Workers KV Storage: Read) — other namespaces are numbered.';
  }
  const numbered = new Map<string, string>();
  const name = (id: string): string => {
    const t = titles.get(id) ?? (OUR_KV.has(id) ? 'tokyo-sanpo KV' : numbered.get(id));
    if (t) return t;
    const label = `KV namespace #${numbered.size + 1}`;
    numbered.set(id, label);
    return label;
  };
  return { name, note };
}

export interface Collected {
  cycle: Usage;
  today: Usage;
  notes: string[];
}

const pick = (raw: Record<string, unknown>, p: string): Counters =>
  ({ w: raw[`${p}w`], kv: raw[`${p}kv`], ae: raw[`${p}ae`], ops: raw[`${p}ops`] }) as Counters;

export async function collect(acc: string, now: Date, cycle: Cycle): Promise<Collected> {
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const q = await graphql<{ viewer: { accounts: Record<string, unknown>[] } }>(QUERY, {
    acc,
    c0: cycle.start.toISOString().slice(0, 10),
    ct0: cycle.start.toISOString(),
    d0: midnight.toISOString().slice(0, 10),
    dt0: midnight.toISOString(),
    t1: now.toISOString(),
  });
  const raw = q.viewer.accounts[0] ?? {};
  const kv = await kvNames(acc);
  const out: Collected = { cycle: emptyUsage(), today: emptyUsage(), notes: kv.note ? [kv.note] : [] };
  tallyCounters(pick(raw, 'c_'), out.cycle, kv.name);
  tallyCounters(pick(raw, 'd_'), out.today, kv.name);
  tallyStorage(raw as Storage, out.cycle, out.today, kv.name);
  return out;
}
