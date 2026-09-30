// 일본식 횡단보도(M05-T02, 04 §4.3): OSM footway=crossing 선(표시 있는 것) → 측선 없는 사다리형 — 폭 0.45 m 흰 막대를 선을 따라 0.45 m 간격으로,
// 막대 길이 = 횡단보도 폭(신호 횡단 6 m·그 밖 4 m, `width` 태그 우선). 막대 조각은 차도 위만(보도 위 생략). 스크램블 대각선 횡단도 같은 규칙.
import type { OsmRecord } from '../../normalize-osm.ts';
import { add, type MarkCtx, mul, norm, owns, PAINT, stripe, sub, type V2 } from './common.ts';

export const BAR_M = 0.45;
export const GAP_M = 0.45;
const SIGNAL_WIDTH_M = 6;
const DEFAULT_WIDTH_M = 4;
/** 차도 진입점 탐색 간격(m). */
const ENTER_STEP_M = 0.1;

/** 표시 있는 횡단(측선 없음·무표시 제외). */
export function isMarkedCrossing(r: OsmRecord): boolean {
  const t = r.tags;
  if (r.geom !== 'line' || t.footway !== 'crossing') return false;
  if (t.crossing === 'unmarked' || t.crossing === 'no' || t['crossing:markings'] === 'no') return false;
  return t.crossing !== undefined || t['crossing:markings'] !== undefined;
}

export function crosswalkWidth(r: OsmRecord): number {
  const w = Number.parseFloat(r.tags.width ?? '');
  if (Number.isFinite(w) && w >= 2 && w <= 12) return w;
  return r.tags.crossing === 'traffic_signals' ? SIGNAL_WIDTH_M : DEFAULT_WIDTH_M;
}

/** 선분 하나: 처음 차도에 들어가는 지점부터 막대·간격 반복. 반환 = 막대 수. */
function addSegment(c: MarkCtx, a: V2, b: V2, width: number): number {
  const d = sub(b, a);
  const L = Math.hypot(d[0], d[1]);
  if (L < BAR_M) return 0;
  const u = norm(d);
  let s0 = 0;
  while (s0 < L && c.roads.classify(...add(a, mul(u, s0))) !== 'road') s0 += ENTER_STEP_M;
  let bars = 0;
  for (let s = s0; s + BAR_M <= L; s += BAR_M + GAP_M) {
    const p = add(a, mul(u, s));
    const q = add(a, mul(u, s + BAR_M));
    const mid = add(p, mul(u, BAR_M / 2));
    if (!owns(c, mid)) continue;
    if (stripe(c, p, q, width, PAINT.white) > 0) bars++;
  }
  return bars;
}

/** 횡단 선 하나 → 막대들(이 셀 소유분). 반환 = 막대 수. */
export function addCrosswalk(c: MarkCtx, r: OsmRecord): number {
  const xz = r.rings[0] ?? [];
  const width = crosswalkWidth(r);
  let n = 0;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    n += addSegment(c, [xz[i] as number, xz[i + 1] as number], [xz[i + 2] as number, xz[i + 3] as number], width);
  }
  return n;
}

/** 정지선 배치용: 횡단 띠(선분 + 반폭). */
export interface CrossBand {
  a: V2;
  b: V2;
  half: number;
  signal: boolean;
}

export function crossBands(records: readonly OsmRecord[]): CrossBand[] {
  const out: CrossBand[] = [];
  for (const r of records) {
    if (!isMarkedCrossing(r)) continue;
    const xz = r.rings[0] ?? [];
    const half = crosswalkWidth(r) / 2;
    for (let i = 0; i + 3 < xz.length; i += 2)
      out.push({
        a: [xz[i] as number, xz[i + 1] as number],
        b: [xz[i + 2] as number, xz[i + 3] as number],
        half,
        signal: r.tags.crossing === 'traffic_signals',
      });
  }
  return out;
}

/** 점과 띠 중심선 거리(m). */
export function bandDist(band: CrossBand, p: V2): number {
  const d = sub(band.b, band.a);
  const len2 = d[0] * d[0] + d[1] * d[1];
  const t = len2 > 0 ? Math.min(Math.max(((p[0] - band.a[0]) * d[0] + (p[1] - band.a[1]) * d[1]) / len2, 0), 1) : 0;
  return Math.hypot(p[0] - (band.a[0] + d[0] * t), p[1] - (band.a[1] + d[1] * t));
}
