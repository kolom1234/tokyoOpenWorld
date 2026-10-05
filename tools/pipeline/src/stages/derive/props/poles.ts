// 전신주·전선(M05-T03): 좁은 생활도로(residential·unclassified·living_street·tertiary, 차도 폭 < 15 m) 선을 따라 30–40 m 간격 정거장,
// 한쪽(선마다 결정론) 차도 끝 — 보도가 있으면 보도 위(끝 + 0.6 m), 없으면 차도 안쪽 0.35 m(일본 생활도로). 정거장 열은 선 id 시드라
// 어느 셀에서 계산해도 같다(셀 경계를 넘는 전선의 양끝이 맞음) — ADR-0051(규칙 10의 예외: 선 단위 시드). 전선 = 이웃 전주 사이 3가닥 포물선
// 처짐(카테너리 근사), 시작 전주를 가진 셀이 낸다. OSM power=pole 점은 12 m 안에 규칙 전주가 없을 때만 단독 전주(전선 없음).
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import type { OsmRecord } from '../../normalize-osm.ts';
import { type PlaceCtx, place, toRoadEdge, type V2, yawOf } from './context.ts';
import { behindCurb, siteTest } from './curb.ts';

const POLE_ROADS = new Set(['residential', 'unclassified', 'living_street', 'tertiary']);
const MIN_EDGE_M = 1.5;
const WALK_BACK_M = 0.6;
const OSM_POLE_CLEAR_M = 12;

export interface PoleParams {
  spacingM: [number, number];
  maxRoadWidthM: number;
  offsetM: number;
  wireHeightsM: number[];
  /** 전선별 가로 위치(m, 전주 중심에서 차도 쪽 +). */
  wireLateralM: number[];
  wireSagM: number;
}

export interface Pole {
  p: V2;
  /** 차도 쪽 단위 벡터. */
  toRoad: V2;
}

/** 전선 한 경간(WF xz + 셀 로컬 높이는 조립에서). */
export interface WireSpan {
  a: V2;
  b: V2;
  ha: number;
  hb: number;
  sag: number;
}

export function isPoleRoad(r: OsmRecord): boolean {
  return (
    r.geom === 'line' &&
    POLE_ROADS.has(r.tags.highway ?? '') &&
    r.tags.bridge === undefined &&
    r.tags.tunnel === undefined
  );
}

export function poleParams(c: PlaceCtx): PoleParams {
  return c.catalog.types.utilityPole.place as unknown as PoleParams;
}

/** 선 → 정거장(선 id 시드, 셀 무관). 반환 = 점·진행 방향, 그리고 전주 쪽(+1 왼쪽/−1 오른쪽). */
export function poleStations(
  r: OsmRecord,
  spacing: readonly [number, number],
): { side: 1 | -1; at: { p: V2; d: V2 }[] } {
  const rng = createRng(hash32(WORLD_SEED, 'props', 'pole', r.id));
  const side: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
  const xz = r.rings[0] ?? [];
  const at: { p: V2; d: V2 }[] = [];
  let next = rng.next() * spacing[0];
  let s0 = 0;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    const a: V2 = [xz[i] as number, xz[i + 1] as number];
    const v: V2 = [(xz[i + 2] as number) - a[0], (xz[i + 3] as number) - a[1]];
    const L = Math.hypot(v[0], v[1]);
    if (L < 1e-6) continue;
    const d: V2 = [v[0] / L, v[1] / L];
    while (next <= s0 + L) {
      const t = next - s0;
      at.push({ p: [a[0] + d[0] * t, a[1] + d[1] * t], d });
      next += spacing[0] + rng.next() * (spacing[1] - spacing[0]);
    }
    s0 += L;
  }
  return { side, at };
}

/** 정거장 → 전주 자리(없으면 undefined). 셀 소유와 무관(이웃 셀 전주 위치 계산에도 씀). */
export function poleAt(c: PlaceCtx, st: { p: V2; d: V2 }, side: 1 | -1, k: PoleParams): Pole | undefined {
  const { p, d } = st;
  if (c.roads.classify(p[0], p[1]) !== 'road' || c.inIntersection(p[0], p[1])) return undefined;
  const out: V2 = side === 1 ? [d[1], -d[0]] : [-d[1], d[0]];
  const e = toRoadEdge(c, p, out);
  const eo = toRoadEdge(c, p, [-out[0], -out[1]]);
  if (e < MIN_EDGE_M || e + eo >= k.maxRoadWidthM) return undefined;
  const walkAt: V2 = [p[0] + out[0] * (e + WALK_BACK_M), p[1] + out[1] * (e + WALK_BACK_M)];
  const pos: V2 =
    c.roads.classify(walkAt[0], walkAt[1]) === 'walk'
      ? behindCurb(siteTest(c), walkAt)
      : [p[0] + out[0] * (e - k.offsetM), p[1] + out[1] * (e - k.offsetM)];
  return { p: pos, toRoad: [-out[0], -out[1]] };
}

export function wireSpans(prev: Pole, cur: Pole, k: PoleParams): WireSpan[] {
  const spans: WireSpan[] = [];
  k.wireHeightsM.forEach((h, i) => {
    const o = k.wireLateralM[i] ?? 0;
    spans.push({
      a: [prev.p[0] + prev.toRoad[0] * o, prev.p[1] + prev.toRoad[1] * o],
      b: [cur.p[0] + cur.toRoad[0] * o, cur.p[1] + cur.toRoad[1] * o],
      ha: h,
      hb: h,
      sag: k.wireSagM,
    });
  });
  return spans;
}

export function placePoles(c: PlaceCtx, osm: readonly OsmRecord[]): { poles: number; spans: WireSpan[] } {
  const k = poleParams(c);
  const spans: WireSpan[] = [];
  const all: V2[] = [];
  let poles = 0;
  for (const r of osm) {
    if (!isPoleRoad(r)) continue;
    const { side, at } = poleStations(r, k.spacingM);
    let prev: Pole | undefined;
    for (const st of at) {
      const cur = poleAt(c, st, side, k);
      if (cur) all.push(cur.p);
      if (cur && place(c, 'utilityPole', cur.p, yawOf(cur.toRoad))) poles++;
      // 전선: 시작 전주 소유 셀만(경간 ≤ 간격 최대 + 5 m).
      if (prev && cur && Math.hypot(cur.p[0] - prev.p[0], cur.p[1] - prev.p[1]) <= k.spacingM[1] + 5) {
        if (prev.p[0] >= c.ox && prev.p[0] < c.ox + 256 && prev.p[1] >= c.oz && prev.p[1] < c.oz + 256)
          spans.push(...wireSpans(prev, cur, k));
      }
      prev = cur;
    }
  }
  for (const r of osm) {
    const p0 = r.rings[0];
    if (r.geom !== 'point' || r.tags.power !== 'pole' || !p0) continue;
    const p: V2 = [p0[0] as number, p0[1] as number];
    if (all.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < OSM_POLE_CLEAR_M)) continue;
    if (c.roads.classify(p[0], p[1]) === 'road') continue;
    if (place(c, 'utilityPole', p, 0)) poles++;
  }
  return { poles, spans };
}
