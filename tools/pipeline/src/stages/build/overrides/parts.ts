// 랜드마크 절차 부품(M05-T05): 상자·원기둥·압출·난간·지면 띠(참도)·벽 화면(가상 영상)·도리이·동상(개). 셀 로컬 좌표로 스트림에 낸다.
// 바닥 높이 = 지면(groundAt) + y, yAbs면 WF 절대. collide = 같은 삼각형을 충돌 스트림에도(건물 충돌과 함께 단순화·청크). see ADR-0053
import type { Vec3Tuple } from '@sanpo/tile-format';
import { triangulateRings, type Vec3 } from '../../../lib/triangulate.ts';
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { figureDog, figureTorii } from './figures.ts';
import { box, cylinder, extrude, face, type LStream, norm, sweep } from './geom.ts';
import { plateauExtent } from './shell.ts';
import { LMAT, type PartSpec, type ScreenPart, type XZ } from './spec.ts';

export interface PartCtx {
  originWF: Vec3Tuple;
  /** 지면 높이(셀 로컬 x, z → 셀 로컬 y). */
  groundAt: (x: number, z: number) => number | undefined;
  /** 화면을 붙일 건물(이 셀 레코드). */
  building: (gml: string) => BuildingRecord | undefined;
  out: LStream;
  collider: LStream;
}

/** 부품의 기준점(WF xz) — 이 점이 있는 셀이 낸다(화면은 건물이 있는 셀). */
export function anchorOf(p: PartSpec): XZ {
  switch (p.type) {
    case 'box':
    case 'cyl':
    case 'dog':
      return p.at;
    case 'torii':
      return [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2];
    case 'screen':
      return p.from;
    default:
      return [
        p.type === 'extrude' ? (p.ring[0] as number) : (p.path[0] as number),
        p.type === 'extrude' ? (p.ring[1] as number) : (p.path[1] as number),
      ];
  }
}

const toLocal = (c: PartCtx, p: XZ): [number, number] => [p[0] - c.originWF[0], p[1] - c.originWF[2]];

function groundOr(c: PartCtx, x: number, z: number, fallback: number): number {
  return c.groundAt(x, z) ?? fallback;
}

/** 부품 바닥 y(셀 로컬). 지면을 못 찾으면 오류(기준점은 셀 안이어야 한다). */
export function baseY(c: PartCtx, p: { y?: number; yAbs?: number }, at: XZ): number {
  if (p.yAbs !== undefined) return p.yAbs - c.originWF[1];
  const [x, z] = toLocal(c, at);
  const g = c.groundAt(x, z);
  if (g === undefined) throw new Error(`overrides: no ground at ${at.join(',')}`);
  return g + (p.y ?? 0);
}

const rad = (deg: number | undefined): number => ((deg ?? 0) * Math.PI) / 180;

/** 부품 1개 → 스트림(+ collide면 충돌 스트림). */
export function emitPart(c: PartCtx, p: PartSpec): void {
  const targets = p.collide ? [c.out, c.collider] : [c.out];
  const m = LMAT[p.mat];
  for (const s of targets) {
    switch (p.type) {
      case 'box': {
        const [x, z] = toLocal(c, p.at);
        box(s, [x, baseY(c, p, p.at), z], p.size, rad(p.yaw), m);
        break;
      }
      case 'cyl': {
        const [x, z] = toLocal(c, p.at);
        cylinder(s, [x, baseY(c, p, p.at), z], p.r, p.rTop ?? p.r, p.h, p.seg ?? 16, m);
        break;
      }
      case 'extrude': {
        const y0 = baseY(c, p, [p.ring[0] as number, p.ring[1] as number]);
        const ring = p.ring.map((v, i) => v - (i % 2 === 0 ? c.originWF[0] : c.originWF[2]));
        extrude(s, ring, y0, y0 + p.h, m);
        break;
      }
      case 'railing':
        railing(c, s, p.path, p.closed ?? false, p.h ?? 1.1, p.y ?? 0, m, p.glass ?? false);
        break;
      case 'curb':
        curb(c, s, p.path, p.h, p.w, p.y ?? 0, m);
        break;
      case 'ribbon':
        if (s === c.out) ribbon(c, p.path, p.width, m);
        break;
      case 'screen':
        if (s === c.out) screen(c, p);
        break;
      case 'torii': {
        const [cx, cz] = toLocal(c, anchorOf(p));
        figureTorii(s, [cx, baseY(c, p, anchorOf(p)), cz], p, m);
        break;
      }
      case 'dog': {
        const [x, z] = toLocal(c, p.at);
        figureDog(s, [x, baseY(c, p, p.at), z], -rad(p.facing), p.height, m);
        break;
      }
    }
  }
}

/** 경로를 step(m) 이하 간격으로 다시 찍는다(셀 로컬 xz). */
function resample(c: PartCtx, path: readonly number[], closed: boolean, step: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < path.length; i += 2) pts.push(toLocal(c, [path[i] as number, path[i + 1] as number]));
  if (closed && pts.length > 0) pts.push(pts[0] as [number, number]);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i] as [number, number], pts[i + 1] as [number, number]];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  if (pts.length > 0) out.push(pts[pts.length - 1] as [number, number]);
  return out;
}

/** 난간: 기둥(≤ 1.5 m 간격) + 손스침 + (선택) 유리판(양면). */
function railing(
  c: PartCtx,
  s: LStream,
  path: number[],
  closed: boolean,
  h: number,
  y: number,
  m: number,
  glass: boolean,
) {
  const pts = resample(c, path, closed, 1.5);
  let last = 0;
  const top: Vec3[] = [];
  for (const [x, z] of pts) {
    const g = groundOr(c, x, z, last) + y;
    last = g - y;
    box(s, [x, g, z], [0.05, h, 0.05], 0, m);
    top.push([x, g + h, z]);
  }
  if (top.length >= 2) sweep(s, top, 0.06, 0.05, m);
  if (!glass) return;
  for (let i = 0; i + 1 < top.length; i++) {
    const [a, b] = [top[i] as Vec3, top[i + 1] as Vec3];
    const q: Vec3[] = [
      [a[0], a[1] - h + 0.1, a[2]],
      [b[0], b[1] - h + 0.1, b[2]],
      [b[0], b[1] - 0.06, b[2]],
      [a[0], a[1] - 0.06, a[2]],
    ];
    face(s, q, LMAT.clear_glass);
    face(s, [q[3], q[2], q[1], q[0]] as Vec3[], LMAT.clear_glass);
  }
}

/** 닫힌 테두리(화단 경계석): 1 m 간격으로 지면을 따라가는 직사각 단면 스윕(바닥 0.2 m 묻힘). */
function curb(c: PartCtx, s: LStream, path: number[], h: number, w: number, y: number, m: number): void {
  let last = 0;
  const pts = resample(c, path, true, 1).map(([x, z]): Vec3 => {
    last = groundOr(c, x, z, last);
    return [x, last + y + (h - 0.2) / 2, z];
  });
  sweep(s, pts, w, h + 0.2, m);
}

/** 지면 띠(참도 자갈): 2 m 간격 단면, 양끝도 지면에 붙여(경사 따라) 4 cm 띄운다. */
function ribbon(c: PartCtx, path: number[], width: number, m: number): void {
  const pts = resample(c, path, false, 2);
  const LIFT = 0.04;
  let last = 0;
  const rows: Vec3[][] = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)] as [number, number];
    const b = pts[Math.min(pts.length - 1, i + 1)] as [number, number];
    const d = norm([b[0] - a[0], 0, b[1] - a[1]]);
    const side: [number, number] = [-d[2], d[0]];
    return [-1, 1].map((k) => {
      const x = p[0] + side[0] * k * (width / 2);
      const z = p[1] + side[1] * k * (width / 2);
      last = groundOr(c, x, z, last);
      return [x, last + LIFT, z] as Vec3;
    });
  });
  for (let i = 0; i + 1 < rows.length; i++) {
    const [a, b] = [rows[i] as Vec3[], rows[i + 1] as Vec3[]];
    face(c.out, [a[1], b[1], b[0], a[0]] as Vec3[], m);
  }
}

/** 벽 화면: 건물 벽 평면(from–to에 가장 가까운)과 평행 — 0.3 m 금속 함 + 0.12 m 안쪽 화면 면(uv = 시드×1000 + m, m). */
function screen(c: PartCtx, p: ScreenPart): void {
  const b = c.building(p.gml);
  if (!b) throw new Error(`overrides: screen building ${p.gml} not in cell`);
  const ground = plateauExtent(b).groundY - c.originWF[1];
  const [a, e] = [toLocal(c, p.from), toLocal(c, p.to)];
  const { n, w } = wallPlaneNear(c, b, a, e);
  // 접선 t: cross(t, 위) = n → 면이 바깥(n)을 본다.
  const t: [number, number] = [n[1], -n[0]];
  const ua = a[0] * t[0] + a[1] * t[1];
  const ue = e[0] * t[0] + e[1] * t[1];
  const [u0, u1] = [Math.min(ua, ue), Math.max(ua, ue)];
  const [lo, hi] = [ground + p.span[0], ground + p.span[1]];
  const at = (u: number, off: number, y: number): Vec3 => [t[0] * u + n[0] * (w + off), y, t[1] * u + n[1] * (w + off)];
  // 금속 함(벽에서 0.02 ~ 0.3 m).
  const [B, F] = [0.02, 0.3];
  const q = (pts: Vec3[]) => face(c.out, pts, LMAT.metal);
  q([at(u0, F, lo), at(u1, F, lo), at(u1, F, hi), at(u0, F, hi)]);
  q([at(u0, B, hi), at(u0, F, hi), at(u1, F, hi), at(u1, B, hi)]);
  q([at(u0, B, lo), at(u1, B, lo), at(u1, F, lo), at(u0, F, lo)]);
  q([at(u0, B, lo), at(u0, F, lo), at(u0, F, hi), at(u0, B, hi)]);
  q([at(u1, F, lo), at(u1, B, lo), at(u1, B, hi), at(u1, F, hi)]);
  const IN = 0.12;
  const nv: Vec3 = [n[0], 0, n[1]];
  const base = c.out.count;
  for (const [u, y] of [
    [u0 + IN, lo + IN],
    [u1 - IN, lo + IN],
    [u1 - IN, hi - IN],
    [u0 + IN, hi - IN],
  ] as [number, number][])
    c.out.vert(at(u, F + 0.005, y), nv, [p.seed * 1000 + u - u0 - IN, y - lo - IN], LMAT.screen);
  c.out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** from·to에 가장 가까운 건물 수직 벽 평면(셀 로컬): n = 바깥 수평 법선(xz), w = n·p(벽 위 점). */
function wallPlaneNear(
  c: PartCtx,
  b: BuildingRecord,
  a: [number, number],
  e: [number, number],
): { n: [number, number]; w: number } {
  let best: { n: [number, number]; w: number; score: number } | null = null;
  for (const s of b.surfaces) {
    if (s.kind !== 'wall') continue;
    const t = triangulateRings(s.ringsWF.map((r) => r.map((v, i) => v - (c.originWF[i % 3] as number))));
    if (!t || Math.abs(t.normal[1]) > 0.3) continue;
    const n = norm([t.normal[0], 0, t.normal[2]]);
    const w = (t.vertices[0] as number) * n[0] + (t.vertices[2] as number) * n[2];
    const score = Math.abs(a[0] * n[0] + a[1] * n[2] - w) + Math.abs(e[0] * n[0] + e[1] * n[2] - w);
    if (!best || score < best.score) best = { n: [n[0], n[2]], w, score };
  }
  if (!best || best.score > 4) throw new Error(`overrides: no wall near screen on ${b.gmlId}`);
  return best;
}
