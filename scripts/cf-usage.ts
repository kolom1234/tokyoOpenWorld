// `node scripts/cf-usage.ts [--github-issue] [--at <ISO 시각>]`(M11-T06): Cloudflare 요금제 포함량 대비 사용량 — 요금제 CF_PLAN(paid|free, 기본 paid)·청구 시작일 CF_BILLING_DAY(기본 25).
// paid = 청구 주기 누적 ÷ Workers Paid·R2 포함량(계정 단위). `--github-issue`이고 70 % 초과 항목이 있으면 라벨 cf-usage 이슈(열린 이슈가 있으면 본문만 갱신).
// 오늘(UTC) 값은 급증 참고표로만 — 이슈를 열지 않는다. `--at`은 그 시각까지로 계산(대시보드 Billable usage 대조용 — 대시보드는 전날 끝까지 반영), 이슈 없음.
// 토큰 권한 = Account Analytics: Read(+ 이름: Workers KV Storage·Workers Scripts·Queues Read, 로그: Workers Observability). `usage.yml`이 매일 실행.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { accountId } from './lib/cf-api.ts';
import {
  billingCycle,
  evaluate,
  LABELS,
  markdown,
  overThreshold,
  type Plan,
  type Row,
  spikes,
  THRESHOLD,
} from './lib/usage.ts';
import { collect } from './lib/usage-collect.ts';

function plan(): Plan {
  const p = process.env.CF_PLAN || 'paid';
  if (p !== 'paid' && p !== 'free') throw new Error(`CF_PLAN must be paid or free, got ${p}`);
  return p;
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
  gh([
    'label',
    'create',
    'cf-usage',
    '--force',
    '--color',
    'D93F0B',
    '--description',
    'Cloudflare plan allowance > 70%',
  ]);
  gh(['issue', 'create', '--title', 'Cloudflare 포함량 70% 초과', '--label', 'cf-usage', '--body', body]);
}

function issueBody(over: readonly Row[], rows: readonly Row[], report: string): string {
  const list = over.map((r) => {
    const extra = r.extraUsd > 0 ? ` — 주기 말 예상 추가 요금 $${r.extraUsd.toFixed(2)}` : '';
    return `- **${LABELS[r.metric]}** (${r.scope}): 포함량의 ${(r.ratio * 100).toFixed(1)} %${extra}`;
  });
  const extraTotal = rows.reduce((s, r) => s + r.extraUsd, 0);
  const sum = extraTotal > 0 ? `\n\n주기 말 예상 추가 요금 합계(account): **$${extraTotal.toFixed(2)}**` : '';
  const note =
    '"account" 행은 같은 Cloudflare 계정의 다른 프로젝트를 포함한다(포함량·초과 요금은 계정 단위). 대응: docs/13-deployment.md §6.';
  return `청구 주기 누적이 포함량의 ${THRESHOLD * 100} %를 넘은 항목:\n${list.join('\n')}${sum}\n\n${report}\n\n${note}`;
}

const { values } = parseArgs({ options: { 'github-issue': { type: 'boolean' }, at: { type: 'string' } } });
const at = values.at ? new Date(values.at) : new Date();
if (Number.isNaN(at.getTime()) || at.getTime() > Date.now())
  throw new Error(`--at must be a past ISO time: ${values.at}`);
const p = plan();
const cycle = billingCycle(at, Number(process.env.CF_BILLING_DAY || 25));
const data = await collect(await accountId(), at, cycle);
const rows = evaluate(data.cycle, data.today, p, cycle);
const report = [markdown(rows, spikes(data.cycle, data.today, p, cycle, at), p, cycle, at), ...data.notes].join('\n');
process.stdout.write(`${report}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
const over = overThreshold(rows);
if (over.length > 0 && values['github-issue'] && !values.at) upsertIssue(issueBody(over, rows, report));
