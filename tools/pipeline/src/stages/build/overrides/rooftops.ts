// 옥상 설비·외부 비상계단(M05-T07): 평평한 지붕(가장 큰 수평 지붕 면 ≥ 30 m²)마다 결정론(gmlId 시드)으로 — 실외기 무리·물탱크(받침)·塔屋(계단실)·
// 난간·안테나, 소형 건물(3–6층) 한쪽 벽에 지그재그 철골 비상계단. overrides.mesh 스트림(`_LMAT`)에 함께 낸다(인스턴스 예산·소품 LOD 거리와 무관 — 상공 조망에서도 보인다).
// PLATEAU LOD2가 이미 옥상 부속물(installation ≥ 6면)을 가진 건물은 설비를 더하지 않는다. 충돌 없음(사람이 오르지 않는 곳). see ADR-0055
import { createRng, hash32, type Rng, WORLD_SEED } from '@sanpo/core';
import type { Vec3Tuple } from '@sanpo/tile-format';
import { triangulateRings, type Vec3 } from '../../../lib/triangulate.ts';
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { box, cylinder, face, type LStream, placer, sweep } from './geom.ts';
import { plateauExtent } from './shell.ts';
import { LMAT } from './spec.ts';

export interface DetailStats {
  roofs: number;
  ac: number;
  tanks: number;
  towers: number;
  railings: number;
  stairs: number;
}

export const emptyDetailStats = (): DetailStats => ({ roofs: 0, ac: 0, tanks: 0, towers: 0, railings: 0, stairs: 0 });

type P2 = [number, number];

interface Roof {
  /** 셀 로컬 xz 링(닫힘 점 없음). */
  ring: P2[];
  y: number;
  area: number;
  /** 가장 긴 변 방향(yaw, geom.placer 규약). */
  yaw: number;
}

const RESIDENTIAL = new Set(['411', '412', '413', '414']);
const STAIR_USAGE = new Set(['401', '402', '411', '412', '413', '414']);

function ringArea(r: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [p, q] = [r[i] as P2, r[(i + 1) % r.length] as P2];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** 가장 큰 평평한 지붕 면(셀 로컬). */
function flatRoof(b: BuildingRecord, o: Vec3Tuple): Roof | undefined {
  let best: Roof | undefined;
  for (const s of b.surfaces) {
    const r = s.kind === 'roof' ? s.ringsWF[0] : undefined;
    if (!r || r.length < 9) continue;
    const t = triangulateRings([r]);
    if (!t || t.normal[1] < 0.97) continue;
    const ring: P2[] = [];
    let y = 0;
    for (let i = 0; i < r.length; i += 3) {
      ring.push([(r[i] as number) - o[0], (r[i + 2] as number) - o[2]]);
      y += r[i + 1] as number;
    }
    const area = ringArea(ring);
    if (area < 30 || (best && area <= best.area)) continue;
    let [L, yaw] = [0, 0];
    for (let i = 0; i < ring.length; i++) {
      const [p, q] = [ring[i] as P2, ring[(i + 1) % ring.length] as P2];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l > L) [L, yaw] = [l, Math.atan2(-(q[1] - p[1]), q[0] - p[0])];
    }
    best = { ring, y: y / (r.length / 3) - o[1], area, yaw };
  }
  return best;
}

function inside(r: readonly P2[], x: number, z: number): boolean {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [a, c] = [r[i] as P2, r[j] as P2];
    if (a[1] > z !== c[1] > z && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function edgeDist(r: readonly P2[], x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < r.length; i++) {
    const [a, c] = [r[i] as P2, r[(i + 1) % r.length] as P2];
    const [dx, dz] = [c[0] - a[0], c[1] - a[1]];
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return d;
}

/** 지붕 안 가장자리에서 margin 이상 떨어진 무작위 점(시도 40회), 이미 쓴 자리(taken: x, z, r)와 겹치지 않게. */
function spot(rng: Rng, roof: Roof, margin: number, taken: [number, number, number][]): P2 | undefined {
  const xs = roof.ring.map((p) => p[0]);
  const zs = roof.ring.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  for (let k = 0; k < 40; k++) {
    const x = x0 + rng.next() * (x1 - x0);
    const z = z0 + rng.next() * (z1 - z0);
    if (!inside(roof.ring, x, z) || edgeDist(roof.ring, x, z) < margin) continue;
    if (taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + margin)) continue;
    return [x, z];
  }
  return undefined;
}

/** 물탱크: 철골 받침(다리 4 + 보) 위 FRP 상자. */
function waterTank(s: LStream, p: Vec3, yaw: number): void {
  const P = placer(p, yaw);
  for (const [dx, dz] of [
    [-1, -0.8],
    [1, -0.8],
    [1, 0.8],
    [-1, 0.8],
  ] as [number, number][])
    box(s, P(dx, 0, dz), [0.12, 1.1, 0.12], yaw, LMAT.steel_dark);
  box(s, P(0, 1.1, 0), [2.3, 0.12, 1.9], yaw, LMAT.steel_dark);
  box(s, P(0, 1.22, 0), [2.2, 1.7, 1.8], yaw, LMAT.frp);
}

/** 실외기 무리: 줄(지붕 장변 방향) 2–5대 × 1–2줄, 0.95 m 간격. 반환 = 대수. */
function acCluster(s: LStream, c: Vec3, yaw: number, rng: Rng): number {
  const per = 2 + Math.floor(rng.next() * 4);
  const rows = 1 + Math.floor(rng.next() * 2);
  const P = placer(c, yaw);
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < per; i++)
      box(s, P((i - (per - 1) / 2) * 0.95, 0, r * 0.9), [0.85, 0.62, 0.34], yaw, LMAT.metal);
  return per * rows;
}

/** 난간 기둥(0.05 m 각, 1.1 m) — 옆면 4개(위·아래 없음, 삼각형 8개). */
function post(s: LStream, x: number, y: number, z: number): void {
  const [h, r] = [1.1, 0.025];
  const c: [number, number][] = [
    [x - r, z - r],
    [x + r, z - r],
    [x + r, z + r],
    [x - r, z + r],
  ];
  for (let i = 0; i < 4; i++) {
    const [a, b] = [c[i] as [number, number], c[(i + 1) % 4] as [number, number]];
    face(
      s,
      [
        [b[0], y, b[1]],
        [a[0], y, a[1]],
        [a[0], y + h, a[1]],
        [b[0], y + h, b[1]],
      ],
      LMAT.metal,
    );
  }
}

function railing(s: LStream, roof: Roof): void {
  // 링을 안쪽으로 0.25 m(무게중심 쪽) 당긴 둘레에 기둥(≤ 3 m, 옆면 4개만) + 손스침.
  const cx = roof.ring.reduce((a, p) => a + p[0], 0) / roof.ring.length;
  const cz = roof.ring.reduce((a, p) => a + p[1], 0) / roof.ring.length;
  const pts: Vec3[] = roof.ring.map(([x, z]) => {
    const l = Math.hypot(cx - x, cz - z) || 1;
    return [x + ((cx - x) / l) * 0.25, roof.y + 1.1, z + ((cz - z) / l) * 0.25];
  });
  pts.push(pts[0] as Vec3);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i] as Vec3, pts[i + 1] as Vec3];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 3));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      post(s, a[0] + (b[0] - a[0]) * t, roof.y, a[2] + (b[2] - a[2]) * t);
    }
  }
  sweep(s, pts, 0.05, 0.05, LMAT.metal);
}

/** 옥상 설비 한 동. skipEquipment = LOD2 옥상 부속물이 이미 있음. */
export function emitRooftop(s: LStream, b: BuildingRecord, originWF: Vec3Tuple, stats: DetailStats): void {
  const roof = flatRoof(b, originWF);
  if (!roof) return;
  const ground = plateauExtent(b).groundY - originWF[1];
  const H = roof.y - ground;
  if (H < 5) return;
  const rng = createRng(hash32(WORLD_SEED, 'rooftop', b.gmlId));
  const yTop = roof.y + 1e-3;
  const lod2Kit =
    b.surfaces.filter((q) => q.kind === 'installation' && (q.ringsWF[0]?.[1] ?? 0) - originWF[1] > roof.y - 0.5)
      .length >= 6;
  stats.roofs++;
  const taken: [number, number, number][] = [];
  if (!lod2Kit) {
    if (H >= 9 && roof.area >= 80 && rng.next() < 0.6) {
      const [w, d, h] = [3 + rng.next() * 1.5, 2.5 + rng.next(), 2.8 + rng.next() * 0.4];
      const p = spot(rng, roof, Math.hypot(w, d) / 2 + 0.4, taken);
      if (p) {
        box(s, [p[0], yTop, p[1]], [w, h, d], roof.yaw, LMAT.concrete);
        taken.push([p[0], p[1], Math.hypot(w, d) / 2]);
        stats.towers++;
      }
    }
    if (H >= 10 && H <= 45 && rng.next() < 0.35) {
      const p = spot(rng, roof, 1.8, taken);
      if (p) {
        waterTank(s, [p[0], yTop, p[1]], roof.yaw);
        taken.push([p[0], p[1], 1.6]);
        stats.tanks++;
      }
    }
    const clusters = Math.min(3, 1 + Math.floor(roof.area / 250));
    for (let k = 0; k < clusters; k++) {
      const p = spot(rng, roof, 2.6, taken);
      if (!p) continue;
      stats.ac += acCluster(s, [p[0], yTop, p[1]], roof.yaw, rng);
      taken.push([p[0], p[1], 2.4]);
    }
    if (rng.next() < 0.2) {
      const p = spot(rng, roof, 0.8, taken);
      if (p) cylinder(s, [p[0], yTop, p[1]], 0.05, 0.03, 3.5 + rng.next() * 2, 6, LMAT.steel_dark);
    }
  }
  if ((b.usage !== null && RESIDENTIAL.has(b.usage)) || H < 25 ? rng.next() < 0.3 : rng.next() < 0.1) {
    railing(s, roof);
    stats.railings++;
  }
}

/** 소형 건물 외부 비상계단: 지면 링의 4 m 이상 변 중 가장 짧은 것 바깥, 층마다 참(3.6 × 1.2 m) + 반대 끝으로 오르는 계단 판 + 난간. */
export function emitFireEscape(
  s: LStream,
  b: BuildingRecord,
  originWF: Vec3Tuple,
  blocked: (x: number, z: number) => boolean,
  stats: DetailStats,
): void {
  if (!b.usage || !STAIR_USAGE.has(b.usage)) return;
  const { groundY, bounds } = plateauExtent(b);
  const H = bounds.max[1] - groundY;
  if (H < 8 || H > 22) return;
  const rng = createRng(hash32(WORLD_SEED, 'fire-escape', b.gmlId));
  if (rng.next() >= 0.3) return;
  const g = b.surfaces.find((q) => q.kind === 'ground')?.ringsWF[0];
  if (!g || g.length < 12) return;
  const ring: P2[] = [];
  for (let i = 0; i < g.length; i += 3) ring.push([(g[i] as number) - originWF[0], (g[i + 2] as number) - originWF[2]]);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [p, q] = [ring[i] as P2, ring[(i + 1) % ring.length] as P2];
    area += p[0] * q[1] - q[0] * p[1];
  }
  const sgn = area > 0 ? 1 : -1;
  let pick: { a: P2; u: P2; n: P2; L: number } | undefined;
  for (let i = 0; i < ring.length; i++) {
    const [a, c] = [ring[i] as P2, ring[(i + 1) % ring.length] as P2];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 4 || (pick && L >= pick.L)) continue;
    const u: P2 = [(c[0] - a[0]) / L, (c[1] - a[1]) / L];
    const n: P2 = [u[1] * sgn, -u[0] * sgn];
    const m: P2 = [a[0] + u[0] * (L / 2) + n[0] * 1.6, a[1] + u[1] * (L / 2) + n[1] * 1.6];
    if (blocked(m[0] + originWF[0], m[1] + originWF[2])) continue;
    pick = { a, u, n, L };
  }
  if (!pick) return;
  stairColumn(s, pick, groundY - originWF[1], H, Math.max(2, Math.round(H / 3.2)));
  stats.stairs++;
}

function stairColumn(s: LStream, e: { a: P2; u: P2; n: P2; L: number }, base: number, H: number, floors: number): void {
  const fh = H / floors;
  const at = (t: number, out: number, y: number): Vec3 => [
    e.a[0] + e.u[0] * (e.L / 2 - 1.8 + t) + e.n[0] * out,
    base + y,
    e.a[1] + e.u[1] * (e.L / 2 - 1.8 + t) + e.n[1] * out,
  ];
  const yaw = Math.atan2(-e.u[1], e.u[0]);
  for (let k = 1; k < floors; k++) {
    const y = k * fh;
    box(s, at(1.8, 0.65, y - 0.1), [3.6, 0.1, 1.2], yaw, LMAT.steel_dark);
    sweep(s, [at(0, 1.25, y + 1.0), at(3.6, 1.25, y + 1.0)], 0.04, 0.04, LMAT.steel_dark);
  }
  for (let k = 0; k + 1 < floors; k++) {
    // 층 k 참 → k+1 참: 왼쪽·오른쪽 번갈아(지면 k = 0은 바닥에서).
    const [ta, tb] = k % 2 === 0 ? [0.3, 3.3] : [3.3, 0.3];
    const [ya, yb] = [k * fh, (k + 1) * fh - 0.1];
    sweep(s, [at(ta, 0.65, ya), at(tb, 0.65, yb)], 0.9, 0.08, LMAT.steel_dark);
    sweep(s, [at(ta, 1.12, ya + 0.95), at(tb, 1.12, yb + 0.95)], 0.04, 0.04, LMAT.steel_dark);
  }
  for (const t of [0.05, 3.55]) cylinder(s, at(t, 1.2, 0), 0.05, 0.05, H - 0.2, 6, LMAT.steel_dark);
}
