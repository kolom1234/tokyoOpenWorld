// 랜드마크 셸(M05-T05): 대체할 PLATEAU 건물의 렌더 면(roof·wall·installation)을 그대로(위치·높이 오차 0) 랜드마크 머티리얼로 다시 낸다.
// 벽은 cuts 높이에서 수평으로 잘라 띠별 규칙을 고른다(포디움·타워·크라운). 벽과 같은 평면의 부속물은 z-파이팅이라 뺀다(buildings-mesh와 같은 규칙).
import type { Vec3Tuple } from '@sanpo/tile-format';
import { triangulateRings } from '../../../lib/triangulate.ts';
import type { BuildingRecord, SurfaceKind } from '../../../readers/plateau/types.ts';
import { coplanarWithAny, type WallFace } from '../wall-planes.ts';
import { addTriangulated, type LStream, WALL_NY } from './geom.ts';
import { LMAT, type ShellRule, type ShellSpec } from './spec.ts';

const RENDER_KINDS: ReadonlySet<SurfaceKind> = new Set(['roof', 'wall', 'installation']);

export interface Bounds {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

export const emptyBounds = (): Bounds => ({
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

export function growBounds(b: Bounds, pos: readonly number[], from = 0): void {
  for (let i = from; i < pos.length; i++) {
    const k = i % 3;
    b.min[k] = Math.min(b.min[k] as number, pos[i] as number);
    b.max[k] = Math.max(b.max[k] as number, pos[i] as number);
  }
}

/** 건물 렌더 면(+ 바닥면) 최저 y와 렌더 면 경계(WF). */
export function plateauExtent(b: BuildingRecord): { groundY: number; bounds: Bounds } {
  const bounds = emptyBounds();
  let groundY = Infinity;
  for (const s of b.surfaces) {
    const render = RENDER_KINDS.has(s.kind);
    if (!render && s.kind !== 'ground') continue;
    for (const r of s.ringsWF) {
      for (let i = 1; i < r.length; i += 3) groundY = Math.min(groundY, r[i] as number);
      if (render) growBounds(bounds, r);
    }
  }
  return { groundY: Number.isFinite(groundY) ? groundY : 0, bounds };
}

/** 링을 y ∈ [lo, hi]로 자른다(Sutherland–Hodgman, 두 반공간). 남는 게 없으면 null. */
export function clipRingY(ring: readonly number[], lo: number, hi: number): number[] | null {
  const half = (pts: number[], keep: (y: number) => boolean, at: number): number[] => {
    const out: number[] = [];
    const n = pts.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]] as number[];
      const b = [pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]] as number[];
      const [ia, ib] = [keep(a[1] as number), keep(b[1] as number)];
      if (ia) out.push(...a);
      if (ia !== ib) {
        const t = (at - (a[1] as number)) / ((b[1] as number) - (a[1] as number));
        out.push(...a.map((v, k) => v + ((b[k] as number) - v) * t));
      }
    }
    return out;
  };
  const r = half(
    half([...ring], (y) => y >= lo, lo),
    (y) => y <= hi,
    hi,
  );
  return r.length >= 9 ? r : null;
}

function ruleFor(rules: readonly ShellRule[], kind: SurfaceKind, wall: boolean, yRel: number): number {
  for (const r of rules) {
    if (r.kinds && !r.kinds.includes(kind)) continue;
    if (r.wall !== undefined && r.wall !== wall) continue;
    if (r.y && (yRel < r.y[0] || yRel >= r.y[1])) continue;
    return LMAT[r.mat];
  }
  return LMAT.concrete;
}

function centroidY(vertices: readonly number[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < vertices.length; i += 3) {
    lo = Math.min(lo, vertices[i] as number);
    hi = Math.max(hi, vertices[i] as number);
  }
  return (lo + hi) / 2;
}

/** 셸 1동을 스트림(셀 로컬)에 낸다. 반환 = 바닥 y(셀 로컬). */
export function emitShell(s: LStream, b: BuildingRecord, spec: ShellSpec, originWF: Vec3Tuple): number {
  const ground = plateauExtent(b).groundY - originWF[1];
  const local = (r: readonly number[]): number[] => r.map((v, i) => v - (originWF[i % 3] as number));
  const bands = [-Infinity, ...(spec.cuts ?? []).map((c) => c + ground), Infinity];
  type Face = { kind: SurfaceKind; rings: number[][]; wall: boolean };
  const faces: Face[] = [];
  for (const surf of b.surfaces) {
    if (!RENDER_KINDS.has(surf.kind)) continue;
    const rings = surf.ringsWF.map(local);
    const t = triangulateRings(rings);
    if (!t) continue;
    faces.push({ kind: surf.kind, rings, wall: Math.abs(t.normal[1]) < WALL_NY });
  }
  const walls: WallFace[] = [];
  for (const f of faces) {
    const t = f.kind === 'wall' && f.wall ? triangulateRings(f.rings) : null;
    if (t) walls.push({ normal: t.normal, vertices: t.vertices });
  }
  for (const f of faces) {
    const pieces = f.wall && f.kind === 'wall' ? cutBands(f.rings, bands) : [f.rings];
    for (const rings of pieces) {
      const t = triangulateRings(rings);
      if (!t) continue;
      if (f.kind === 'installation' && f.wall && coplanarWithAny({ normal: t.normal, vertices: t.vertices }, walls))
        continue;
      const m = ruleFor(spec.rules, f.kind, f.wall, centroidY(t.vertices) - ground);
      addTriangulated(s, t, m, ground);
    }
  }
  return ground;
}

function cutBands(rings: number[][], bands: readonly number[]): number[][][] {
  if (bands.length <= 2) return [rings];
  const out: number[][][] = [];
  for (let i = 0; i + 1 < bands.length; i++) {
    const outer = clipRingY(rings[0] as number[], bands[i] as number, bands[i + 1] as number);
    if (!outer) continue;
    const holes = rings
      .slice(1)
      .map((h) => clipRingY(h, bands[i] as number, bands[i + 1] as number))
      .filter((h): h is number[] => h !== null);
    out.push([outer, ...holes]);
  }
  return out;
}
