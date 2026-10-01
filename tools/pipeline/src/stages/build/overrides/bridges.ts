// 교량·계단(M05-T08): PLATEAU brid 면 → overrides 스트림(상판 윗면 콘크리트·옆면 콘크리트·아랫면 짙은 데크·구조재 금속) + 정밀 충돌(지면 스트림 — 0.3 m 단순화면 상판 턱이 사라진다),
// OSM 높이 계단 → 챌면 ≤ 0.20 m 계단 메시 + 옆 판·손스침, 충돌 = JCOL 램프 프록시(flags bit0, 경사면 위 한쪽 면 triMesh) + 옆 벽 박스(떨어짐 방지). see ADR-0056
import { JCOL_FLAG, JCOL_MATERIAL, type JcolShape, type Vec3Tuple } from '@sanpo/tile-format';
import { triangulateRings, type Vec3 } from '../../../lib/triangulate.ts';
import type { BridgeRecord, SurfaceKind } from '../../../readers/plateau/types.ts';
import type { StairSpec } from '../../derive/stairs.ts';
import { carveSurface } from './carve.ts';
import { addTriangulated, face, type LStream, sweep } from './geom.ts';
import { LMAT } from './spec.ts';

/** 계단 챌면 상한(m) — 07·08 계단 규칙. */
export const RISER_MAX_M = 0.2;
const RAIL_H = 1.0;
const SIDE_WALL_H = 1.1;

const KIND_MAT: Partial<Record<SurfaceKind, number>> = {
  roof: LMAT.concrete,
  wall: LMAT.concrete,
  ground: LMAT.deck,
  installation: LMAT.metal,
};

/** 교량 1동: 렌더 면 + 충돌 스트림(셀 로컬). closure(가상 폐합면)·계단 통로 안 면은 제외, 계단 위 끝 문을 가로지르는 면은 잘라낸다(carve.ts). 반환 = 걷어내거나 자른 면 수. */
export function emitBridge(
  s: LStream,
  col: { pos: number[]; idx: number[] },
  b: BridgeRecord,
  o: Vec3Tuple,
  corridors: readonly StairSpec[] = [],
): number {
  let carved = 0;
  for (const surf of b.surfaces) {
    const m = KIND_MAT[surf.kind];
    if (m === undefined) continue;
    const cut = carveSurface(corridors, surf.kind, surf.ringsWF[0] ?? []);
    if (cut !== null) carved++;
    if (cut === 'drop') continue;
    for (const rings of cut ? cut.map((r) => [r]) : [surf.ringsWF]) {
      const t = triangulateRings(rings.map((r) => r.map((v, i) => v - (o[i % 3] as number))));
      if (!t) continue;
      addTriangulated(s, t, m, 0);
      const base = col.pos.length / 3;
      col.pos.push(...t.vertices);
      for (const k of t.triangles) col.idx.push(base + k);
    }
  }
  return carved;
}

interface Station {
  /** 셀 로컬 xz. */
  p: [number, number];
  /** 진행 방향(xz 단위). */
  d: [number, number];
  /** 아래 끝부터 수평 거리. */
  s: number;
}

/** 꺾은선(셀 로컬) → 거리 s마다 위치·방향. */
function stations(path: readonly [number, number][], at: readonly number[]): Station[] {
  const seg: { a: [number, number]; d: [number, number]; l: number; s0: number }[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i] as [number, number], path[i + 1] as [number, number]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    seg.push({ a, d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l], l, s0: acc });
    acc += l;
  }
  return at.map((s) => {
    const g = seg.find((q) => s <= q.s0 + q.l + 1e-9) ?? seg[seg.length - 1];
    if (!g) return { p: path[0] as [number, number], d: [1, 0], s };
    const t = Math.min(g.l, Math.max(0, s - g.s0));
    return { p: [g.a[0] + g.d[0] * t, g.a[1] + g.d[1] * t], d: g.d, s };
  });
}

function pathLength(path: readonly [number, number][]): number {
  let l = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i] as [number, number], path[i + 1] as [number, number]];
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
}

const sideOf = (st: Station, k: number, w: number): [number, number] => [
  st.p[0] - st.d[1] * k * (w / 2),
  st.p[1] + st.d[0] * k * (w / 2),
];

/** 계단 1개: 렌더(디딤판·챌면·옆 판·손스침·착지판) + 충돌(램프 프록시 triMesh + 옆 벽 박스). 반환 = 챌면 수. */
export function emitStair(s: LStream, colliders: JcolShape[], st: StairSpec, o: Vec3Tuple): number {
  const path = st.path.map(([x, z]): [number, number] => [x - o[0], z - o[2]]);
  const L = pathLength(path);
  const H = st.y1 - st.y0;
  if (L < 0.5) return 0;
  const n = Math.max(2, Math.ceil(H / RISER_MAX_M));
  const [y0, w] = [st.y0 - o[1], st.width];
  const sts = stations(
    path,
    Array.from({ length: n + 1 }, (_, i) => (L * i) / n),
  );
  stepFaces(s, sts, y0, H / n, w);
  for (const k of [-1, 1]) {
    const edge = (y: (st: Station) => number): Vec3[] =>
      sts.map((q) => {
        const [x, z] = sideOf(q, k, w + 0.12);
        return [x, y(q), z];
      });
    sweep(
      s,
      edge((q) => y0 + (H * q.s) / L - 0.05),
      0.12,
      0.4,
      LMAT.concrete,
    );
    sweep(
      s,
      edge((q) => y0 + (H * q.s) / L + RAIL_H),
      0.05,
      0.05,
      LMAT.metal,
    );
  }
  // 위 끝 착지판: 상판보다 3 cm 아래(상판이 있으면 가려지고, 틈이면 보인다).
  const top = sts[n] as Station;
  const land: Station = {
    p: [top.p[0] + top.d[0] * st.landing, top.p[1] + top.d[1] * st.landing],
    d: top.d,
    s: L + st.landing,
  };
  const [tl, tr, ll, lr] = [sideOf(top, -1, w), sideOf(top, 1, w), sideOf(land, -1, w), sideOf(land, 1, w)];
  const yl = y0 + H - 0.03;
  face(s, [xyz(tr, yl), xyz(lr, yl), xyz(ll, yl), xyz(tl, yl)], LMAT.concrete);
  stairColliders(colliders, [...sts, land], y0, H, L, w);
  return n;
}

const xyz = (p: [number, number], y: number): Vec3 => [p[0], y, p[1]];

/** 챌면(a 위치 수직, 아래에서 오는 사람 쪽을 본다) + 디딤판(yb 높이, a → b, 위를 본다). k = 1 = 오르는 사람의 오른쪽. */
function stepFaces(s: LStream, sts: readonly Station[], y0: number, rise: number, w: number): void {
  for (let i = 0; i + 1 < sts.length; i++) {
    const [a, b] = [sts[i] as Station, sts[i + 1] as Station];
    const [ya, yb] = [y0 + rise * i, y0 + rise * (i + 1)];
    const [al, ar, bl, br] = [sideOf(a, -1, w), sideOf(a, 1, w), sideOf(b, -1, w), sideOf(b, 1, w)];
    face(s, [xyz(al, ya), xyz(ar, ya), xyz(ar, yb), xyz(al, yb)], LMAT.concrete);
    face(s, [xyz(ar, yb), xyz(br, yb), xyz(bl, yb), xyz(al, yb)], LMAT.concrete);
  }
}

/** 램프 프록시(경사면 + 위 끝 착지판, 위 한쪽 면 — flags bit0) + 양옆 벽 박스(계단 구간마다, 경사 따라 기울임). */
function stairColliders(out: JcolShape[], sts: Station[], y0: number, H: number, L: number, w: number): void {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const q of sts) {
    const y = y0 + (H * Math.min(q.s, L)) / L;
    for (const k of [-1, 1]) {
      const [x, z] = sideOf(q, k, w);
      vertices.push(x, y, z);
    }
  }
  for (let i = 0; i + 1 < sts.length; i++) {
    const [l0, r0, l1, r1] = [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 3];
    indices.push(l0, r1, l1, l0, r0, r1);
  }
  out.push({
    kind: 'triMesh',
    layer: 0,
    material: JCOL_MATERIAL.concrete,
    flags: JCOL_FLAG.rampProxy,
    posLocal: [0, 0, 0],
    quat: [0, 0, 0, 1],
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
  });
  const pitch = Math.atan2(H, L);
  for (let i = 0; i + 1 < sts.length && (sts[i + 1] as Station).s <= L + 1e-6; i++) {
    const [a, b] = [sts[i] as Station, sts[i + 1] as Station];
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    if (len < 1e-3) continue;
    const yaw = Math.atan2(a.d[0], a.d[1]);
    for (const k of [-1, 1]) {
      const [ax, az] = sideOf(a, k, w + 0.1);
      const [bx, bz] = sideOf(b, k, w + 0.1);
      const ym = y0 + (H * (a.s + b.s)) / 2 / L;
      out.push({
        kind: 'box',
        layer: 0,
        material: JCOL_MATERIAL.metal,
        flags: 0,
        posLocal: [(ax + bx) / 2, ym + SIDE_WALL_H / 2, (az + bz) / 2],
        quat: yawPitch(yaw, pitch),
        halfExtents: [0.05, SIDE_WALL_H / 2, len / Math.cos(pitch) / 2],
      });
    }
  }
}

/** 로컬 +Z가 (sin yaw, ·, cos yaw) 수평 방향으로 위로 pitch만큼 오르게 하는 쿼터니언(x, y, z, w) = Ry(yaw) · Rx(−pitch). */
export function yawPitch(yaw: number, pitch: number): [number, number, number, number] {
  const [cy, sy] = [Math.cos(yaw / 2), Math.sin(yaw / 2)];
  const [cp, sp] = [Math.cos(-pitch / 2), Math.sin(-pitch / 2)];
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}
