// 소품 자리 정착(M07 사전 ⓪): 차도 위 점 → 가장 가까운 비차도 쪽으로. 보도면 연석 뒤 WALK_BACK_M, 보도 없는 길(건물·공지 가장자리)이면
// 가장자리 안쪽 ROADSIDE_IN_M(생활도로 길가). 보도 위인데 연석에 너무 붙은 기둥은 차도 반대쪽으로 민다. 파이프라인 validate(`validate-props.ts`)가
// 같은 판정(SiteTest·nearestSide)으로 MVP 전체 셀을 검사한다. see docs/04-data-pipeline.md §4.3
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
/** 비차도 탐색 반경(m) — 넓은 간선(≈ 40 m) 한가운데서도 보도·중앙 분리대를 찾는다. */
export const ROADSIDE_SEARCH_M = 25;

/** 점 분류: 건물 발자국 안 = 'none'(차도 폴리곤이 건물 밑으로 들어가도 길가로 본다). */
export interface SiteTest {
  side(x: number, z: number): RoadSide;
}

/** 배치 문맥의 점 분류(건물 발자국 = 비차도). */
export function siteTest(c: Pick<PlaceCtx, 'roads' | 'inBuilding'>): SiteTest {
  return { side: (x, z) => (c.inBuilding(x, z) ? 'none' : c.roads.classify(x, z)) };
}

const DIRS = 32;

/** p에서 want 분류 점까지 최소 거리(32방위, step 간격, ≤ max — 없으면 d = −1). 같은 거리면 보도 방향 우선. */
export function nearestSide(
  t: SiteTest,
  p: V2,
  want: (s: RoadSide) => boolean,
  max: number,
  step = 0.25,
): { d: number; walk: boolean; u?: V2 } {
  for (let d = step; d <= max + 1e-9; d += step) {
    let u: V2 | undefined;
    let walk = false;
    for (let k = 0; k < DIRS; k++) {
      const a = (k / DIRS) * 2 * Math.PI;
      const q: V2 = [Math.cos(a), Math.sin(a)];
      const s = t.side(p[0] + q[0] * d, p[1] + q[1] * d);
      if (!want(s)) continue;
      if (!u || (s === 'walk' && !walk)) u = q;
      if (s === 'walk') walk = true;
    }
    if (u) return { d, walk, u };
  }
  return { d: -1, walk: false };
}

/** p에서 u 방향으로 keep이 유지되는 거리(0.1 m 행진 + 이분 5회 ≈ 3 mm, ≤ max). */
function runAlong(t: SiteTest, p: V2, u: V2, keep: (s: RoadSide) => boolean, max: number): number {
  const ok = (s: number): boolean => keep(t.side(p[0] + u[0] * s, p[1] + u[1] * s));
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

/** 보도 위 p가 차도에서 < WALK_BACK_M면 차도 반대쪽으로 — 보도가 좁으면(건물·공지까지) 폭 가운데까지만. */
export function behindCurb(t: SiteTest, p: V2): V2 {
  if (t.side(p[0], p[1]) !== 'walk') return p;
  const n = nearestSide(t, p, (s) => s === 'road', WALK_BACK_M, 0.05);
  if (n.d < 0 || !n.u) return p;
  const away: V2 = [-n.u[0], -n.u[1]];
  const room = runAlong(t, p, away, (s) => s === 'walk', 2);
  const target = Math.min(WALK_BACK_M, n.d + room / 2);
  if (target <= n.d) return p;
  return along(p, away, target - n.d);
}

/** 지상 소품 자리: 차도 위 → 보도(연석 뒤) 또는 보도 없는 길가, 보도 위 → 연석 뒤. 공지·건물 쪽은 그대로. */
export function settleSite(t: SiteTest, p: V2): V2 {
  const side = t.side(p[0], p[1]);
  if (side === 'walk') return behindCurb(t, p);
  if (side !== 'road') return p;
  const n = nearestSide(t, p, (s) => s !== 'road', ROADSIDE_SEARCH_M);
  if (n.d < 0 || !n.u) return p;
  const u = n.u;
  const e = runAlong(t, p, u, (s) => s === 'road', n.d + 0.5);
  if (!n.walk) return along(p, u, Math.max(0, e - ROADSIDE_IN_M));
  for (const back of [WALK_BACK_M, CURB_BACK_M + 0.1, 0.15]) {
    const q = along(p, u, e + back);
    if (t.side(q[0], q[1]) === 'walk') return behindCurb(t, q);
  }
  return along(p, u, e + 0.05);
}
