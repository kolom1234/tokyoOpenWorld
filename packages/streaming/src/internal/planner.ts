// 재계산 1회: 원하는 셀 집합 → 범위 밖 진행 중 요청 취소 → 부족한 셀 순위 매겨 요청 → 해제 계획(실행은 서비스가 프레임 예산으로).
// 호출 주기는 서비스가 제한(관심점 L0 셀·모드·티어 변화 즉시, 그 외 recomputeIntervalMs — ADR-0023). see docs/06-world-streaming.md §2–4
import type { CellKey } from '@sanpo/core';
import type { StreamingConfig } from '../api.ts';
import type { CellIndex } from './cell-index.ts';
import type { InterestFrame } from './geometry.ts';
import { computeDesired, type DesiredCells, planEvictions } from './interest.ts';
import { IN_FLIGHT, type Lifecycle, RESIDENT } from './lifecycle.ts';
import { rankCells } from './priority.ts';
import type { LoadScheduler } from './scheduler.ts';

export interface PlannerCtx {
  index: CellIndex;
  cfg: StreamingConfig;
  life: Lifecycle;
  sched: LoadScheduler;
  /** whenReady 대상(로드 반경과 무관하게 로드·유지). */
  pinned: ReadonlySet<CellKey>;
  /** exclusive whenReady 대상 — null이 아니면 이 셀만 새로 요청. */
  exclusive?: ReadonlySet<CellKey> | null;
}

export interface PlanOutcome {
  desired: DesiredCells;
  requested: number;
  cancelled: number;
  /** 해제할 상주 셀(먼 순 아님 — 서비스가 프레임 예산으로 나눠 실행). */
  evict: CellKey[];
  overLimit: [number, number, number, number];
}

function withPinned(desired: DesiredCells, c: PlannerCtx): DesiredCells {
  for (const key of c.pinned) {
    if (!c.index.has(key)) continue;
    desired.load.add(key);
    desired.keep.delete(key);
  }
  return desired;
}

export function recompute(c: PlannerCtx, frame: InterestFrame, now: number): PlanOutcome {
  const inFlight = c.life.keys(IN_FLIGHT);
  const resident = c.life.keys(RESIDENT);
  // 진행 중 요청도 "보유"로 넘겨 유지 반경(× 1.25) 안이면 취소하지 않는다(경계 왕복 시 재요청 반복 방지).
  const held = new Set<CellKey>([...resident, ...inFlight]);
  const desired = withPinned(computeDesired(c.index, frame, held, c.cfg.interest), c);
  let cancelled = 0;
  for (const key of inFlight) {
    // exclusive 중엔 대상 밖 대기열(아직 fetch 전) 요청도 내린다 — 대상이 끝나면 다음 재계산이 다시 요청.
    const parked = c.exclusive && !c.exclusive.has(key) && c.life.stateOf(key) === 'queued';
    if (!parked && (desired.load.has(key) || desired.keep.has(key))) continue;
    c.sched.cancel(key);
    c.life.cancelled(key);
    cancelled++;
  }
  const candidates: CellKey[] = [];
  for (const key of desired.load) {
    if (c.exclusive && !c.exclusive.has(key)) continue;
    if (c.life.requestable(key, now) || c.life.stateOf(key) === 'queued') candidates.push(key);
  }
  let requested = 0;
  for (const { key, score } of rankCells(candidates, frame, c.cfg)) if (c.sched.request(key, score)) requested++;
  const plan = planEvictions(resident, desired, frame, c.cfg);
  c.life.pruneFailed(now, desired.load);
  return { desired, requested, cancelled, evict: plan.evict, overLimit: plan.overLimit };
}
