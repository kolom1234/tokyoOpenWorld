// 비용 회로 차단기 판정(ADR-0104 — 순수 함수, 테스트): TOKYO SANPO("ours") 지표 하나라도 포함량 90 % 초과, 또는 계정 전체 주기 말 예상 초과 요금 > $1.
// 카운터 지표의 예상은 경과 3일 하한으로 외삽한다 — 주기 첫 몇 시간의 급증이 수십 배로 부풀어 production을 막는 오탐 방지. 이미 넘은 실제 초과는 그대로 센다.
import { type Cycle, fmt, LABELS, PLANS, type Plan, type Row, STORAGE } from './usage.ts';

export const BREAKER = {
  /** ours 지표의 포함량 대비 누적 비율 상한. */
  oursRatio: 0.9,
  /** account(계정 단위 청구) 주기 말 예상 추가 요금 상한 USD. */
  accountExtraUsd: 1,
  /** 카운터 외삽의 경과 일수 하한. */
  minElapsedDays: 3,
} as const;

export interface Trip {
  tripped: boolean;
  /** 원인 지표·수치(이슈 본문용, 사람이 읽는 문장). */
  reasons: string[];
  /** 차단기 기준 account 예상 추가 요금 합계 USD. */
  extraUsd: number;
}

/** 차단기 기준 예상 추가 요금(account 행만): 카운터 = 누적 ÷ max(경과 비율, 3일), 저장량 = 기존 예상(누적 GB-월 + 최근 값 유지). */
export function breakerExtraUsd(r: Row, plan: Plan, cycle: Cycle): number {
  const a = PLANS[plan][r.metric];
  if (r.scope !== 'account' || a?.usd === undefined || a.unit === undefined || a.per !== 'cycle') return 0;
  const cycleDays = (cycle.end.getTime() - cycle.start.getTime()) / 86_400_000;
  const elapsed = Math.min(1, Math.max(cycle.elapsed, BREAKER.minElapsedDays / cycleDays));
  const projected = STORAGE.has(r.metric) ? r.projectedRatio * r.included : r.used / elapsed;
  return (Math.max(0, projected - a.included) / a.unit) * a.usd;
}

export function evaluateBreaker(rows: readonly Row[], plan: Plan, cycle: Cycle): Trip {
  const reasons: string[] = [];
  for (const r of rows) {
    if (r.scope !== 'ours' || !(r.ratio > BREAKER.oursRatio)) continue;
    const pct = (r.ratio * 100).toFixed(1);
    reasons.push(
      `ours ${LABELS[r.metric]}: 포함량의 ${pct} % (${fmt(r.metric, r.used)} / ${fmt(r.metric, r.included)}) > ${BREAKER.oursRatio * 100} %`,
    );
  }
  const parts = rows
    .map((r) => ({ r, usd: breakerExtraUsd(r, plan, cycle) }))
    .filter((x) => x.usd > 0)
    .sort((a, b) => b.usd - a.usd);
  const extraUsd = parts.reduce((s, x) => s + x.usd, 0);
  if (extraUsd > BREAKER.accountExtraUsd) {
    const top = parts
      .slice(0, 3)
      .map(({ r, usd }) => `${LABELS[r.metric]} $${usd.toFixed(2)}${r.top ? ` (${r.top})` : ''}`)
      .join(' · ');
    reasons.push(`account 주기 말 예상 추가 요금 $${extraUsd.toFixed(2)} > $${BREAKER.accountExtraUsd} — ${top}`);
  }
  return { tripped: reasons.length > 0, reasons, extraUsd };
}
