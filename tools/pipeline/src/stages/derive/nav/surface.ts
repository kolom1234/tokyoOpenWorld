// 보행면 분류(M06-T03, ADR-0063): 셀 창 0.5 m 표본마다 Detour area — 보도·교통섬(PLATEAU) = sidewalk, 횡단 띠 안 차도 = crossing,
// 생활도로(가까운 OSM 도로가 간선 아님) 차도 = street(보차 공용), 도로 밖 = 보행로(OSM footway·path·steps 띠, 보행 광장·공원 면 — 숲 제외)만 open.
// 건물 발자국·소품·나무 줄기 = 없음(0). 간선 차도는 횡단보도로만 건넌다(10 §4.2). see docs/04-data-pipeline.md §4.3, docs/10-simulation.md §4
import { NAV_AREA } from '@sanpo/tile-format';
import type { RoadRecord } from '../../../readers/plateau/types.ts';
import type { OsmRecord } from '../../normalize-osm.ts';
import type { FootprintSource } from '../footprints.ts';
import { isWalk } from '../roads.ts';
import { bandRing, fillDisc, fillPolyline, type SampleGrid, sampleX, sampleZ, scanFill } from './raster.ts';

/** 표본 간격(m)·창 여유(m — Recast 타일 테두리 ≥ 1 m를 덮게). */
export const NAV_STEP_M = 0.5;
export const NAV_PAD_M = 2;

const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const MINOR = new Set(['unclassified', 'residential', 'service', 'living_street', 'pedestrian', 'road', 'track']);
const PED_LINES = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway']);
const OPEN_LEISURE = new Set(['park', 'garden', 'playground']);
/** 차도 표본의 도로 분류를 찾는 반경(m) — 이 안에 OSM 도로가 없으면 걷지 않음. */
const CLASS_REACH_M = 15;
/** 간선 중심선에서 이 거리 안 차도는 생활도로여도 걷지 않음(간선 교차로에 들어가는 골목 선 — 스크램블 안 띠 실측). */
const MAJOR_CLEAR_M = 10;
/** 횡단 띠 끝 연장(m). */
const CROSS_EXTEND_M = 1.5;
/** 車道交差部(1020) 안이면 간선이 이 거리 안에 있을 때 걷지 않음. */
const JUNCTION_MAJOR_M = 25;
const BUCKET_M = 16;

export interface NavCrossingBand {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  half: number;
}

export interface NavSurfaceInput {
  ox: number;
  oz: number;
  /** 셀 + 8-이웃 PLATEAU 도로 조각. */
  roads: readonly RoadRecord[];
  /** 셀 + 8-이웃 건물 발자국. */
  footprints: readonly FootprintSource[];
  /** 셀 OSM(선·면) + 이웃 차도 선. */
  osm: readonly OsmRecord[];
  crossings: readonly NavCrossingBand[];
  /** 막는 원(WF 중심·반경 — 원기둥 소품·나무 줄기 + 여유)·다각형(xz 링 — 상자 소품). */
  obstacles: readonly { x: number; z: number; r: number }[];
  obstacleRings: readonly (readonly number[])[];
}

export function navGrid(ox: number, oz: number): SampleGrid {
  return {
    x0: ox - NAV_PAD_M,
    z0: oz - NAV_PAD_M,
    step: NAV_STEP_M,
    n: Math.round((256 + 2 * NAV_PAD_M) / NAV_STEP_M),
  };
}

const surfaceLine = (r: OsmRecord): boolean =>
  r.geom === 'line' && r.tags.tunnel === undefined && r.tags.bridge === undefined && (r.tags.layer ?? '0') === '0';

/** 도로 선분 색인: 점 → 가장 가까운 선분의 간선 여부(반경 안 없으면 undefined). */
function roadClassIndex(osm: readonly OsmRecord[]) {
  const segs: { ax: number; az: number; bx: number; bz: number; major: boolean }[] = [];
  const buckets = new Map<number, number[]>();
  const key = (bx: number, bz: number) => bx * 100003 + bz;
  for (const r of osm) {
    const hw = (r.tags.highway ?? '').replace(/_link$/, '');
    if (!surfaceLine(r) || !(MAJOR.has(hw) || MINOR.has(hw))) continue;
    const xz = r.rings[0] ?? [];
    for (let p = 0; p + 3 < xz.length; p += 2) {
      const s = {
        ax: xz[p] as number,
        az: xz[p + 1] as number,
        bx: xz[p + 2] as number,
        bz: xz[p + 3] as number,
        major: MAJOR.has(hw),
      };
      const id = segs.push(s) - 1;
      const [x0, x1] = [Math.min(s.ax, s.bx), Math.max(s.ax, s.bx)];
      const [z0, z1] = [Math.min(s.az, s.bz), Math.max(s.az, s.bz)];
      for (let bz = Math.floor(z0 / BUCKET_M); bz <= Math.floor(z1 / BUCKET_M); bz++)
        for (let bx = Math.floor(x0 / BUCKET_M); bx <= Math.floor(x1 / BUCKET_M); bx++) {
          const list = buckets.get(key(bx, bz));
          if (list) list.push(id);
          else buckets.set(key(bx, bz), [id]);
        }
    }
  }
  /** 가장 가까운 도로가 생활도로인가 + 가장 가까운 간선 거리. */
  return (x: number, z: number): { minor: boolean; majorDist: number } => {
    let best = CLASS_REACH_M;
    let major: boolean | undefined;
    let majorDist = Number.POSITIVE_INFINITY;
    const bx = Math.floor(x / BUCKET_M);
    const bz = Math.floor(z / BUCKET_M);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        for (const id of buckets.get(key(bx + dx, bz + dz)) ?? []) {
          const s = segs[id] as (typeof segs)[number];
          const ux = s.bx - s.ax;
          const uz = s.bz - s.az;
          const L2 = ux * ux + uz * uz || 1;
          const t = Math.min(Math.max(((x - s.ax) * ux + (z - s.az) * uz) / L2, 0), 1);
          const d = Math.hypot(x - s.ax - ux * t, z - s.az - uz * t);
          if (s.major) majorDist = Math.min(majorDist, d);
          if (d < best) {
            best = d;
            major = s.major;
          }
        }
    return { minor: major === false, majorDist };
  };
}

/** 도로 밖 보행 허용 마스크: OSM 보행 선 띠 + 보행 광장·공원 면 − 숲. */
function openMask(osm: readonly OsmRecord[], g: SampleGrid): Uint8Array {
  const m = new Uint8Array(g.n * g.n);
  const set = (k: number) => {
    m[k] = 1;
  };
  for (const r of osm) {
    if (r.geom === 'polygon' && (r.tags.highway === 'pedestrian' || OPEN_LEISURE.has(r.tags.leisure ?? '')))
      scanFill(r.rings, 2, g, set);
  }
  for (const r of osm) {
    if (r.geom !== 'polygon' || !(r.tags.natural === 'wood' || r.tags.landuse === 'forest')) continue;
    scanFill(r.rings, 2, g, (k) => {
      m[k] = 0;
    });
  }
  for (const r of osm) {
    if (!surfaceLine(r) || !PED_LINES.has(r.tags.highway ?? '')) continue;
    const w = Number.parseFloat(r.tags.width ?? '');
    const half = Number.isFinite(w) ? Math.min(Math.max(w / 2, 1), 4) : 1.5;
    fillPolyline(r.rings[0] ?? [], half, g, set);
  }
  return m;
}

/** 보차 공용 생활도로: 가장 가까운 도로가 생활도로이고 간선에서 충분히 떨어짐(교차부 안이면 더). */
const sharedStreet = (c: { minor: boolean; majorDist: number }, inJunction: boolean): boolean =>
  c.minor && c.majorDist > MAJOR_CLEAR_M && !(inJunction && c.majorDist <= JUNCTION_MAJOR_M);

/** 표본별 area(NAV_AREA 또는 0). 반환 격자 = navGrid(ox, oz). */
export function navAreas(i: NavSurfaceInput): { grid: SampleGrid; area: Uint8Array } {
  const g = navGrid(i.ox, i.oz);
  const N = g.n * g.n;
  // 0 = 도로 밖, 1 = 차도, 2 = 보행(보행 우선 — roadIndex.classify와 같은 규칙).
  const side = new Uint8Array(N);
  for (const r of i.roads) if (!isWalk(r)) scanFill(r.polygonWF, 3, g, (k) => (side[k] = 1));
  for (const r of i.roads) if (isWalk(r)) scanFill(r.polygonWF, 3, g, (k) => (side[k] = 2));
  const blocked = new Uint8Array(N);
  for (const f of i.footprints) for (const rings of f.ground) scanFill(rings, 3, g, (k) => (blocked[k] = 1));
  for (const o of i.obstacles) fillDisc(o.x, o.z, o.r, g, (k) => (blocked[k] = 1));
  for (const r of i.obstacleRings) scanFill([r], 2, g, (k) => (blocked[k] = 1));
  const junction = new Uint8Array(N);
  for (const r of i.roads)
    if (r.functionCode === 'TrafficArea:1020') scanFill(r.polygonWF, 3, g, (k) => (junction[k] = 1));
  const cross = new Uint8Array(N);
  for (const c of i.crossings) {
    // 끝을 CROSS_EXTEND_M씩 늘려 칠한다: OSM 횡단 선이 연석 앞에서 끝나면 띠와 보도 사이 차도 띠가 막혀 좁은 틈으로만 이어졌다(보도 표본이 우선이라 보도는 그대로).
    const L = Math.hypot(c.bx - c.ax, c.bz - c.az) || 1;
    const ex = ((c.bx - c.ax) / L) * CROSS_EXTEND_M;
    const ez = ((c.bz - c.az) / L) * CROSS_EXTEND_M;
    scanFill([bandRing(c.ax - ex, c.az - ez, c.bx + ex, c.bz + ez, c.half)], 2, g, (k) => (cross[k] = 1));
  }
  const open = openMask(i.osm, g);
  const roadClass = roadClassIndex(i.osm);
  const area = new Uint8Array(N);
  for (let j = 0; j < g.n; j++)
    for (let k = j * g.n, ii = 0; ii < g.n; ii++, k++) {
      if (blocked[k]) continue;
      const s = side[k];
      if (s === 2) area[k] = NAV_AREA.sidewalk;
      else if (cross[k]) area[k] = NAV_AREA.crossing;
      else if (s === 1)
        area[k] = sharedStreet(roadClass(sampleX(g, ii), sampleZ(g, j)), junction[k] === 1) ? NAV_AREA.street : 0;
      else if (open[k]) area[k] = NAV_AREA.open;
    }
  return { grid: g, area };
}
