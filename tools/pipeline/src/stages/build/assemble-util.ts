// 셀 조립 보조(assemble.ts에서 분리 — 400줄 한도): 스트림 합치기·AABB·창 자르기.
import type { CellKey } from '@sanpo/core';
import { type CellBoundsWF, cellBoundsWF } from '@sanpo/geo';
import type { Vec3Tuple } from '@sanpo/tile-format';
import type { Aabb } from './buildings-mesh.ts';
import type { CellWindow } from './dem-window.ts';
import type { OverrideCellOutput } from './overrides/index.ts';

export function mergeStreams(
  a: { pos: ArrayLike<number>; idx: ArrayLike<number> },
  b: { pos: readonly number[]; idx: readonly number[] },
): { pos: Float32Array; idx: Uint32Array } {
  const base = a.pos.length / 3;
  return {
    pos: Float32Array.from([...Array.from(a.pos), ...b.pos]),
    idx: Uint32Array.from([...Array.from(a.idx), ...b.idx.map((k) => k + base)]),
  };
}

/** 랜드마크 부품 충돌 삼각형을 건물 충돌 스트림 뒤에 붙인다(같이 단순화·청크). */
export function withOverrideCollider(
  c: { pos: Float32Array; idx: Uint32Array },
  ov: OverrideCellOutput | null,
): { pos: Float32Array; idx: Uint32Array } {
  if (!ov || ov.collider.idx.length === 0) return c;
  const base = c.pos.length / 3;
  return {
    pos: Float32Array.from([...c.pos, ...ov.collider.pos]),
    idx: Uint32Array.from([...c.idx, ...ov.collider.idx.map((k) => k + base)]),
  };
}

/** mm 단위로 바깥쪽 반올림(헤더 JSON 숫자 안정화). */
export function outward(b: Aabb): Aabb {
  const lo = (v: number): number => Math.floor(v * 1000) / 1000;
  const hi = (v: number): number => Math.ceil(v * 1000) / 1000;
  return { min: b.min.map(lo) as Vec3Tuple, max: b.max.map(hi) as Vec3Tuple };
}

export function union(a: Aabb, b: Aabb | null): Aabb {
  if (!b) return a;
  const pick = (f: (x: number, y: number) => number, x: Vec3Tuple, y: Vec3Tuple): Vec3Tuple =>
    [0, 1, 2].map((k) => f(x[k] as number, y[k] as number)) as Vec3Tuple;
  return { min: pick(Math.min, a.min, b.min), max: pick(Math.max, a.max, b.max) };
}

export function yRange(positions: Float32Array): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i] as number);
    hi = Math.max(hi, positions[i] as number);
  }
  return [lo, hi];
}

/** 넓은 창 배열 → 여유 margin 창(257 + 2·margin)². */
export function crop<T extends Uint8Array | Float32Array>(w: CellWindow, arr: T, margin: number): T {
  const stride = w.size + 2 * margin;
  const off = w.margin - margin;
  const out = new (arr.constructor as new (n: number) => T)(stride * stride);
  for (let r = 0; r < stride; r++)
    out.set(arr.subarray((r + off) * w.stride + off, (r + off) * w.stride + off + stride), r * stride);
  return out;
}

/** 셀 목록의 합집합(양끝 포함) WF 경계. */
export function unionBounds(cells: readonly CellKey[]): CellBoundsWF {
  const bs = cells.map(cellBoundsWF);
  const pick = (f: (...v: number[]) => number, k: keyof CellBoundsWF): number => f(...bs.map((b) => b[k]));
  return {
    minX: pick(Math.min, 'minX'),
    minZ: pick(Math.min, 'minZ'),
    maxX: pick(Math.max, 'maxX'),
    maxZ: pick(Math.max, 'maxZ'),
  };
}
