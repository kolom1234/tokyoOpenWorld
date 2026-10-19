// `node scripts/cf-usage.ts [--github-issue]`(M11-T06): Cloudflare 무료 한도 대비 사용량(Workers 요청·KV·R2·Analytics Engine).
// `--github-issue`이고 70 % 이상 항목이 있으면 라벨 cf-usage 이슈를 만든다(열린 이슈가 있으면 본문만 갱신 — 알림은 처음 한 번).
// 토큰 권한 = Account | Account Analytics | Read. GitHub Actions `usage.yml`이 매일 실행.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { accountId, aeSql, graphql } from './lib/cf-api.ts';
import { evaluate, markdown, r2Class, type Usage } from './lib/usage.ts';

const OUR_SCRIPT = /^tokyo-sanpo/;
const OUR_BUCKET = /^sanpo-world-/;
/** apps/worker/wrangler.jsonc KV id(production·staging). */
const OUR_KV = new Set(['938aa34bc73f4cce935ab383fbc0a098', '52e1d2e4354047cda47550e03f0750b4']);

const zero = (): Usage => ({
  workersRequestsDay: 0,
  kvReadsDay: 0,
  kvWritesDay: 0,
  r2ClassAMonth: 0,
  r2ClassBMonth: 0,
  r2StorageBytes: 0,
  aeWritesDay: 0,
});

interface AccountGroups {
  w: { sum: { requests: number }; dimensions: { scriptName: string } }[];
  kv: { sum: { requests: number }; dimensions: { actionType: string; namespaceId: string } }[];
  ops: { sum: { requests: number }; dimensions: { actionType: string; bucketName: string } }[];
  st: { max: { payloadSize: number; metadataSize: number }; dimensions: { bucketName: string; datetime: string } }[];
}

const QUERY = `query($acc: string!, $d0: Date!, $m0: Time!, $s0: Time!, $t1: Time!) { viewer { accounts(filter: {accountTag: $acc}) {
  w: workersInvocationsAdaptive(limit: 1000, filter: {date_geq: $d0}) { sum { requests } dimensions { scriptName } }
  kv: kvOperationsAdaptiveGroups(limit: 1000, filter: {date_geq: $d0}) { sum { requests } dimensions { actionType namespaceId } }
  ops: r2OperationsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $m0, datetime_lt: $t1}) { sum { requests } dimensions { actionType bucketName } }
  st: r2StorageAdaptiveGroups(limit: 1000, filter: {datetime_geq: $s0, datetime_lt: $t1}) { max { payloadSize metadataSize } dimensions { bucketName datetime } }
} } }`;

function tally(a: AccountGroups | undefined, ours: Usage, account: Usage): void {
  const add = (mine: boolean, k: keyof Usage, n: number) => {
    account[k] += n;
    if (mine) ours[k] += n;
  };
  for (const w of a?.w ?? []) add(OUR_SCRIPT.test(w.dimensions.scriptName), 'workersRequestsDay', w.sum.requests);
  for (const k of a?.kv ?? []) {
    const metric = k.dimensions.actionType === 'read' ? 'kvReadsDay' : 'kvWritesDay';
    add(OUR_KV.has(k.dimensions.namespaceId), metric, k.sum.requests);
  }
  for (const o of a?.ops ?? []) {
    const c = r2Class(o.dimensions.actionType);
    if (c !== 'free')
      add(OUR_BUCKET.test(o.dimensions.bucketName), c === 'A' ? 'r2ClassAMonth' : 'r2ClassBMonth', o.sum.requests);
  }
  const latest = new Map<string, { at: string; bytes: number }>();
  for (const s of a?.st ?? []) {
    const cur = latest.get(s.dimensions.bucketName);
    if (!cur || s.dimensions.datetime > cur.at)
      latest.set(s.dimensions.bucketName, { at: s.dimensions.datetime, bytes: s.max.payloadSize + s.max.metadataSize });
  }
  for (const [b, v] of latest) add(OUR_BUCKET.test(b), 'r2StorageBytes', v.bytes);
}

async function collect(acc: string, now: Date): Promise<{ ours: Usage; account: Usage }> {
  const d0 = now.toISOString().slice(0, 10);
  const m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const s0 = new Date(now.getTime() - 86_400_000).toISOString();
  const q = await graphql<{ viewer: { accounts: AccountGroups[] } }>(QUERY, {
    acc,
    d0,
    m0,
    s0,
    t1: now.toISOString(),
  });
  const ours = zero();
  const account = zero();
  tally(q.viewer.accounts[0], ours, account);
  for (const ds of ['sanpo_errors', 'sanpo_errors_staging']) {
    try {
      const sql = `SELECT count() AS n FROM ${ds} WHERE timestamp >= toStartOfDay(NOW()) FORMAT JSON`;
      const n = Number((await aeSql<{ n: string }>(acc, sql))[0]?.n ?? 0);
      ours.aeWritesDay += n;
      account.aeWritesDay += n;
    } catch {
      // 데이터셋이 아직 없음(첫 기록 전)
    }
  }
  return { ours, account };
}

function upsertIssue(body: string): void {
  const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
  const open = gh([
    'issue',
    'list',
    '--label',
    'cf-usage',
    '--state',
    'open',
    '--json',
    'number',
    '--jq',
    '.[0].number',
  ]);
  if (open) {
    gh(['issue', 'edit', open, '--body', body]);
    return;
  }
  try {
    gh(['label', 'create', 'cf-usage', '--color', 'D93F0B', '--description', 'Cloudflare free-plan usage >= 70%']);
  } catch {
    // 이미 있음
  }
  gh(['issue', 'create', '--title', 'Cloudflare 무료 한도 70% 근접', '--label', 'cf-usage', '--body', body]);
}

const now = new Date();
const { ours, account } = await collect(await accountId(), now);
const { rows, over } = evaluate(ours, account);
const table = markdown(rows, now.toISOString());
process.stdout.write(`${table}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
if (over.length > 0 && process.argv.includes('--github-issue')) {
  const list = over.map((r) => `- **${r.metric}** (${r.scope}): ${(r.ratio * 100).toFixed(1)} %`).join('\n');
  const note =
    '"account" 행은 같은 Cloudflare 계정의 다른 프로젝트 사용량을 포함한다(무료 한도는 계정 단위). 대응: docs/13-deployment.md §6.';
  upsertIssue(`무료 한도의 70 % 이상인 항목:\n${list}\n\n${table}\n\n${note}`);
}
