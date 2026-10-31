// `pnpm errors [--env staging|production] [--hours 24] [--include-test]`(M11-T03): Analytics Engine 오류 보고 집계(종류·메시지·첫 프레임·빌드·백엔드별 건수, 1/샘플률 가중 추정).
// 데이터셋 = wrangler.jsonc LOGS(sanpo_errors · staging sanpo_errors_staging). blob 순서 = apps/worker/src/routes/log.ts dataPoint.
// F03(ADR-0103): 샘플률이 Worker 허용 값(REPORT_SAMPLE_RATES)이 아닌 옛 행·`kind:"test"`(합성 보고)는 운영 통계에서 뺀다 — 1/rate 가중이 극소값으로 부풀지 않게.
import { parseArgs } from 'node:util';
import { accountId, aeSql } from './lib/cf-api.ts';

/** = apps/worker/src/routes/log.ts REPORT_SAMPLE_RATES(Worker가 받는 값 — 바꾸면 둘 다). */
const REPORT_SAMPLE_RATES = [0.01, 1];

const { values } = parseArgs({
  options: {
    env: { type: 'string', default: 'staging' },
    hours: { type: 'string', default: '24' },
    'include-test': { type: 'boolean', default: false },
  },
});
const dataset = values.env === 'production' ? 'sanpo_errors' : 'sanpo_errors_staging';
const hours = Math.max(1, Math.min(24 * 90, Number(values.hours) || 24));
const rates = REPORT_SAMPLE_RATES.map((r) => `double2 = ${r}`).join(' OR ');
const testFilter = values['include-test'] ? '' : ` AND blob1 != 'test'`;
const sql = `SELECT blob1 AS kind, blob2 AS message, blob3 AS frame, blob4 AS build, blob5 AS version, blob6 AS backend, blob7 AS browser,
  count() AS reports, round(sum(_sample_interval / double2)) AS estimated
  FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '${hours}' HOUR AND (${rates})${testFilter}
  GROUP BY kind, message, frame, build, version, backend, browser ORDER BY reports DESC LIMIT 50 FORMAT JSON`;
const rows = await aeSql(await accountId(), sql);
process.stdout.write(`${dataset} — last ${hours} h: ${rows.length} groups\n`);
for (const r of rows) process.stdout.write(`${JSON.stringify(r)}\n`);
