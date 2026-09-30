// 선형 소품(M05-T03): 가드 파이프(간선 — trunk·primary·secondary, 선 따라 4 m 모듈, 양쪽 차도 끝 너머 보도 0.35 m, 횡단 띠·교차부 근처 끊김)와
// 맨홀(차도 선 25–45 m 간격, 차로 중심 근처). 정거장은 선 id 시드(poles.ts와 같은 이유 — 셀 무관). see ADR-0051
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import type { OsmRecord } from '../../normalize-osm.ts';
import { bandDist, type CrossBand } from '../markings/crosswalk.ts';
import { isVehicleRoad } from '../markings/stopline.ts';
import { type PlaceCtx, place, rngFor, toRoadEdge, type V2, yawOf } from './context.ts';

const RAIL_ROADS = new Set(['trunk', 'primary', 'secondary']);
/** 횡단 띠 반폭 너머 여유(m) — 보행자가 드나드는 틈. */
const RAIL_CROSS_GAP_M = 1.5;
/** 모듈 양끝 교차부 검사 거리(m). */
const RAIL_END_M = 2;

export function isRailRoad(r: OsmRecord): boolean {
  return (
    r.geom === 'line' &&
    RAIL_ROADS.has(r.tags.highway ?? '') &&
    r.tags.bridge === undefined &&
    r.tags.tunnel === undefined
  );
}

/** 선을 따라 일정(또는 난수) 간격 정거장 — next(): 다음 간격. */
function walkLine(xz: readonly number[], first: number, next: () => number, visit: (p: V2, d: V2) => void): void {
  let at = first;
  let s0 = 0;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    const a: V2 = [xz[i] as number, xz[i + 1] as number];
    const v: V2 = [(xz[i + 2] as number) - a[0], (xz[i + 3] as number) - a[1]];
    const L = Math.hypot(v[0], v[1]);
    if (L < 1e-6) continue;
    const d: V2 = [v[0] / L, v[1] / L];
    while (at <= s0 + L) {
      visit([a[0] + d[0] * (at - s0), a[1] + d[1] * (at - s0)], d);
      at += next();
    }
    s0 += L;
  }
}

function railOk(c: PlaceCtx, p: V2, d: V2, bands: readonly CrossBand[]): boolean {
  if (c.roads.classify(p[0], p[1]) !== 'walk') return false;
  for (const s of [-RAIL_END_M, 0, RAIL_END_M]) if (c.inIntersection(p[0] + d[0] * s, p[1] + d[1] * s)) return false;
  return !bands.some((b) => bandDist(b, p) < b.half + RAIL_CROSS_GAP_M + RAIL_END_M);
}

export function placeGuardRails(c: PlaceCtx, osm: readonly OsmRecord[], bands: readonly CrossBand[]): number {
  const k = c.catalog.types.guardRail.place as { moduleM: number; insetM: number };
  let n = 0;
  for (const r of osm) {
    if (!isRailRoad(r)) continue;
    walkLine(
      r.rings[0] ?? [],
      k.moduleM / 2,
      () => k.moduleM,
      (p, d) => {
        if (c.roads.classify(p[0], p[1]) !== 'road') return;
        for (const out of [
          [d[1], -d[0]],
          [-d[1], d[0]],
        ] as V2[]) {
          const e = toRoadEdge(c, p, out) + k.insetM;
          const q: V2 = [p[0] + out[0] * e, p[1] + out[1] * e];
          // 모듈 긴 축(로컬 X) = 진행 방향, 로컬 +Z = 차도 쪽.
          if (railOk(c, q, d, bands) && place(c, 'guardRail', q, yawOf([-out[0], -out[1]]))) n++;
        }
      },
    );
  }
  return n;
}

export function placeManholes(c: PlaceCtx, osm: readonly OsmRecord[]): number {
  const [lo, hi] = (c.catalog.types.manhole.place?.spacingM ?? [25, 45]) as [number, number];
  let n = 0;
  for (const r of osm) {
    if (!isVehicleRoad(r)) continue;
    const rng = createRng(hash32(WORLD_SEED, 'props', 'manhole', r.id));
    walkLine(
      r.rings[0] ?? [],
      rng.next() * lo,
      () => lo + rng.next() * (hi - lo),
      (p, d) => {
        const off = (rng.next() - 0.5) * 2;
        const q: V2 = [p[0] + d[1] * off, p[1] - d[0] * off];
        if (c.roads.classify(q[0], q[1]) !== 'road' || c.inIntersection(q[0], q[1])) return;
        const yaw = rngFor(c, 'manhole', `${r.id}:${Math.round(q[0])}:${Math.round(q[1])}`).next() * 2 * Math.PI;
        if (place(c, 'manhole', q, yaw)) n++;
      },
    );
  }
  return n;
}
