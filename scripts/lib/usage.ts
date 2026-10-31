// Cloudflare 요금제 포함량 대비 사용량 판정(M11-T06 점검 — 순수 함수, 테스트). 요금제 = CF_PLAN(기본 paid — 2026-10-31 사용자 확인:
// Workers Paid + R2 Paid, 계정 단위, 청구 주기 매월 25일 시작). paid = 청구 주기 누적 ÷ 포함량, 70 % 초과만 이슈. 오늘(UTC) 값은 급증 참고용.
// 포함량·단가 = Cloudflare 문서 workers/platform/pricing·durable-objects·queues·r2·analytics-engine·workers-logs pricing(2026-10-31 확인, docs/13 §6).
// "ours"(tokyo-sanpo 자원)와 "account"(계정 전체: 다른 프로젝트 포함 — 포함량·초과 요금은 계정 단위)를 따로 판정한다.
export const METRICS = [
  'workersRequests',
  'workersCpuMs',
  'logEvents',
  'kvReads',
  'kvWrites',
  'kvDeletes',
  'kvLists',
  'kvStorageBytes',
  'doRequests',
  'doDurationGbS',
  'queueOps',
  'aeWrites',
  'r2ClassA',
  'r2ClassB',
  'r2StorageBytes',
] as const;
export type Metric = (typeof METRICS)[number];
export type Plan = 'paid' | 'free';

/** 저장량 지표(주기 값 = 누적 GB-월 = 일별 최대의 합 ÷ 30, 오늘 값 = 최근 일별 최대). 나머지는 누적 카운터. */
export const STORAGE: ReadonlySet<Metric> = new Set(['kvStorageBytes', 'r2StorageBytes']);

export interface Allowance {
  included: number;
  /** cycle = 청구 주기 누적, day = UTC 하루(무료 플랜 한도). */
  per: 'cycle' | 'day';
  /** 초과 단가 USD / unit. 없으면 초과 요금 없음(무료 플랜은 차단, Analytics Engine은 아직 미과금). */
  usd?: number;
  unit?: number;
}

const M = 1e6;
/** GB = 10^9 B — 대시보드 Billable usage의 R2 저장 GB-월과 대조해 확인(2026-10-31). */
const GB = 1e9;
/** GB-월 = 일별 최대 저장량의 합 ÷ 30(R2 문서: "averaging the peak storage per day over a billing period (30 days)"). */
export const GB_MONTH_DAYS = 30;
export const PLANS: Record<Plan, Partial<Record<Metric, Allowance>>> = {
  paid: {
    workersRequests: { included: 10 * M, per: 'cycle', usd: 0.3, unit: M },
    workersCpuMs: { included: 30 * M, per: 'cycle', usd: 0.02, unit: M },
    kvReads: { included: 10 * M, per: 'cycle', usd: 0.5, unit: M },
    kvWrites: { included: M, per: 'cycle', usd: 5, unit: M },
    kvDeletes: { included: M, per: 'cycle', usd: 5, unit: M },
    kvLists: { included: M, per: 'cycle', usd: 5, unit: M },
    kvStorageBytes: { included: GB, per: 'cycle', usd: 0.5, unit: GB },
    doRequests: { included: M, per: 'cycle', usd: 0.15, unit: M },
    doDurationGbS: { included: 400_000, per: 'cycle', usd: 12.5, unit: M },
    queueOps: { included: M, per: 'cycle', usd: 0.4, unit: M },
    aeWrites: { included: 10 * M, per: 'cycle' },
    logEvents: { included: 20 * M, per: 'cycle', usd: 0.6, unit: M },
    r2ClassA: { included: M, per: 'cycle', usd: 4.5, unit: M },
    r2ClassB: { included: 10 * M, per: 'cycle', usd: 0.36, unit: M },
    r2StorageBytes: { included: 10 * GB, per: 'cycle', usd: 0.015, unit: GB },
  },
  free: {
    workersRequests: { included: 100_000, per: 'day' },
    kvReads: { included: 100_000, per: 'day' },
    kvWrites: { included: 1_000, per: 'day' },
    kvDeletes: { included: 1_000, per: 'day' },
    kvLists: { included: 1_000, per: 'day' },
    kvStorageBytes: { included: GB, per: 'cycle' },
    doRequests: { included: 100_000, per: 'day' },
    doDurationGbS: { included: 13_000, per: 'day' },
    queueOps: { included: 10_000, per: 'day' },
    aeWrites: { included: 100_000, per: 'day' },
    logEvents: { included: 200_000, per: 'day' },
    r2ClassA: { included: M, per: 'cycle', usd: 4.5, unit: M },
    r2ClassB: { included: 10 * M, per: 'cycle', usd: 0.36, unit: M },
    r2StorageBytes: { included: 10 * GB, per: 'cycle', usd: 0.015, unit: GB },
  },
};

export const LABELS: Record<Metric, string> = {
  workersRequests: 'Workers requests',
  workersCpuMs: 'Workers CPU ms',
  logEvents: 'Workers Logs events ²',
  kvReads: 'KV reads',
  kvWrites: 'KV writes',
  kvDeletes: 'KV deletes',
  kvLists: 'KV lists',
  kvStorageBytes: 'KV storage (GB-month) ³',
  doRequests: 'Durable Objects requests',
  doDurationGbS: 'Durable Objects duration (GB-s)',
  queueOps: 'Queues operations',
  aeWrites: 'Analytics Engine writes ¹',
  r2ClassA: 'R2 Class A',
  r2ClassB: 'R2 Class B',
  r2StorageBytes: 'R2 Standard storage (GB-month) ³',
};

/** 이슈를 여는 경계: 포함량의 70 % 초과. */
export const THRESHOLD = 0.7;

/** R2 작업 종류 → 과금 등급(무료 = 삭제·중단). https://developers.cloudflare.com/r2/pricing/ */
const CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);
const FREE_OPS = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

export function r2Class(action: string): 'A' | 'B' | 'free' {
  if (FREE_OPS.has(action)) return 'free';
  return CLASS_B.has(action) ? 'B' : 'A';
}

/** 이름(Worker·KV 네임스페이스 제목·DO 클래스·큐·버킷·데이터셋)별 사용량. ID는 넣지 않는다. */
export interface Entry {
  name: string;
  ours: boolean;
  n: number;
}
export type Usage = Record<Metric, Entry[]>;

export const emptyUsage = (): Usage => Object.fromEntries(METRICS.map((m) => [m, []])) as unknown as Usage;

export function add(u: Usage, metric: Metric, name: string, ours: boolean, n: number): void {
  const e = u[metric].find((x) => x.name === name);
  if (e) e.n += n;
  else u[metric].push({ name, ours, n });
}

export interface Cycle {
  start: Date;
  end: Date;
  /** 경과 비율 0–1. */
  elapsed: number;
  /** 오늘(UTC) 다음 날부터 주기 끝까지 남은 날 수(저장량 예상용). */
  daysLeft: number;
}

/** 청구 주기 = 매월 `day`일 00:00 UTC 시작(1–28). */
export function billingCycle(now: Date, day: number): Cycle {
  if (!Number.isInteger(day) || day < 1 || day > 28) throw new Error(`billing day must be 1–28, got ${day}`);
  const back = now.getUTCDate() >= day ? 0 : 1;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back + 1, day));
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  const elapsed = (now.getTime() - start.getTime()) / (end.getTime() - start.getTime());
  return { start, end, elapsed, daysLeft: Math.max(0, (end.getTime() - tomorrow) / 86_400_000) };
}

export interface Row {
  metric: Metric;
  scope: 'ours' | 'account';
  /** cycle 한도 = 주기 누적, day 한도 = 오늘(UTC). */
  used: number;
  included: number;
  per: Allowance['per'];
  ratio: number;
  /** 주기 말 예상 ÷ 포함량(day 한도면 NaN). */
  projectedRatio: number;
  /** 주기 말 예상 초과 요금 USD(account만 — 청구는 계정 단위). */
  extraUsd: number;
  /** account만: 사용량 상위 이름·비중. */
  top: string;
}

const total = (es: readonly Entry[], oursOnly: boolean): number =>
  es.reduce((s, e) => s + (oursOnly && !e.ours ? 0 : e.n), 0);

/** 주기 말 예상: 카운터 = 누적 ÷ 경과 비율, 저장량 = 누적 GB-월 + 최근 값이 남은 날 동안 유지된다고 본 GB-월. */
function project(metric: Metric, used: number, latest: number, cycle: Cycle): number {
  if (STORAGE.has(metric)) return used + (latest * cycle.daysLeft) / GB_MONTH_DAYS;
  return used / Math.min(1, Math.max(cycle.elapsed, 1e-3));
}

const share = (r: number): string => (r > 0 && r < 0.01 ? '<1 %' : `${Math.round(r * 100)} %`);

function top(es: readonly Entry[], k = 3): string {
  const sum = total(es, false);
  if (sum <= 0) return '';
  return [...es]
    .filter((e) => e.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((e) => `${e.name} ${share(e.n / sum)}`)
    .join(' · ');
}

export function evaluate(cycleUse: Usage, today: Usage, plan: Plan, cycle: Cycle): Row[] {
  const rows: Row[] = [];
  for (const metric of METRICS) {
    const a = PLANS[plan][metric];
    if (!a) continue;
    for (const scope of ['ours', 'account'] as const) {
      const src = a.per === 'day' ? today[metric] : cycleUse[metric];
      const used = total(src, scope === 'ours');
      const latest = total(today[metric], scope === 'ours');
      const projected = a.per === 'day' ? Number.NaN : project(metric, used, latest, cycle);
      const billable = scope === 'account' && a.usd !== undefined && a.unit !== undefined && a.per === 'cycle';
      const extraUsd = billable ? (Math.max(0, projected - a.included) / (a.unit ?? 1)) * (a.usd ?? 0) : 0;
      const top3 = scope === 'account' ? top(src) : '';
      const base = { metric, scope, used, included: a.included, per: a.per, extraUsd, top: top3 };
      rows.push({ ...base, ratio: used / a.included, projectedRatio: projected / a.included });
    }
  }
  return rows;
}

export const overThreshold = (rows: readonly Row[]): Row[] => rows.filter((r) => r.ratio > THRESHOLD);

export interface Spike {
  metric: Metric;
  oursToday: number;
  accountToday: number;
  /** 오늘 이전 주기 날들의 account 하루 평균(이전 날이 없으면 NaN). */
  accountAvg: number;
  spike: boolean;
}

/** 급증 참고표(이슈 판정에 쓰지 않음): 카운터 지표의 오늘(UTC) 값 vs 주기 안 이전 날 평균. ⚡ = 평균의 3배 이상이고 포함량의 1 % 이상. */
export function spikes(cycleUse: Usage, today: Usage, plan: Plan, cycle: Cycle, now: Date): Spike[] {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const priorDays = Math.round((midnight - cycle.start.getTime()) / 86_400_000);
  const out: Spike[] = [];
  for (const metric of METRICS) {
    const a = PLANS[plan][metric];
    if (!a || STORAGE.has(metric)) continue;
    const accountToday = total(today[metric], false);
    const accountAvg = priorDays >= 1 ? (total(cycleUse[metric], false) - accountToday) / priorDays : Number.NaN;
    const spike = accountAvg >= 0 && accountToday >= 3 * accountAvg && accountToday >= 0.01 * a.included;
    out.push({ metric, oursToday: total(today[metric], true), accountToday, accountAvg, spike });
  }
  return out;
}

const day = (d: Date): string => d.toISOString().slice(0, 10);
const pct = (r: number): string => (Number.isFinite(r) ? `${(r * 100).toFixed(1)} %` : '—');

export function fmt(metric: Metric, n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (STORAGE.has(metric)) return n >= GB / 10 ? `${(n / GB).toFixed(2)} GB` : `${(n / 1e6).toFixed(2)} MB`;
  return n.toLocaleString('en', { maximumFractionDigits: Math.abs(n) < 100 ? 2 : 0 });
}

const usd = (n: number): string => (n > 0 ? `$${n.toFixed(2)}` : '—');

export const NOTES = [
  '¹ Analytics Engine is not billed yet (Cloudflare docs) — after billing starts: 10M included, then $0.25/M.',
  '² Workers Observability logs = console lines + invocation logs (trace spans excluded — not billed before 2026-12-01). From 2026-12-01 logs move to Observability pricing (Paid: 50 GB ingestion + 10 GB-month storage per billing cycle), which no API here measures in GB.',
  '³ Accrued GB-month = sum of daily peak storage ÷ 30 (R2 docs); R2 free tier covers Standard storage only. GB = 10^9 B.',
  '"account" = every project on this Cloudflare account (allowances and overage are account-wide); "ours" = tokyo-sanpo Workers · KV · sanpo-world-* buckets · sanpo_errors* datasets. The dashboard (Billable usage) lags until the end of the previous UTC day.',
];

export function markdown(rows: readonly Row[], sp: readonly Spike[], plan: Plan, cycle: Cycle, at: Date): string {
  const head = `### Cloudflare usage — plan \`${plan}\`, billing cycle ${day(cycle.start)} → ${day(cycle.end)} UTC (${pct(cycle.elapsed)} elapsed)`;
  const lines = rows.map((r) => {
    const inc = `${fmt(r.metric, r.included)}${r.per === 'day' ? '/day' : ''}`;
    const mark = r.ratio > THRESHOLD ? '⚠️ ' : '';
    const cells = [LABELS[r.metric], r.scope, fmt(r.metric, r.used), inc, `${mark}${pct(r.ratio)}`];
    return `| ${[...cells, pct(r.projectedRatio), r.scope === 'account' ? usd(r.extraUsd) : '', r.top].join(' | ')} |`;
  });
  const spikeLines = sp.map((s) => {
    const avg = Number.isFinite(s.accountAvg) ? fmt(s.metric, s.accountAvg) : '—';
    const cells = [
      LABELS[s.metric],
      fmt(s.metric, s.oursToday),
      fmt(s.metric, s.accountToday),
      avg,
      s.spike ? '⚡' : '',
    ];
    return `| ${cells.join(' | ')} |`;
  });
  return [
    head,
    `checked ${at.toISOString()} · issue only when cycle-to-date usage > ${THRESHOLD * 100} % of the included amount`,
    '',
    '| metric | scope | used | included | % | cycle-end est. | est. extra $ | top (account) |',
    '|---|---|---|---|---|---|---|---|',
    ...lines,
    '',
    'Spike reference only (no issue): today so far (UTC) vs the account average per earlier day of this cycle',
    '',
    '| metric | ours today | account today | account avg/day | |',
    '|---|---|---|---|---|',
    ...spikeLines,
    '',
    ...NOTES,
  ].join('\n');
}
