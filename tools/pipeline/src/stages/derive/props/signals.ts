// 신호기(M05-T03): 신호 횡단(OSM crossing=traffic_signals) 선 양끝(보도) = 보행 신호(건너편을 봄), 횡단 선 × 차도 선 교차마다
// 진행 방향 d의 왼쪽 차도 끝 너머 0.8 m(보도) = 차량 신호(정면 = 다가오는 차, 팔은 차도 위로). 좌측통행. see ADR-0051
import { PROP_TYPE } from '@sanpo/tile-format';
import type { OsmRecord } from '../../normalize-osm.ts';
import { isMarkedCrossing } from '../markings/crosswalk.ts';
import { isVehicleRoad } from '../markings/stopline.ts';
import { type PlaceCtx, place, toRoadEdge, type V2, yawOf } from './context.ts';
import { behindCurb, siteTest } from './curb.ts';
import { signalCode } from './signal-sites.ts';

/** 교차부 탐색 거리(m). */
const SEEK_M = 25;

function segHit(a: V2, b: V2, c: V2, d: V2): V2 | undefined {
  const r: V2 = [b[0] - a[0], b[1] - a[1]];
  const s: V2 = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return undefined;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : undefined;
}

const unit = (v: V2): V2 => {
  const l = Math.hypot(v[0], v[1]);
  return l > 0 ? [v[0] / l, v[1] / l] : [0, 0];
};

/** 횡단 끝 p에서 바깥 u로 차도를 벗어난 첫 점(≤ 4 m) + backM. 벗어나지 못하면 undefined. */
function pedestrianSpot(c: PlaceCtx, p: V2, u: V2): V2 | undefined {
  const back = Number(c.catalog.types.signalPedestrian.place?.backM ?? 0.6);
  for (let s = 0; s <= 4; s += 0.25) {
    if (c.roads.classify(p[0] + u[0] * s, p[1] + u[1] * s) === 'road') continue;
    const at: V2 = [p[0] + u[0] * (s + back), p[1] + u[1] * (s + back)];
    return c.roads.classify(at[0], at[1]) === 'road' ? undefined : behindCurb(siteTest(c), at);
  }
  return undefined;
}

/** 교차부(1020)가 x에서 방향 v로 SEEK_M 안에 있나. */
function intersectionAlong(c: PlaceCtx, x: V2, v: V2): boolean {
  for (let s = 3; s <= SEEK_M; s += 1) if (c.inIntersection(x[0] + v[0] * s, x[1] + v[1] * s)) return true;
  return false;
}

/**
 * 차량 신호 1개: 교차점 x에서 진행 방향 d의 왼쪽 차도 끝 너머(보도). 일본식 = 교차로 건너편 — 상류에 교차부가 있으면(건너온 쪽) 놓고,
 * 하류에만 있으면(정지선 쪽) 건너뛰고, 둘 다 없으면(단일로 신호 횡단) 놓는다.
 */
/** 같은 종류 신호가 0.5 m 안에 이미 있나(셀 출력) — 양방향 선·겹친 횡단 선이 같은 자리에 두 번 놓던 것(M05 알려진 문제). */
function occupied(c: PlaceCtx, type: 'signalVehicle' | 'signalPedestrian', p: V2): boolean {
  const list = c.out.get(PROP_TYPE[type]) ?? [];
  for (let i = 0; i + 4 < list.length; i += 5)
    if (Math.hypot((list[i] as number) + c.ox - p[0], (list[i + 2] as number) + c.oz - p[1]) < 0.5) return true;
  return false;
}

function vehicleSignal(c: PlaceCtx, x: V2, d: V2): boolean {
  const code = c.signalSite
    ? signalCode(c.signalSite(x, { center: x, axis: Math.atan2(d[1], d[0]) }), 'vehicle', d[0], d[1])
    : 1;
  if (!intersectionAlong(c, x, [-d[0], -d[1]]) && intersectionAlong(c, x, d)) return false;
  const left: V2 = [d[1], -d[0]];
  const e = toRoadEdge(c, x, left);
  const back = Number(c.catalog.types.signalVehicle.place?.backM ?? 0.8);
  // 연석 뒤(모퉁이에서 다른 차도에 붙으면 민다 — M07 사전 ⓪ validate curbTight).
  const p = behindCurb(siteTest(c), [x[0] + left[0] * (e + back), x[1] + left[1] * (e + back)]);
  if (c.roads.classify(p[0], p[1]) === 'road' || c.inIntersection(p[0], p[1]) || occupied(c, 'signalVehicle', p))
    return false;
  return place(c, 'signalVehicle', p, yawOf([-d[0], -d[1]]), 1, undefined, code);
}

export function placeSignals(c: PlaceCtx, osm: readonly OsmRecord[]): number {
  let n = 0;
  const roads = osm.filter(isVehicleRoad);
  for (const r of osm) {
    if (!isMarkedCrossing(r) || r.tags.crossing !== 'traffic_signals') continue;
    const xz = r.rings[0] ?? [];
    const pts: V2[] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) pts.push([xz[i] as number, xz[i + 1] as number]);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (!first || !last) continue;
    // 보행 신호: 양끝(차도 위면 선 연장으로 차도를 벗어난 곳 + backM)에서 건너편을 본다.
    for (const [p, q] of [
      [first, last],
      [last, first],
    ] as const) {
      const at = pedestrianSpot(c, p, unit([p[0] - q[0], p[1] - q[1]]));
      if (!at || occupied(c, 'signalPedestrian', at)) continue;
      const w = unit([q[0] - at[0], q[1] - at[1]]);
      const mid: V2 = [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
      const code = c.signalSite
        ? signalCode(c.signalSite(mid, { center: mid, axis: Math.atan2(w[0], -w[1]) }), 'pedestrian', w[0], w[1])
        : 1;
      if (place(c, 'signalPedestrian', at, yawOf(w), 1, undefined, code)) n++;
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      for (const road of roads) {
        const rx = road.rings[0] ?? [];
        for (let k = 0; k + 3 < rx.length; k += 2) {
          const a: V2 = [rx[k] as number, rx[k + 1] as number];
          const b: V2 = [rx[k + 2] as number, rx[k + 3] as number];
          const x = segHit(pts[i] as V2, pts[i + 1] as V2, a, b);
          if (!x) continue;
          const d = unit([b[0] - a[0], b[1] - a[1]]);
          if (vehicleSignal(c, x, d)) n++;
          const oneway = road.tags.oneway === 'yes' || road.tags.oneway === '1';
          if (!oneway && vehicleSignal(c, x, [-d[0], -d[1]])) n++;
        }
      }
    }
  }
  return n;
}
