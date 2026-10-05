// 소품 자리 정착(M07 사전 ⓪, ADR-0068): 차도 위 점 → 보도(연석 뒤 WALK_BACK_M) 또는 보도 없는 길가(가장자리 안쪽 ROADSIDE_IN_M).
// 보도 위인데 연석에 붙은 기둥은 차도 반대쪽으로. 파이프라인 validate(`validate-props.ts`)가 같은 판정 함수로 MVP 전체 셀을 검사한다.
// 경계 판정은 "단단한" 면만 — PLATEAU 도로 조각 사이 실틈(수 cm)은 SOLID_M 너머에서도 같은 분류여야 가장자리로 본다. see docs/04-data-pipeline.md §4.3
import type { RoadSide } from '../roads.ts';
import type { PlaceCtx, V2 } from './context.ts';

/** 보도 위 길가 기둥이 차도에서 떨어져야 하는 최소 거리(m, validate 기준). */
export const CURB_BACK_M = 0.3;
/** 차도에서 보도로 옮길 때 연석 뒤 목표 거리(m). */
export const WALK_BACK_M = 0.5;
/** 보도 없는 길: 가장자리(건물·공지)에서 차도 안쪽 목표 거리(m). */
export const ROADSIDE_IN_M = 0.4;
/** 보도 없는 길가로 인정하는 가장자리 거리(m, validate 기준). */
export const EDGE_M = 1.0;
/** 길가 소품 근처(이 안)에 보도가 있으면 보도로 올린다(validate도 같은 거리로 오류). */
export const WALK_NEAR_M = 1.0;
/** 비차도 탐색 반경(m) — 넓은 간선(≈ 40 m) 한가운데서도 보도·중앙 분리대를 찾는다. */
export const ROADSIDE_SEARCH_M = 25;
/** 경계 확인 깊이(m): 처음 만난 분류가 이만큼 더 가서도 같아야 한다(도로 조각 사이 실틈·얇은 조각 무시). */
export const SOLID_M = 0.75;

/** 점 분류: 건물 발자국 안 = 'none'(차도 폴리곤이 건물 밑으로 들어가도 길가로 본다). */
export interface SiteTest {
  side(x: number, z: number): RoadSide;
}

/** 배치 문맥의 점 분류(건물 발자국 = 비차도 — 정밀 링 시험이 있으면 그것: validate와 같은 판정). */
export function siteTest(c: Pick<PlaceCtx, 'roads' | 'inBuilding' | 'inFootprint'>): SiteTest {
  const inside = c.inFootprint ?? c.inBuilding;
  return { side: (x, z) => (inside(x, z) ? 'none' : c.roads.classify(x, z)) };
}

const DIRS = 32;

/**
 * p에서 want 분류 점까지 최소 거리(32방위, step 간격, ≤ max — 없으면 d = −1). solid > 0이면 그 방향으로 solid m 더 가서도 want여야 센다.
 * 같은 거리면 보도 방향 우선.
 */
export function nearestSide(
  t: SiteTest,
  p: V2,
  want: (s: RoadSide) => boolean,
  max: number,
  step = 0.25,
  solid = 0,
): { d: number; walk: boolean; u?: V2 } {
  for (let d = step; d <= max + 1e-9; d += step) {
    let u: V2 | undefined;
    let walk = false;
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * 2 * Math.PI;
      const q: V2 = [Math.cos(a), Math.sin(a)];
      const s = t.side(p[0] + q[0] * d, p[1] + q[1] * d);
      if (!want(s)) continue;
      if (solid > 0 && !want(t.side(p[0] + q[0] * (d + solid), p[1] + q[1] * (d + solid)))) continue;
      if (!u || (s === 'walk' && !walk)) u = q;
      if (s === 'walk') walk = true;
    }
    if (u) return { d, walk, u };
  }
  return { d: -1, walk: false };
}

/** p에서 u 방향으로 keep이 유지되는 거리(0.1 m 행진 + 이분 5회 ≈ 3 mm, ≤ max). solid > 0이면 그보다 얇은 틈은 건너뛴다. */
export function runAlong(t: SiteTest, p: V2, u: V2, keep: (s: RoadSide) => boolean, max: number, solid = 0): number {
  const at = (s: number): boolean => keep(t.side(p[0] + u[0] * s, p[1] + u[1] * s));
  const ok = (s: number): boolean => at(s) || (solid > 0 && at(s + solid));
  let s = 0;
  while (s < max && ok(s + 0.1)) s += 0.1;
  let hi = s + 0.1;
  for (let k = 0; k < 5; k++) {
    const mid = (s + hi) / 2;
    if (ok(mid)) s = mid;
    else hi = mid;
  }
  return s;
}

const along = (p: V2, u: V2, s: number): V2 => [p[0] + u[0] * s, p[1] + u[1] * s];
const isRoad = (s: RoadSide): boolean => s === 'road';
const notRoad = (s: RoadSide): boolean => s !== 'road';
const isWalk = (s: RoadSide): boolean => s === 'walk';

/** p에서 가장 가까운 단단한 차도(≤ max, 0.05 m 간격). */
export const nearestRoad = (t: SiteTest, p: V2, max: number) => nearestSide(t, p, isRoad, max, 0.05, SOLID_M);

/** 보도 위 p가 차도에서 < WALK_BACK_M면 차도 반대쪽으로 — 보도가 좁으면(건물·공지까지) 폭 가운데까지만. */
export function behindCurb(t: SiteTest, p: V2): V2 {
  if (t.side(p[0], p[1]) !== 'walk') return p;
  const n = nearestRoad(t, p, WALK_BACK_M);
  if (n.d < 0 || !n.u) return p;
  const away: V2 = [-n.u[0], -n.u[1]];
  const room = runAlong(t, p, away, isWalk, 2);
  // 좁은 보도·교통섬은 양쪽 연석 가운데((가까운 연석 거리 + 남은 폭) ÷ 2).
  const target = Math.min(WALK_BACK_M, (n.d + room) / 2);
  if (target <= n.d) return p;
  return along(p, away, target - n.d);
}

/** 보도 폭(가장 가까운 차도에서 반대쪽 보도 끝까지, ≤ 2 m 탐색) — 좁은 교통섬이면 연석 뒤 CURB_BACK_M을 못 지킨다(validate 예외). */
export function walkRoom(t: SiteTest, p: V2): number {
  const n = nearestRoad(t, p, 2);
  if (n.d < 0 || !n.u) return Number.POSITIVE_INFINITY;
  return n.d + runAlong(t, p, [-n.u[0], -n.u[1]], isWalk, 2);
}

/** 차도 위 p를 u 방향 보도로(연석 뒤 WALK_BACK_M, 보도가 좁으면 덜). */
function ontoWalk(t: SiteTest, p: V2, u: V2, reach: number): V2 {
  const e = runAlong(t, p, u, isRoad, reach + 0.5, SOLID_M);
  for (const back of [WALK_BACK_M, CURB_BACK_M + 0.1, 0.15]) {
    const q = along(p, u, e + back);
    if (t.side(q[0], q[1]) === 'walk') return behindCurb(t, q);
  }
  return along(p, u, e + 0.05);
}

/** 차도 위 p 근처(WALK_NEAR_M 안) 단단한 보도 — validate와 같은 시험. */
export const walkNear = (t: SiteTest, p: V2) => nearestSide(t, p, isWalk, WALK_NEAR_M, 0.25, SOLID_M);

/** 차도 위 p의 가장 가까운 단단한 비차도(≤ ROADSIDE_SEARCH_M) — validate와 같은 시험. */
export const edgeNear = (t: SiteTest, p: V2) => nearestSide(t, p, notRoad, ROADSIDE_SEARCH_M, 0.25, SOLID_M);

/** 지상 소품 자리: 차도 위 → 보도(연석 뒤) 또는 보도 없는 길가, 보도 위 → 연석 뒤. 공지·건물 쪽은 그대로. */
export function settleSite(t: SiteTest, p: V2): V2 {
  const side = t.side(p[0], p[1]);
  if (side === 'walk') return behindCurb(t, p);
  if (side !== 'road') return p;
  const edge = edgeNear(t, p);
  const walk = nearestSide(t, p, isWalk, ROADSIDE_SEARCH_M, 0.25, SOLID_M);
  if (walk.u && (edge.d < 0 || walk.d <= edge.d + WALK_NEAR_M)) return ontoWalk(t, p, walk.u, walk.d);
  if (!edge.u) return p;
  const e = runAlong(t, p, edge.u, isRoad, edge.d + 0.5, SOLID_M);
  return preferWalk(t, along(p, edge.u, Math.max(0, e - ROADSIDE_IN_M)));
}

/** 차도 쪽 길가 자리(전주 등) 옆(WALK_NEAR_M 안)에 보도가 있으면 보도로(모퉁이 — 길가와 보도 거리가 비슷). */
export function preferWalk(t: SiteTest, q: V2): V2 {
  if (t.side(q[0], q[1]) !== 'road') return q;
  const w = walkNear(t, q);
  return w.u ? ontoWalk(t, q, w.u, w.d) : q;
}
