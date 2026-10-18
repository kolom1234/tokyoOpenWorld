// Cloudflare 무료 한도 대비 사용량 판정(M11-T06 일일 점검 — 순수 함수, 테스트). 한도 = Workers Free·R2 무료·KV 무료·Analytics Engine(2026-10 문서).
// 무료 한도는 계정 단위다 — "ours"(tokyo-sanpo 자원)와 "account"(계정 전체: 다른 프로젝트 포함)를 따로 판정한다.
export const FREE_LIMITS = {
  workersRequestsDay: 100_000,
  kvReadsDay: 100_000,
  kvWritesDay: 1_000,
  r2ClassAMonth: 1_000_000,
  r2ClassBMonth: 10_000_000,
  r2StorageBytes: 10 * 1024 ** 3,
  aeWritesDay: 100_000,
} as const;
export type Metric = keyof typeof FREE_LIMITS;

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

export type Usage = Record<Metric, number>;

export interface Row {
  metric: Metric;
  scope: 'ours' | 'account';
  used: number;
  limit: number;
  ratio: number;
}

export function evaluate(ours: Usage, account: Usage, threshold = 0.7): { rows: Row[]; over: Row[] } {
  const rows: Row[] = [];
  for (const metric of Object.keys(FREE_LIMITS) as Metric[]) {
    const limit = FREE_LIMITS[metric];
    rows.push({ metric, scope: 'ours', used: ours[metric], limit, ratio: ours[metric] / limit });
    rows.push({ metric, scope: 'account', used: account[metric], limit, ratio: account[metric] / limit });
  }
  return { rows, over: rows.filter((r) => r.ratio >= threshold) };
}

export function markdown(rows: readonly Row[], at: string): string {
  const pct = (r: number) => `${(r * 100).toFixed(1)} %`;
  const lines = rows.map(
    (r) =>
      `| ${r.metric} | ${r.scope} | ${r.used.toLocaleString('en')} | ${r.limit.toLocaleString('en')} | ${r.ratio >= 0.7 ? '⚠️ ' : ''}${pct(r.ratio)} |`,
  );
  return [
    `Cloudflare usage vs free limits — ${at} (day = UTC today, month = UTC month to date)`,
    '',
    '| metric | scope | used | free limit | % |',
    '|---|---|---|---|---|',
    ...lines,
  ].join('\n');
}
