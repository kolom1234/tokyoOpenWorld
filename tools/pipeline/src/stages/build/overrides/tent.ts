// 현수 지붕(M05-T05 요요기 국립경기장): PLATEAU 발자국(ground 링) 둘레 링(처마) → 주 케이블 능선(spine, 기둥 사이 포물선 처짐)으로
// 매달린 면(높이 = 처마 + (능선 − 처마)·t², 위로 오목). 둘레 점마다 능선 위 최근접점으로 부채꼴 띠 — 꼬리(입구)는 기둥으로 올라간다.
// 기둥(콘크리트)·주 케이블(기둥 → 능선 → 기둥, 바깥 끝은 꼬리 정착점까지). 지붕 UV u = 둘레 호 길이 → 강판 이음이 능선에서 둘레로 퍼진다.
import type { Vec3 } from '../../../lib/triangulate.ts';
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { cylinder, face, type LStream, norm, sweep } from './geom.ts';
import { LMAT, type TentPart } from './spec.ts';

const ROWS = 10;

type P2 = [number, number];

/** ground 링(셀 로컬 xz, 닫힘 점 제외). */
function outlineOf(b: BuildingRecord, ox: number, oz: number): P2[] {
  const g = b.surfaces.find((s) => s.kind === 'ground') ?? b.surfaces.find((s) => s.kind === 'roof');
  const r = g?.ringsWF[0];
  if (!r) throw new Error(`overrides: tent ${b.gmlId} has no ground/roof ring`);
  const pts: P2[] = [];
  for (let i = 0; i < r.length; i += 3) pts.push([(r[i] as number) - ox, (r[i + 2] as number) - oz]);
  const [f, l] = [pts[0] as P2, pts[pts.length - 1] as P2];
  if (pts.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-6) pts.pop();
  return pts;
}

/** 선분 a–b 위 최근접 매개변수(0..1). */
function closestT(p: P2, a: P2, b: P2): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dz * dz;
  return l2 < 1e-9 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 둘레(i, 닫힘) × 행(k) 격자를 공유 정점·매끈한 법선(중앙 차분, 위쪽)으로 낸다. 삼각형 감기는 면 법선이 위를 향하게. */
function smoothGrid(s: LStream, grid: { p: Vec3; uv: P2 }[][], m: number): void {
  const n = grid.length;
  const rows = (grid[0] as { p: Vec3 }[]).length;
  const at = (i: number, k: number) => (grid[((i % n) + n) % n] as { p: Vec3; uv: P2 }[])[Math.min(rows - 1, Math.max(0, k))] as { p: Vec3; uv: P2 };
  const base = s.count;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < rows; k++) {
      const du = sub(at(i + 1, k).p, at(i - 1, k).p);
      const dk = sub(at(i, k + 1).p, at(i, k - 1).p);
      let nv = norm(cross(du, dk));
      if (!Number.isFinite(nv[0]) || Math.hypot(...nv) < 0.5) nv = [0, 1, 0];
      if (nv[1] < 0) nv = [-nv[0], -nv[1], -nv[2]];
      s.vert(at(i, k).p, nv, at(i, k).uv, m);
    }
  }
  const id = (i: number, k: number) => base + (i % n) * rows + k;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k + 1 < rows; k++) {
      const [a, b, c, d] = [id(i, k), id(i + 1, k), id(i + 1, k + 1), id(i, k + 1)];
      const fn = cross(sub(at(i + 1, k).p, at(i, k).p), sub(at(i + 1, k + 1).p, at(i, k).p));
      s.idx.push(...(fn[1] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
    }
  }
}

/** 현수 지붕 + 둘레 벽 + 기둥 + 주 케이블. g0 = 건물 바닥(셀 로컬 y), ox·oz = 셀 원점. */
export function tentRoof(s: LStream, b: BuildingRecord, p: TentPart, g0: number, ox: number, oz: number): void {
  const out = outlineOf(b, ox, oz);
  const s0: P2 = [p.spine[0] - ox, p.spine[1] - oz];
  const s1: P2 = [p.spine[2] - ox, p.spine[3] - oz];
  const ridge = (t: number): number => g0 + p.ridge - p.sag * 4 * t * (1 - t);
  const eave = g0 + p.eave;
  // 둘레 점별 능선 대응점·호 길이.
  const arc: number[] = [0];
  for (let i = 1; i <= out.length; i++) {
    const [a, c] = [out[i - 1] as P2, out[i % out.length] as P2];
    arc.push((arc[i - 1] as number) + Math.hypot(c[0] - a[0], c[1] - a[1]));
  }
  const row = (i: number, k: number): { p: Vec3; uv: P2 } => {
    const v = out[i % out.length] as P2;
    const t = closestT(v, s0, s1);
    const sp: P2 = [s0[0] + (s1[0] - s0[0]) * t, s0[1] + (s1[1] - s0[1]) * t];
    const f = k / ROWS;
    const x = v[0] + (sp[0] - v[0]) * f;
    const z = v[1] + (sp[1] - v[1]) * f;
    return { p: [x, eave + (ridge(t) - eave) * f * f, z], uv: [arc[i] as number, f * 12] };
  };
  const grid = out.map((_, i) => Array.from({ length: ROWS + 1 }, (_, k) => row(i, k)));
  smoothGrid(s, grid, LMAT[p.mat]);
  // 둘레 벽(콘크리트 링, 바닥 0.5 m 묻힘) — 신발끈 면적 부호로 감기(면적 > 0이면 뒤집어 바깥을 보게, geom.extrude와 같은 규칙).
  let area = 0;
  for (let i = 0; i < out.length; i++) {
    const [a, c] = [out[i] as P2, out[(i + 1) % out.length] as P2];
    area += a[0] * c[1] - c[0] * a[1];
  }
  for (let i = 0; i < out.length; i++) {
    const [a, c] = [out[i] as P2, out[(i + 1) % out.length] as P2];
    const [u, w] = area > 0 ? [c, a] : [a, c];
    face(
      s,
      [
        [u[0], g0 - 0.5, u[1]],
        [w[0], g0 - 0.5, w[1]],
        [w[0], eave, w[1]],
        [u[0], eave, u[1]],
      ],
      LMAT.concrete,
      g0,
    );
  }
  mastsAndCables(s, p, out, s0, s1, ridge, g0);
}

function mastsAndCables(s: LStream, p: TentPart, out: P2[], s0: P2, s1: P2, ridge: (t: number) => number, g0: number) {
  const single = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]) < 1e-6;
  const ends = single ? [s0] : [s0, s1];
  for (const e of ends) cylinder(s, [e[0], g0, e[1]], p.mastD / 2, p.mastD * 0.35, p.mast, 12, LMAT.concrete);
  if (single) return;
  const cable: Vec3[] = [];
  // 꼬리 정착점 = 축 방향으로 기둥 바깥 가장 먼 둘레 점.
  const ax = norm([s1[0] - s0[0], 0, s1[1] - s0[1]]);
  const far = (sign: number, from: P2): P2 =>
    out.reduce((best, q) =>
      ((q[0] - from[0]) * ax[0] + (q[1] - from[1]) * ax[2]) * sign >
      ((best[0] - from[0]) * ax[0] + (best[1] - from[1]) * ax[2]) * sign
        ? q
        : best,
    );
  const a0 = far(-1, s0);
  const a1 = far(1, s1);
  cable.push([a0[0], g0 + 1, a0[1]]);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    cable.push([s0[0] + (s1[0] - s0[0]) * t, ridge(t) + 0.4, s0[1] + (s1[1] - s0[1]) * t]);
  }
  cable.push([a1[0], g0 + 1, a1[1]]);
  sweep(s, cable, 0.8, 0.6, LMAT.steel_dark);
}
