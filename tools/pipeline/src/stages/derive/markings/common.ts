// 노면 표시 공용(M05-T02): 셀 로컬 2D 사각형·띠 → 지형 메시 위 데칼 삼각형(≤ 1 m 칸으로 잘라 지형을 따름, 높이 = 지형 + 2 cm).
// 소유 = 조각 중심이 셀 안(이웃 셀과 중복 없음). 페인트 = 0 흰색·1 황색. see docs/04-data-pipeline.md §4.3(노면 표시)
import type { RoadIndex } from '../roads.ts';

/** 데칼을 지형 위로 띄우는 양(m) — 지형 메시 정점 사이 굴곡(1 m 칸)·위치 양자화보다 크게. */
export const DECAL_LIFT_M = 0.02;
const CELL_M = 256;
const PIECE_M = 1;

export const PAINT = { white: 0, yellow: 1 } as const;

export interface DecalBuf {
  pos: number[];
  nrm: number[];
  paint: number[];
  idx: number[];
}

export function emptyDecals(): DecalBuf {
  return { pos: [], nrm: [], paint: [], idx: [] };
}

export type TerrainAt = (x: number, z: number) => number | undefined;

export interface MarkCtx {
  out: DecalBuf;
  /** 셀 원점 WF(입력 좌표는 WF, 출력은 셀 로컬). */
  ox: number;
  oz: number;
  terrainAt: TerrainAt;
  /** 차도·보행 분류(WF) — 표시는 차도 위에만. */
  roads: RoadIndex;
  /** 車道交差部(1020) 안인지(WF) — 차선은 교차부에서 끊는다. */
  inIntersection: (x: number, z: number) => boolean;
  /** 이 점(WF)의 OSM 정지선을 막는다(PLATEAU 停止線이 있는 곳 — M06 사전 2). */
  stopBlocked?: (p: V2) => boolean;
}

export type V2 = [number, number];

export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
export const len = (a: V2): number => Math.hypot(a[0], a[1]);
export const norm = (a: V2): V2 => {
  const l = len(a);
  return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
};
/** 진행 방향 d의 왼쪽(WF: x 동·z 남, 위에서 볼 때) — 북(0, −1)의 왼쪽 = 서(−1, 0). */
export const leftOf = (d: V2): V2 => [d[1], -d[0]];

/** 이 셀이 소유하는 점(WF)인지. */
export function owns(c: MarkCtx, p: V2): boolean {
  return p[0] >= c.ox && p[0] < c.ox + CELL_M && p[1] >= c.oz && p[1] < c.oz + CELL_M;
}

function emitVertex(c: MarkCtx, x: number, z: number, paint: number): number | undefined {
  const lx = x - c.ox;
  const lz = z - c.oz;
  const y = c.terrainAt(lx, lz);
  if (y === undefined) return undefined;
  const e = 0.5;
  const gx = ((c.terrainAt(lx + e, lz) ?? y) - (c.terrainAt(lx - e, lz) ?? y)) / (2 * e);
  const gz = ((c.terrainAt(lx, lz + e) ?? y) - (c.terrainAt(lx, lz - e) ?? y)) / (2 * e);
  const l = Math.hypot(gx, 1, gz);
  const i = c.out.pos.length / 3;
  c.out.pos.push(lx, y + DECAL_LIFT_M, lz);
  c.out.nrm.push(-gx / l, 1 / l, -gz / l);
  c.out.paint.push(paint);
  return i;
}

/**
 * 사각형 띠: 중심선 a→b(WF), 폭 w(m) → PIECE_M 칸 격자로 나눈 사각형들(위에서 CCW). 칸마다 중심이 차도 위(보도·교차 제외는 호출 측)여야 그린다.
 * keep = true(차도 위만) | false(전부) | 술어(칸 중심 WF — PLATEAU 영역형 横断歩道 면 안만). 반환 = 그린 칸 수.
 */
export function stripe(
  c: MarkCtx,
  a: V2,
  b: V2,
  w: number,
  paint: number,
  keep: boolean | ((p: V2) => boolean) = true,
): number {
  const d = sub(b, a);
  const L = len(d);
  if (L < 1e-3) return 0;
  const u = mul(d, 1 / L);
  const v = leftOf(u);
  const nu = Math.max(1, Math.ceil(L / PIECE_M));
  const nv = Math.max(1, Math.ceil(w / PIECE_M));
  let drawn = 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const p = (s: number, t: number): V2 => add(add(a, mul(u, (L * (i + s)) / nu)), mul(v, w * ((j + t) / nv - 0.5)));
      const mid = p(0.5, 0.5);
      if (keep === true ? c.roads.classify(mid[0], mid[1]) !== 'road' : keep !== false && !keep(mid)) continue;
      const q = [p(0, 0), p(1, 0), p(1, 1), p(0, 1)].map((pt) => emitVertex(c, pt[0], pt[1], paint));
      if (q.some((x) => x === undefined)) continue;
      const [q0, q1, q2, q3] = q as [number, number, number, number];
      // v = u의 왼쪽 → (0,0) 오른쪽 뒤 → (1,0) 오른쪽 앞 → (1,1) 왼쪽 앞은 위에서 CCW(법선 +Y).
      c.out.idx.push(q0, q1, q2, q0, q2, q3);
      drawn++;
    }
  }
  return drawn;
}

/** 삼각형 데칼(WF, 위에서 CCW로 맞춤): 변이 PIECE_M보다 길면 4분할 반복(지형 따라가기). 반환 = 그린 삼각형 수. */
export function triangle(c: MarkCtx, a: V2, b: V2, d: V2, paint: number): number {
  const cross = (b[0] - a[0]) * (d[1] - a[1]) - (d[0] - a[0]) * (b[1] - a[1]);
  // WF z = 남 → 위에서 볼 때 CCW = (x, z) 평면에서 cross < 0.
  if (cross > 0) [b, d] = [d, b];
  const longest = Math.max(len(sub(b, a)), len(sub(d, b)), len(sub(a, d)));
  if (longest > PIECE_M * 1.5) {
    const ab = mul(add(a, b), 0.5);
    const bd = mul(add(b, d), 0.5);
    const da = mul(add(d, a), 0.5);
    return (
      triangle(c, a, ab, da, paint) +
      triangle(c, ab, b, bd, paint) +
      triangle(c, da, bd, d, paint) +
      triangle(c, ab, bd, da, paint)
    );
  }
  const q = [a, b, d].map((p) => emitVertex(c, p[0], p[1], paint));
  if (q.some((x) => x === undefined)) return 0;
  c.out.idx.push(...(q as number[]));
  return 1;
}

/** 꺾은선(WF xz 쌍 배열) → 길이 누적 표본 함수(0 ≤ s ≤ 전체). */
export function polylineOf(xz: readonly number[]) {
  const pts: V2[] = [];
  for (let i = 0; i + 1 < xz.length; i += 2) pts.push([xz[i] as number, xz[i + 1] as number]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push((cum[i - 1] as number) + len(sub(pts[i] as V2, pts[i - 1] as V2)));
  const total = cum[cum.length - 1] as number;
  const at = (s: number): { p: V2; dir: V2 } => {
    let k = 1;
    while (k < pts.length - 1 && (cum[k] as number) < s) k++;
    const a = pts[k - 1] as V2;
    const b = pts[k] as V2;
    const seg = (cum[k] as number) - (cum[k - 1] as number);
    const t = seg > 0 ? (s - (cum[k - 1] as number)) / seg : 0;
    return { p: add(a, mul(sub(b, a), Math.min(Math.max(t, 0), 1))), dir: norm(sub(b, a)) };
  };
  return { pts, total, at };
}
