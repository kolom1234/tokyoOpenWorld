// Workers Logs(Observability) 이벤트 수(M11-T06 사용량 점검): Workers Observability 텔레메트리 쿼리로 Worker별
// 로그 = console 줄(`cf-worker`) + 호출 로그(`cf-worker-event`)를 센다. span(트레이스)은 2026-12-01 전 미과금이라 뺀다.
// Paid 보존 7일 — 주기가 더 길면 창(최근 ≈ 7일)의 Worker별 "호출 로그 1건당 로그 수" × 주기 호출 수(GraphQL)로 외삽한다.
// 토큰 권한 = Workers Observability(쿼리 API는 Write 권한 요구). 실패하면 호출 수로 추정(호출 1건 = 로그 1건).
import { rest } from './cf-api.ts';

/** 보존(7일)보다 1시간 짧게 — 창 시작이 보존 경계에 걸려 잘리지 않게. */
const WINDOW_MS = 7 * 86_400_000 - 3_600_000;

export interface ScriptLogs {
  /** 과금 로그(console 줄 + 호출 로그). */
  logs: number;
  /** 호출 로그(`cf-worker-event`) — 외삽 분모. */
  invocations: number;
}

interface Aggregate {
  groups?: { key: string; value: string | number | boolean }[];
  value: number;
}

/** 텔레메트리 count 집계(Worker × 이벤트 종류) → Worker별 로그·호출 로그. */
export function parseAggregates(aggs: readonly Aggregate[]): Map<string, ScriptLogs> {
  const out = new Map<string, ScriptLogs>();
  for (const a of aggs) {
    const g = new Map((a.groups ?? []).map((x) => [x.key, String(x.value)]));
    const script = g.get('$workers.scriptName') ?? '(unknown)';
    const type = g.get('$metadata.type') ?? '';
    if (type === 'span') continue;
    const cur = out.get(script) ?? { logs: 0, invocations: 0 };
    cur.logs += a.value;
    if (type === 'cf-worker-event') cur.invocations += a.value;
    out.set(script, cur);
  }
  return out;
}

/** 창이 주기 전체를 덮으면(full) 창 값 그대로, 아니면 Worker별 로그/호출 로그 비율 × 주기 호출 수(창에 호출 로그가 없으면 창 값). */
export function extrapolate(
  window: ReadonlyMap<string, ScriptLogs>,
  cycleInvocations: ReadonlyMap<string, number>,
  full: boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [script, w] of window) {
    const inv = cycleInvocations.get(script) ?? 0;
    out.set(script, full || w.invocations === 0 ? w.logs : Math.max(w.logs, (w.logs / w.invocations) * inv));
  }
  return out;
}

async function query(acc: string, from: number, to: number): Promise<Map<string, ScriptLogs>> {
  const by = (value: string) => ({ type: 'string', value });
  const r = await rest<{ calculations?: { aggregates?: Aggregate[] }[] }>(
    `/accounts/${acc}/workers/observability/telemetry/query`,
    {
      queryId: 'sanpo-cf-usage',
      dry: true,
      view: 'calculations',
      ignoreSeries: true,
      limit: 2000,
      timeframe: { from, to },
      parameters: {
        datasets: [],
        calculations: [{ operator: 'count', alias: 'n' }],
        groupBys: [by('$workers.scriptName'), by('$metadata.type')],
        limit: 2000,
      },
    },
  );
  return parseAggregates(r.result.calculations?.[0]?.aggregates ?? []);
}

export interface LogCounts {
  cycle: Map<string, number>;
  today: Map<string, number>;
  note: string;
}

/** 주기·오늘(UTC) Worker별 로그 수. 실패하면 undefined(호출 수 추정으로 대체). */
export async function logCounts(
  acc: string,
  start: Date,
  midnight: Date,
  at: Date,
  cycleInvocations: ReadonlyMap<string, number>,
): Promise<LogCounts | undefined> {
  try {
    const from = Math.max(start.getTime(), at.getTime() - WINDOW_MS);
    const full = from === start.getTime();
    const window = await query(acc, from, at.getTime());
    const today = at > midnight ? await query(acc, midnight.getTime(), at.getTime()) : new Map<string, ScriptLogs>();
    const how = full
      ? 'counted exactly (cycle within the 7-day log retention)'
      : 'extrapolated per Worker from the last 7 days (logs per invocation × cycle invocations)';
    return {
      cycle: extrapolate(window, cycleInvocations, full),
      today: new Map([...today].map(([k, v]) => [k, v.logs])),
      note: `Workers Logs ${how}.`,
    };
  } catch {
    return undefined;
  }
}
