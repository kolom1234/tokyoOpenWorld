// 가로수(M05-T04): OSM 나무 점(차도 위면 3 m 안 보도로 — 못 찾아도 차도 중심선 3.5 m 밖이면 그대로(LOD1 도로 구역), 수종 = 태그 → 가까운 차도 선의 가로수 수종 → 공원 혼합)·가로수열(tree_row, 8 m 간격)
// + 규칙 가로수: 간선(trunk·primary·secondary·tertiary) 양쪽 보도(폭 ≥ 2.5 m) 차도 끝 + 1 m, 10 m 간격(선 id 시드) — 교차부 ± 6 m·횡단 띠 + 4 m·
// OSM 나무 5 m·소품 1.5 m 안은 생략. see ADR-0052
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import type { OsmRecord } from '../../normalize-osm.ts';
import { bandDist, type CrossBand } from '../markings/crosswalk.ts';
import { isVehicleRoad } from '../markings/stopline.ts';
import { toRoadEdge } from '../props/context.ts';
import { walkLine } from '../props/linear.ts';
import { nearBuilding, nearProp, plant, type TreeCtx, type V2 } from './place.ts';
import { parkSpecies, speciesFromTags, streetSpecies } from './species.ts';

const RULE_ROADS = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
const RULE_SPACING_M = 10;
const ROW_SPACING_M = 8;
const NEAR_ROAD_M = 25;
const OSM_CLEAR_M = 5;

/** 가장 가까운 차도 선(NEAR_ROAD_M 안)과 거리. */
function nearestRoad(p: V2, roads: readonly OsmRecord[]): { r: OsmRecord; d: number } | undefined {
  let best: { r: OsmRecord; d: number } | undefined;
  for (const r of roads) {
    const xz = r.rings[0] ?? [];
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const [ax, az, bx, bz] = [xz[i] as number, xz[i + 1] as number, xz[i + 2] as number, xz[i + 3] as number];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const t = L2 > 0 ? Math.min(Math.max(((p[0] - ax) * (bx - ax) + (p[1] - az) * (bz - az)) / L2, 0), 1) : 0;
      const d = Math.hypot(p[0] - (ax + (bx - ax) * t), p[1] - (az + (bz - az) * t));
      if (d < NEAR_ROAD_M && (!best || d < best.d)) best = { r, d };
    }
  }
  return best;
}

/** 차도 중심선에서 이만큼 떨어진 OSM 나무는 PLATEAU가 차도(LOD1 도로 = 보도 포함 전체 폭)라 해도 그대로 둔다. */
const OSM_CENTER_CLEAR_M = 3.5;

/** 차도 위면 가장 가까운 비차도(≤ 3 m), 없으면 undefined. */
function offRoad(c: TreeCtx, p: V2): V2 | undefined {
  if (c.roads.classify(p[0], p[1]) !== 'road') return p;
  for (let d = 0.5; d <= 3; d += 0.5)
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI;
      const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
      if (c.roads.classify(q[0], q[1]) !== 'road') return q;
    }
  return undefined;
}

function speciesAt(r: OsmRecord, p: V2, vehicle: readonly OsmRecord[], u: number) {
  const tagged = speciesFromTags(r.tags);
  if (tagged) return tagged;
  const road = nearestRoad(p, vehicle)?.r;
  return road ? streetSpecies(road.tags.name, road.id) : parkSpecies(u);
}

/** OSM 나무 점 + 가로수열. 반환 = 놓은 위치(WF, 규칙 가로수 중복 방지용). */
export function plantOsmTrees(c: TreeCtx, osm: readonly OsmRecord[]): V2[] {
  const vehicle = osm.filter(isVehicleRoad);
  const placed: V2[] = [];
  const one = (r: OsmRecord, p0: V2, i: number): void => {
    const rng = createRng(hash32(WORLD_SEED, 'trees', 'osm', r.id, i));
    const near = nearestRoad(p0, vehicle);
    const p = offRoad(c, p0) ?? (!near || near.d >= OSM_CENTER_CLEAR_M ? p0 : undefined);
    if (!p || nearBuilding(c, p)) return;
    placed.push(p);
    plant(c, speciesAt(r, p, vehicle, rng.next()), p, rng.next(), rng.next() * 256, r.tags.height);
  };
  for (const r of osm) {
    const xz = r.rings[0] ?? [];
    if (r.geom === 'point' && r.tags.natural === 'tree') one(r, [xz[0] as number, xz[1] as number], 0);
    else if (r.geom === 'line' && r.tags.natural === 'tree_row') {
      let i = 0;
      walkLine(
        xz,
        ROW_SPACING_M / 2,
        () => ROW_SPACING_M,
        (p) => one(r, p, i++),
      );
    }
  }
  return placed;
}

function ruleSpotOk(c: TreeCtx, q: V2, d: V2, bands: readonly CrossBand[], mapped: readonly V2[]): boolean {
  for (const s of [-6, 0, 6]) if (c.inIntersection(q[0] + d[0] * s, q[1] + d[1] * s)) return false;
  if (bands.some((b) => bandDist(b, q) < b.half + 4)) return false;
  if (mapped.some((m) => Math.hypot(m[0] - q[0], m[1] - q[1]) < OSM_CLEAR_M)) return false;
  return !nearProp(c, q) && !nearBuilding(c, q);
}

/** 규칙 가로수(간선 양쪽 보도). 반환 = 심은 수. */
export function plantStreetRule(
  c: TreeCtx,
  osm: readonly OsmRecord[],
  bands: readonly CrossBand[],
  mapped: readonly V2[],
): number {
  let n = 0;
  for (const r of osm) {
    if (r.geom !== 'line' || !RULE_ROADS.has(r.tags.highway ?? '') || r.tags.bridge || r.tags.tunnel) continue;
    const species = streetSpecies(r.tags.name, r.id);
    const rng = createRng(hash32(WORLD_SEED, 'trees', 'rule', r.id));
    walkLine(
      r.rings[0] ?? [],
      rng.next() * RULE_SPACING_M,
      () => RULE_SPACING_M,
      (p, d) => {
        const u = rng.next();
        const seed = rng.next() * 256;
        if (c.roads.classify(p[0], p[1]) !== 'road') return;
        for (const out of [
          [d[1], -d[0]],
          [-d[1], d[0]],
        ] as V2[]) {
          const e = toRoadEdge(c, p, out);
          const q: V2 = [p[0] + out[0] * (e + 1), p[1] + out[1] * (e + 1)];
          const far: V2 = [p[0] + out[0] * (e + 2.4), p[1] + out[1] * (e + 2.4)];
          if (c.roads.classify(q[0], q[1]) !== 'walk' || c.roads.classify(far[0], far[1]) !== 'walk') continue;
          if (ruleSpotOk(c, q, d, bands, mapped) && plant(c, species, q, u, seed, undefined, 0.85)) n++;
        }
      },
    );
  }
  return n;
}
