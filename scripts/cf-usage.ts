// `node scripts/cf-usage.ts [--github-issue] [--at <ISO 시각>]`(M11-T06): Cloudflare 요금제 포함량 대비 사용량 — 요금제 CF_PLAN(paid|free, 기본 paid)·청구 시작일 CF_BILLING_DAY(기본 25).
// paid = 청구 주기 누적 ÷ Workers Paid·R2 포함량(계정 단위). `--github-issue`이고 70 % 초과 항목이 있으면 라벨 cf-usage 이슈(열린 이슈가 있으면 본문만 갱신).
// 오늘(UTC) 값은 급증 참고표로만 — 이슈를 열지 않는다. `--at`은 그 시각까지로 계산(대시보드 Billable usage 대조용 — 대시보드는 전날 끝까지 반영), 이슈 없음.
// 토큰 권한 = Account Analytics: Read(+ 이름: Workers KV Storage·Workers Scripts·Queues Read, 로그: Workers Observability). `usage.yml`이 30분마다 실행.
// `--kill-switch`(ADR-0104): 차단 조건(ours 90 % 초과·account 예상 초과 요금 > $1)이면 라벨 cf-kill-switch 이슈 + CF_KILLSWITCH_TOKEN이 있으면 WAF 규칙을 켠다(없으면 차단 건너뜀). 해제는 수동만.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { evaluateBreaker, type Trip } from './lib/breaker.ts';
import { accountId } from './lib/cf-api.ts';
import { apiFromEnv, setEnabled } from './lib/killswitch.ts';
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

const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8' }).trim();

function upsertIssue(body: string): void {
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

/** 차단 이슈(라벨 cf-kill-switch): 열린 것이 있으면 본문만 갱신(알림은 처음 한 번). */
function upsertKillIssue(body: string): void {
  const open = gh([
    'issue',
    'list',
    '--label',
    'cf-kill-switch',
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
    'cf-kill-switch',
    '--force',
    '--color',
    'B60205',
    '--description',
    'Cost circuit breaker tripped',
  ]);
  gh(['issue', 'create', '--title', '비용 차단 장치 작동(킬 스위치)', '--label', 'cf-kill-switch', '--body', body]);
}

/** 차단 조건 충족 → 규칙 켜기(토큰 있을 때) + 이슈. 해제는 하지 않는다. */
async function tripKillSwitch(trip: Trip, report: string, issue: boolean): Promise<void> {
  const api = apiFromEnv();
  let action: string;
  if (!api) action = '⚠️ CF_KILLSWITCH_TOKEN 없음 — **차단 건너뜀**(감시·이슈만). 토큰 권한·등록은 docs/13 §6.';
  else {
    try {
      const changed = await setEnabled(api, 'production', true);
      action = changed
        ? '🛑 WAF 규칙 `sanpo-kill-switch` 켬 — earthaimap.com `/api/*`·`/world/*` 차단'
        : '🛑 이미 차단 중';
    } catch (e) {
      action = `❌ 차단 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const body = [
    `차단 조건 충족(${new Date().toISOString()}):`,
    ...trip.reasons.map((r) => `- ${r}`),
    '',
    `조치: ${action}`,
    '',
    '해제(자동 재활성화 없음): 원인 확인 → `CF_KILLSWITCH_TOKEN=… pnpm killswitch off` → https://earthaimap.com 확인 → 이 이슈 닫기. 절차 docs/13 §6.',
    '',
    report,
  ].join('\n');
  process.stdout.write(`kill switch: ${action}\n`);
  if (issue) upsertKillIssue(body);
}

const { values } = parseArgs({
  options: { 'github-issue': { type: 'boolean' }, 'kill-switch': { type: 'boolean' }, at: { type: 'string' } },
});
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
const trip = evaluateBreaker(rows, p, cycle);
const breakerLine = trip.tripped
  ? `TRIPPED — ${trip.reasons.join(' / ')}`
  : `ok (account projected extra $${trip.extraUsd.toFixed(2)})`;
process.stdout.write(`breaker: ${breakerLine}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nbreaker: ${breakerLine}\n`);
if (trip.tripped && values['kill-switch'] && !values.at)
  await tripKillSwitch(trip, report, values['github-issue'] === true);
