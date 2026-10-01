// 차선 표시(M05-T02, 04 §4.3): OSM 차도 중심선(lanes ≥ 2) → 1 m마다 PLATEAU 차도 폭(좌우 가장자리까지 행진)을 재 차선 폭 = 폭 ÷ 차로 수.
// 양방향 = 좌측통행 — 진행 방향 차로는 선 왼쪽. 중앙선 = 4차로 이상 황색 실선·그 밖 흰 실선, 같은 방향 경계 = 흰 점선(5 m/5 m), 폭 0.15 m.
// 교차부(車道交差部 1020)·횡단 띠 ± 1 m·보도 위는 끊는다. 조각 소유 = 중점이 셀 안.
import type { OsmRecord } from '../../normalize-osm.ts';
import { add, leftOf, type MarkCtx, mul, owns, PAINT, polylineOf, stripe, type V2 } from './common.ts';
import { bandDist, type CrossBand } from './crosswalk.ts';

export const LINE_W_M = 0.15;
const DASH_M = 5;
const STEP_M = 1;
const MARCH_M = 0.25;
const MAX_HALF_M = 15;
/** 차로 폭 범위(m): 차도 폭 ÷ 차로 수를 이 범위로 자르고 차로 묶음을 차도 가운데 둔다(갓길·주정차대·버스 정류장 폭 흡수). 2.5 m 미만 = 데이터 불일치로 생략. */
const LANE_SKIP_M = 2.5;
const LANE_MIN_M = 2.75;
const LANE_MAX_M = 3.5;
/** 차선을 긋는 도로 종류. */
const VEHICLE = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);

export function isLaneRoad(r: OsmRecord): boolean {
  return r.geom === 'line' && VEHICLE.has(r.tags.highway ?? '') && Number.parseInt(r.tags.lanes ?? '1', 10) >= 2;
}

/** 점 P에서 방향 v로 차도 끝까지 거리(m, 0.25 m 행진). 시작점이 차도 밖이면 0. */
export function edgeDistance(c: MarkCtx, p: V2, v: V2): number {
  let s = 0;
  while (s < MAX_HALF_M && c.roads.classify(...add(p, mul(v, s + MARCH_M))) === 'road') s += MARCH_M;
  return s;
}

interface LineSpec {
  /** 왼쪽 가장자리에서 오프셋 비율(차로 경계 k/n). */
  k: number;
  paint: number;
  dashed: boolean;
}

/** 차로 수·방향 → 그릴 선(왼쪽 가장자리 기준 k번째 경계). */
export function laneLines(r: OsmRecord): { n: number; lines: LineSpec[] } {
  const n = Math.max(2, Number.parseInt(r.tags.lanes ?? '2', 10));
  const oneway = r.tags.oneway === 'yes' || r.tags.oneway === '1';
  if (oneway)
    return { n, lines: Array.from({ length: n - 1 }, (_, i) => ({ k: i + 1, paint: PAINT.white, dashed: true })) };
  const fwd = Number.parseInt(r.tags['lanes:forward'] ?? '', 10);
  const nf = Number.isFinite(fwd) && fwd > 0 && fwd < n ? fwd : Math.ceil(n / 2);
  const lines: LineSpec[] = [];
  // 좌측통행: 진행 방향(선 방향) 차로 = 선 왼쪽 nf개 → 왼쪽 가장자리부터 nf번째 경계가 중앙선.
  for (let k = 1; k < n; k++) {
    if (k === nf) lines.push({ k, paint: n >= 4 ? PAINT.yellow : PAINT.white, dashed: false });
    else lines.push({ k, paint: PAINT.white, dashed: true });
  }
  return { n, lines };
}

/** 차로 폭(범위로 자름)·차로 묶음 왼쪽 끝(선 기준 v 오프셋 — 차도 중앙에 묶음을 둔다). */
export function laneFrame(eL: number, eR: number, n: number): { laneW: number; groupLeft: number } {
  const laneW = Math.min(Math.max((eL + eR) / n, LANE_MIN_M), LANE_MAX_M);
  return { laneW, groupLeft: (eL - eR) / 2 + (laneW * n) / 2 };
}

/** 한 도로 선 → 차선 조각. 반환 = 그린 조각 수. */
export function addLanes(c: MarkCtx, r: OsmRecord, bands: readonly CrossBand[]): number {
  const pl = polylineOf(r.rings[0] ?? []);
  const { n, lines } = laneLines(r);
  let drawn = 0;
  for (let s = 0; s + STEP_M <= pl.total; s += STEP_M) {
    const { p, dir } = pl.at(s + STEP_M / 2);
    if (!owns(c, p) || c.inIntersection(p[0], p[1]) || c.roads.classify(p[0], p[1]) !== 'road') continue;
    if (bands.some((b) => bandDist(b, p) < b.half + 1)) continue;
    const v = leftOf(dir);
    const eL = edgeDistance(c, p, v);
    const eR = edgeDistance(c, p, mul(v, -1));
    const width = eL + eR;
    if (width / n < LANE_SKIP_M) continue;
    const { laneW, groupLeft } = laneFrame(eL, eR, n);
    const a = pl.at(s).p;
    const b = pl.at(s + STEP_M).p;
    for (const ln of lines) {
      if (ln.dashed && Math.floor(s / DASH_M) % 2 === 1) continue;
      const off = groupLeft - laneW * ln.k;
      const [pa, pb] = [add(a, mul(v, off)), add(b, mul(v, off))];
      if (c.inIntersection(pa[0], pa[1]) || c.inIntersection(pb[0], pb[1])) continue;
      drawn += stripe(c, pa, pb, LINE_W_M, ln.paint);
    }
  }
  return drawn;
}
