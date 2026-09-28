// 요청 우선순위 점수(낮을수록 먼저): 거리/레벨크기 × 뷰 배율, 발밑 셀 고정 최우선, 부모 선행 클램프. 순수 함수. see docs/06-world-streaming.md §4, ADR-0021
import { type CellKey, unpackCellKey } from '@sanpo/core';
import { CELL_SIZES, cellBoundsWF, cellOf, parentOf } from '@sanpo/geo';
import type { StreamingConfig } from '../api.ts';
import { effectiveDistanceM, type InterestFrame, inViewWedge, type PreparedPoint, preparePoints } from './geometry.ts';

export interface RankedCell {
  key: CellKey;
  score: number;
}

const DEG = Math.PI / 180;

/** player·teleport 관심점이 든 L0 셀(발밑 셀 — 물리 필수). */
export function footCells(points: readonly PreparedPoint[]): Set<CellKey> {
  const out = new Set<CellKey>();
  for (const p of points) if (p.kind === 'player' || p.kind === 'teleport') out.add(cellOf(0, p.x, p.z));
  return out;
}

/** 부모 선행 전 점수: min_i(유효거리_i / weight_i × teleport배율) / 레벨크기 × (뷰 쐐기 안 ? inViewFactor : 1). */
function rawScore(key: CellKey, points: readonly PreparedPoint[], cfg: StreamingConfig): number {
  const b = cellBoundsWF(key);
  const level = unpackCellKey(key).level;
  const pr = cfg.priority;
  let d = Number.POSITIVE_INFINITY;
  let inView = false;
  for (const p of points) {
    if (p.fwdX !== 0 || p.fwdZ !== 0) inView ||= inViewWedge(b, p, pr.viewHalfAngleDeg * DEG);
    if (!(p.weight > 0)) continue;
    const k = p.kind === 'teleport' ? pr.teleportFactor : 1;
    d = Math.min(d, (effectiveDistanceM(b, p, level === 0) / p.weight) * k);
  }
  return (d / CELL_SIZES[level]) * (inView ? pr.inViewFactor : 1);
}

/**
 * 후보 셀 점수(입력 순서와 같은 인덱스). 발밑 셀 = footScore(고정·부모 선행 면제).
 * 부모 선행: 부모가 같은 후보 목록에 있으면(= 아직 요청 전) 자식 점수 ≥ 부모 점수 + parentEpsilon — 상위 레벨부터 전파.
 * 관심점이 없거나 weight > 0 인 관심점이 없으면 점수는 +∞(발밑 제외).
 */
export function scoreCells(candidates: readonly CellKey[], frame: InterestFrame, cfg: StreamingConfig): Float64Array {
  const points = preparePoints(frame, cfg.interest);
  const foot = footCells(points);
  const scores = new Float64Array(candidates.length);
  const byKey = new Map<CellKey, number>();
  const order = candidates.map((key, i) => ({ key, i, level: unpackCellKey(key).level }));
  order.sort((a, b) => b.level - a.level);
  for (const { key, i } of order) {
    let s = foot.has(key) ? cfg.priority.footScore : rawScore(key, points, cfg);
    const parent = parentOf(key);
    const ps = parent === null ? undefined : byKey.get(parent);
    if (ps !== undefined && !foot.has(key)) s = Math.max(s, ps + cfg.priority.parentEpsilon);
    scores[i] = s;
    byKey.set(key, s);
  }
  return scores;
}

/** 점수 오름차순(동률은 키 오름차순 — 결정론) 정렬 결과. */
export function rankCells(candidates: readonly CellKey[], frame: InterestFrame, cfg: StreamingConfig): RankedCell[] {
  const scores = scoreCells(candidates, frame, cfg);
  return candidates
    .map((key, i) => ({ key, score: scores[i] ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.score - b.score || a.key - b.key);
}
