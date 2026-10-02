// 정지선·「止まれ」 위치(M05-T02, 04 §4.3): (1) 신호 횡단 띠를 가로지르는 차도 선마다 상류 쪽 횡단 띠 끝 + 2 m에 폭 0.45 m 흰 선 —
// 양방향은 진행 차로(좌측통행 = 진행 방향 왼쪽)만, 일방통행은 전폭. (2) OSM highway=stop 점 = 가장 가까운 차도 선(5 m 안) 진행 차로에 정지선 + 상류 3 m에 「止まれ」.
import type { OsmRecord } from '../../normalize-osm.ts';
import { add, leftOf, type MarkCtx, mul, norm, owns, PAINT, stripe, sub, type V2 } from './common.ts';
import type { CrossBand } from './crosswalk.ts';
import { edgeDistance, isLaneRoad, laneFrame, laneLines } from './lanes.ts';
import { addStopText } from './text.ts';

export const STOP_W_M = 0.45;
const SETBACK_M = 2;
const NODE_SNAP_M = 5;
const TEXT_BACK_M = 3;

const VEHICLE_LINES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'service',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);

export function isVehicleRoad(r: OsmRecord): boolean {
  return r.geom === 'line' && VEHICLE_LINES.has(r.tags.highway ?? '') && r.tags.highway !== 'service';
}

function segHit(a: V2, b: V2, c: V2, d: V2): V2 | undefined {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return undefined;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? add(a, mul(r, t)) : undefined;
}

const oneway = (r: OsmRecord): boolean => r.tags.oneway === 'yes' || r.tags.oneway === '1';

/** 진행 방향 d 차로의 정지선(중심 y): 양방향 = 중앙(차선 경계)부터 왼쪽 가장자리, 일방 = 전폭. 반환 = 그렸는지. */
function stopAcross(c: MarkCtx, y: V2, d: V2, r: OsmRecord, dirSign: 1 | -1): boolean {
  // 교차부(1020) 안·보도 위·남의 셀이면 없음 — 교차로를 통과하는 선의 반대편 교차점은 교차부 안에 떨어진다.
  if (!owns(c, y) || c.roads.classify(y[0], y[1]) !== 'road' || c.inIntersection(y[0], y[1])) return false;
  if (c.stopBlocked?.(y)) return false;
  const v = leftOf(d);
  const eL = edgeDistance(c, y, v);
  const eR = edgeDistance(c, y, mul(v, -1));
  const { n, lines } = laneLines(r);
  // 차선과 같은 틀(laneFrame): 길이는 차로 묶음 폭까지(교차로 쪽으로 열린 차도 폭 전체를 긋지 않게).
  const { laneW, groupLeft } = laneFrame(eL, eR, n);
  const left = add(y, mul(v, Math.min(eL, groupLeft)));
  if (oneway(r)) return stripe(c, add(y, mul(v, groupLeft - laneW * n)), left, STOP_W_M, PAINT.white) > 0;
  // 양방향: d(= 선 방향 × dirSign)의 왼쪽 = 진행 차로만, 중앙선(실선 경계)까지.
  const center = lines.find((l) => !l.dashed)?.k ?? Math.ceil(n / 2);
  const mid = add(y, mul(v, groupLeft - laneW * (dirSign === 1 ? center : n - center)));
  return stripe(c, mid, left, STOP_W_M, PAINT.white) > 0;
}

/** 신호 횡단 띠 × 차도 선 교차 → 상류 정지선. */
export function addSignalStops(c: MarkCtx, bands: readonly CrossBand[], roads: readonly OsmRecord[]): number {
  let n = 0;
  for (const band of bands) {
    if (!band.signal) continue;
    for (const r of roads) {
      const xz = r.rings[0] ?? [];
      for (let i = 0; i + 3 < xz.length; i += 2) {
        const p: V2 = [xz[i] as number, xz[i + 1] as number];
        const q: V2 = [xz[i + 2] as number, xz[i + 3] as number];
        const x = segHit(band.a, band.b, p, q);
        if (!x) continue;
        const d = norm(sub(q, p));
        const off = band.half + SETBACK_M + STOP_W_M / 2;
        if (stopAcross(c, add(x, mul(d, -off)), d, r, 1)) n++;
        if (!oneway(r) && stopAcross(c, add(x, mul(d, off)), mul(d, -1), r, -1)) n++;
      }
    }
  }
  return n;
}

/** 가장 가까운 차도 선 위 점·방향(5 m 안). */
function snapToRoad(p: V2, roads: readonly OsmRecord[]) {
  let best: { q: V2; d: V2; r: OsmRecord; dist: number; toEnd: V2 } | undefined;
  for (const r of roads) {
    const xz = r.rings[0] ?? [];
    const first: V2 = [xz[0] as number, xz[1] as number];
    const last: V2 = [xz[xz.length - 2] as number, xz[xz.length - 1] as number];
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const a: V2 = [xz[i] as number, xz[i + 1] as number];
      const b: V2 = [xz[i + 2] as number, xz[i + 3] as number];
      const ab = sub(b, a);
      const len2 = ab[0] * ab[0] + ab[1] * ab[1];
      const t = len2 > 0 ? Math.min(Math.max(((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2, 0), 1) : 0;
      const q = add(a, mul(ab, t));
      const dist = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (dist > NODE_SNAP_M || (best && dist >= best.dist)) continue;
      const nearEnd =
        Math.hypot(q[0] - first[0], q[1] - first[1]) < Math.hypot(q[0] - last[0], q[1] - last[1]) ? first : last;
      best = { q, d: norm(ab), r, dist, toEnd: nearEnd };
    }
  }
  return best;
}

/** highway=stop 점 → 정지선 + 「止まれ」(진행 방향 = direction 태그, 없으면 가까운 선 끝(교차점) 쪽). */
export function addStopSigns(c: MarkCtx, nodes: readonly OsmRecord[], roads: readonly OsmRecord[]): number {
  let n = 0;
  for (const s of nodes) {
    const p0 = s.rings[0];
    if (!p0 || s.geom !== 'point' || s.tags.highway !== 'stop') continue;
    const hit = snapToRoad([p0[0] as number, p0[1] as number], roads);
    if (!hit) continue;
    let sign: 1 | -1 = s.tags.direction === 'backward' ? -1 : 1;
    if (s.tags.direction !== 'forward' && s.tags.direction !== 'backward') {
      const toEnd = sub(hit.toEnd, hit.q);
      sign = toEnd[0] * hit.d[0] + toEnd[1] * hit.d[1] >= 0 ? 1 : -1;
    }
    const d = mul(hit.d, sign);
    if (!stopAcross(c, hit.q, d, hit.r, sign)) continue;
    n++;
    addStopText(c, add(hit.q, mul(d, -TEXT_BACK_M)), d, oneway(hit.r) || !isLaneRoad(hit.r) ? 'full' : 'left');
  }
  return n;
}
