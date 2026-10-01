// 녹지 면 채우기(M05-T04): 월드 정렬 격자(종류별 간격) 점마다 결정론 흔들기·확률 → 그 종류 면 안(구멍 제외)·도로/보도 밖·건물 1 m 밖·OSM 길(참도 등) 밖이면 심는다.
// 숲(forest·wood) 6.5 m·90 %(숲 혼합 — 수관이 닫히게), 공원 12 m·40 %(잔디밭이면 20 %로, 공원 혼합), 정원 9 m·40 %, 관목(scrub) 3.5 m·50 %(관목).
// 격자 점 번호(전역 i, j)로 시드 → 어느 셀에서 계산해도 같다(소유 = 점이 속한 셀). see ADR-0052
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import type { OsmRecord } from '../../normalize-osm.ts';
import { type GreenKind, greenKind } from '../vegetation.ts';
import { nearBuilding, plant, type TreeCtx, type V2 } from './place.ts';
import { forestSpecies, parkSpecies } from './species.ts';

interface Area {
  kind: GreenKind;
  rings: number[][];
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const LATTICE: readonly { kind: GreenKind; spacing: number; p: number }[] = [
  { kind: 'forest', spacing: 6.5, p: 0.9 },
  { kind: 'park', spacing: 12, p: 0.4 },
  { kind: 'garden', spacing: 9, p: 0.4 },
  { kind: 'scrub', spacing: 3.5, p: 0.5 },
];
/** 공원 안 잔디밭(grass 면)에서의 확률 배수. */
const LAWN_FACTOR = 0.5;
/** OSM 보행·서비스 길 반폭(m, `width` 태그가 있으면 그 절반) — 줄기는 길 가장자리 + PATH_CLEAR_M 밖(M05-T05 참도가 숲 격자에 덮이던 문제). */
const PATH_HALF_M: Readonly<Record<string, number>> = {
  pedestrian: 3,
  footway: 1.2,
  path: 1,
  cycleway: 1,
  bridleway: 1,
  steps: 1,
  track: 1.5,
  service: 2.5,
};
const PATH_CLEAR_M = 1;

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

function pathSegments(osm: readonly OsmRecord[]): Seg[] {
  const out: Seg[] = [];
  for (const o of osm) {
    const half = o.geom === 'line' ? PATH_HALF_M[o.tags.highway ?? ''] : undefined;
    if (half === undefined) continue;
    const w = Number.parseFloat(o.tags.width ?? '');
    const r = (Number.isFinite(w) && w > 0 ? w / 2 : half) + PATH_CLEAR_M;
    for (const l of o.rings)
      for (let i = 0; i + 3 < l.length; i += 2)
        out.push({ ax: l[i] as number, az: l[i + 1] as number, bx: l[i + 2] as number, bz: l[i + 3] as number, r });
  }
  return out;
}

function onPath(segs: readonly Seg[], x: number, z: number): boolean {
  for (const s of segs) {
    const [dx, dz] = [s.bx - s.ax, s.bz - s.az];
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - s.ax) * dx + (z - s.az) * dz) / l2)) : 0;
    if (Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) < s.r) return true;
  }
  return false;
}

function areasOf(osm: readonly OsmRecord[]): Area[] {
  const out: Area[] = [];
  for (const r of osm) {
    const kind = greenKind(r);
    const o = r.rings[0];
    if (!kind || !o) continue;
    let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i + 1 < o.length; i += 2) {
      x0 = Math.min(x0, o[i] as number);
      x1 = Math.max(x1, o[i] as number);
      z0 = Math.min(z0, o[i + 1] as number);
      z1 = Math.max(z1, o[i + 1] as number);
    }
    out.push({ kind, rings: r.rings, x0, x1, z0, z1 });
  }
  return out;
}

/** xz 쌍 링들(짝-홀, 구멍 포함). */
function inside(a: Area, x: number, z: number): boolean {
  if (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1) return false;
  let hit = false;
  for (const r of a.rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, zi, xj, zj] = [r[i * 2] as number, r[i * 2 + 1] as number, r[j * 2] as number, r[j * 2 + 1] as number];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** 이 점이 속한 가장 우선인 녹지 종류(숲 > 관목 > 잔디 > 정원 > 공원). */
function kindAt(areas: readonly Area[], x: number, z: number): { kind: GreenKind | undefined; lawn: boolean } {
  const ks = new Set(areas.filter((a) => inside(a, x, z)).map((a) => a.kind));
  const order: GreenKind[] = ['forest', 'scrub', 'grass', 'garden', 'park'];
  return { kind: order.find((k) => ks.has(k)), lawn: ks.has('grass') };
}

/** 녹지 면 채우기. 반환 = 심은 수. */
export function fillGreens(c: TreeCtx, osm: readonly OsmRecord[]): number {
  const areas = areasOf(osm);
  if (areas.length === 0) return 0;
  const paths = pathSegments(osm);
  let n = 0;
  for (const { kind, spacing, p } of LATTICE) {
    const i0 = Math.floor(c.ox / spacing);
    const j0 = Math.floor(c.oz / spacing);
    const i1 = Math.ceil((c.ox + 256) / spacing);
    const j1 = Math.ceil((c.oz + 256) / spacing);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const rng = createRng(hash32(WORLD_SEED, 'trees', 'fill', kind, i, j));
        const q: V2 = [(i + 0.15 + rng.next() * 0.7) * spacing, (j + 0.15 + rng.next() * 0.7) * spacing];
        const roll = rng.next();
        if (q[0] < c.ox || q[0] >= c.ox + 256 || q[1] < c.oz || q[1] >= c.oz + 256) continue;
        const at = kindAt(areas, q[0], q[1]);
        // 공원 격자는 잔디 면에서도 쓴다(grass 면 자체는 나무를 심지 않는다 — 공원 안 잔디밭이면 확률만 낮춤).
        const k = at.kind === 'grass' ? 'park' : at.kind;
        if (k !== kind || roll >= p * (kind === 'park' && at.lawn ? LAWN_FACTOR : 1)) continue;
        if (c.roads.classify(q[0], q[1]) !== 'none' || nearBuilding(c, q) || onPath(paths, q[0], q[1])) continue;
        const species =
          kind === 'scrub' ? 'shrub' : kind === 'forest' ? forestSpecies(rng.next()) : parkSpecies(rng.next());
        if (plant(c, species, q, rng.next(), rng.next() * 256)) n++;
      }
  }
  return n;
}
