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

/** 삼각형 1개(위쪽 법선이 되도록 감기 정렬). */
function upTri(s: LStream, a: Vec3, b: Vec3, c: Vec3, ua: P2, ub: P2, uc: P2, m: number): void {
  let n = norm([
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
  ]);
  const flip = n[1] < 0;
  if (flip) n = [-n[0], -n[1], -n[2]];
  const k = s.count;
  s.vert(a, n, ua, m);
  s.vert(b, n, ub, m);
  s.vert(c, n, uc, m);
  s.idx.push(...(flip ? [k, k + 2, k + 1] : [k, k + 1, k + 2]));
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
  const roof = LMAT[p.mat];
  for (let i = 0; i < out.length; i++) {
    for (let k = 0; k < ROWS; k++) {
      const [a, b2, c, d] = [row(i, k), row(i + 1, k), row(i + 1, k + 1), row(i, k + 1)];
      upTri(s, a.p, b2.p, c.p, a.uv, b2.uv, c.uv, roof);
      upTri(s, a.p, c.p, d.p, a.uv, c.uv, d.uv, roof);
    }
  }
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
