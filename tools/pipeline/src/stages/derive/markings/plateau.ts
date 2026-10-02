// PLATEAU 道路標示(frn LOD3, M06 사전 2): 측량 기반 면(위 향함, 삼각형)을 OSM 규칙 표시보다 우선한다.
// - 横断歩道(1110): 줄무늬형(막대마다 삼각형 — 그대로 그림) | 영역형(외곽 면만 — 안을 일본식 0.45 m 막대로 채움, 보행 방향 = 겹치는 OSM 횡단 선, 없으면 OBB 긴 축).
// - 停止線(1120): 면 그대로. 근처(띠 + 여유) OSM 횡단·정지선은 그리지 않는다(suppress). see docs/adr/0058-plateau-crosswalks.md
import { MARKING_CODES, type MarkingRecord } from '../../../readers/plateau/frn-markings.ts';
import type { V2 } from './common.ts';

export type Tri2 = [V2, V2, V2];

/** 위 향한 면(|n̂y| > 0.7)을 xz 삼각형으로(링 = 부채꼴 분할). */
export function topTriangles(r: MarkingRecord): Tri2[] {
  const out: Tri2[] = [];
  for (const p of r.polygonsWF) {
    const n = Math.floor(p.length / 3);
    if (n < 3) continue;
    const at = (i: number): V2 => [p[i * 3] as number, p[i * 3 + 2] as number];
    for (let i = 1; i + 1 < n; i++) {
      const a = at(0);
      const b = at(i);
      const c = at(i + 1);
      const ux = b[0] - a[0];
      const uy = (p[i * 3 + 1] as number) - (p[1] as number);
      const uz = b[1] - a[1];
      const vx = c[0] - a[0];
      const vy = (p[(i + 1) * 3 + 1] as number) - (p[1] as number);
      const vz = c[1] - a[1];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-9 && Math.abs(ny) / l > 0.7) out.push([a, b, c]);
    }
  }
  return out;
}

const triArea = (t: Tri2): number =>
  Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;

/** 삼각형 세 변 벡터(a→b, b→c, c→a). */
const edgesOf = (t: Tri2): V2[] => [
  [t[1][0] - t[0][0], t[1][1] - t[0][1]],
  [t[2][0] - t[1][0], t[2][1] - t[1][1]],
  [t[0][0] - t[2][0], t[0][1] - t[2][1]],
];

/** 삼각형 최소 높이(2·넓이 ÷ 가장 긴 변) — 막대(0.45 m)면 작다. */
const minAltitude = (t: Tri2): number =>
  (2 * triArea(t)) / Math.max(...edgesOf(t).map((e) => Math.hypot(e[0], e[1])), 1e-9);

/** 줄무늬형 = 넓이 가중 최소 높이 중앙값 ≤ 0.6 m(막대 폭 0.45–0.6 m). */
export function isStriped(tris: readonly Tri2[]): boolean {
  const xs = tris.map((t) => ({ h: minAltitude(t), a: triArea(t) })).sort((p, q) => p.h - q.h);
  const total = xs.reduce((s, x) => s + x.a, 0);
  let acc = 0;
  for (const x of xs) {
    acc += x.a;
    if (acc >= total / 2) return x.h <= 0.6;
  }
  return false;
}

/** 경계 변(사용 1회, 1 mm 반올림 정점 쌍)의 축 방향 합(cos 2θ, sin 2θ) · 길이². */
function boundaryAxis(tris: readonly Tri2[]): [number, number] {
  const key = (p: V2): string => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`;
  const edges = new Map<string, { a: V2; b: V2; n: number }>();
  for (const t of tris)
    for (let i = 0; i < 3; i++) {
      const a = t[i] as V2;
      const b = t[(i + 1) % 3] as V2;
      const [ka, kb] = [key(a), key(b)];
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = edges.get(k);
      if (e) e.n++;
      else edges.set(k, { a, b, n: 1 });
    }
  let sx = 0;
  let sy = 0;
  for (const e of edges.values()) {
    if (e.n !== 1) continue;
    const dx = e.b[0] - e.a[0];
    const dz = e.b[1] - e.a[1];
    const ang = Math.atan2(dz, dx) * 2;
    const w = dx * dx + dz * dz;
    sx += Math.cos(ang) * w;
    sy += Math.sin(ang) * w;
  }
  return [sx, sy];
}

export interface PlateauBand {
  /** 보행 방향 중심선(가로 중앙) 시작·끝(WF xz). */
  a: V2;
  b: V2;
  /** 횡단보도 반폭(m). */
  half: number;
  center: V2;
  /** 보행 방향 단위 벡터. */
  u: V2;
}

/**
 * 띠(보행 방향 축) 추정: 줄무늬형이면 막대 긴 변 방향(가중 축 평균) = 가로 → 보행 방향은 그 수직, 영역형이면 hint(OSM 횡단 방향) 또는 OBB 긴 축.
 * 반환 = 위 면 정점의 (보행, 가로) 범위로 만든 띠. 면이 없으면 null.
 */
export function plateauCrosswalkBand(r: MarkingRecord, hint?: V2): PlateauBand | null {
  const tris = topTriangles(r);
  if (!tris.length) return null;
  const pts = tris.flat();
  const c: V2 = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  let u: V2;
  if (isStriped(tris)) {
    // 경계 변(두 삼각형이 공유하지 않는 변 — 사각형을 나눈 대각선 제외)의 축 방향(2배 각) 길이² 가중 평균 = 막대 긴 변 방향 → 보행 방향 = 수직.
    const [sx, sy] = boundaryAxis(tris);
    const bar = Math.atan2(sy, sx) / 2;
    u = [-Math.sin(bar), Math.cos(bar)];
  } else if (hint) u = hint;
  else {
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (const p of pts) {
      sxx += (p[0] - c[0]) ** 2;
      szz += (p[1] - c[1]) ** 2;
      sxz += (p[0] - c[0]) * (p[1] - c[1]);
    }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    u = [Math.cos(ang), Math.sin(ang)];
  }
  const v: V2 = [u[1], -u[0]];
  let [s0, s1, t0, t1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const p of pts) {
    const s = (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1];
    const t = (p[0] - c[0]) * v[0] + (p[1] - c[1]) * v[1];
    s0 = Math.min(s0, s);
    s1 = Math.max(s1, s);
    t0 = Math.min(t0, t);
    t1 = Math.max(t1, t);
  }
  const tm = (t0 + t1) / 2;
  const at = (s: number): V2 => [c[0] + u[0] * s + v[0] * tm, c[1] + u[1] * s + v[1] * tm];
  return { a: at(s0), b: at(s1), half: (t1 - t0) / 2, center: at((s0 + s1) / 2), u };
}

/** 점 p가 띠(보행 방향 범위 + 여유, 반폭 + 여유) 안인지. */
export function inBand(b: PlateauBand, p: V2, marginM: number): boolean {
  const v: V2 = [b.u[1], -b.u[0]];
  const d: V2 = [p[0] - b.center[0], p[1] - b.center[1]];
  const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
  return (
    Math.abs(d[0] * b.u[0] + d[1] * b.u[1]) <= L / 2 + marginM &&
    Math.abs(d[0] * v[0] + d[1] * v[1]) <= b.half + marginM
  );
}

/** 점이 삼각형 집합 안인지(xz). */
export function inTriangles(tris: readonly Tri2[], p: V2): boolean {
  for (const [a, b, c] of tris) {
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

/** 셀 하나의 PLATEAU 표시 집합: 横断歩道 띠(+ 삼각형·줄무늬 여부)·停止線 OBB. */
export interface PlateauMarks {
  crosswalks: { r: MarkingRecord; tris: Tri2[]; striped: boolean; band: PlateauBand }[];
  stopLines: { r: MarkingRecord; tris: Tri2[]; band: PlateauBand }[];
}

/** OSM 횡단 선 방향(영역형 보행 방향 단서): 면 중심 4 m 안을 지나는 OSM 선분. */
function hintFor(tris: readonly Tri2[], osmCrossings: readonly (readonly number[])[]): V2 | undefined {
  const pts = tris.flat();
  const c: V2 = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  for (const xz of osmCrossings)
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const a: V2 = [xz[i] as number, xz[i + 1] as number];
      const b: V2 = [xz[i + 2] as number, xz[i + 3] as number];
      const d: V2 = [b[0] - a[0], b[1] - a[1]];
      const L2 = d[0] * d[0] + d[1] * d[1];
      if (L2 < 1) continue;
      const t = Math.min(Math.max(((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1]) / L2, 0), 1);
      if (Math.hypot(c[0] - a[0] - d[0] * t, c[1] - a[1] - d[1] * t) <= 4) {
        const L = Math.sqrt(L2);
        return [d[0] / L, d[1] / L];
      }
    }
  return undefined;
}

export function plateauMarks(
  records: readonly MarkingRecord[],
  osmCrossings: readonly (readonly number[])[],
): PlateauMarks {
  const out: PlateauMarks = { crosswalks: [], stopLines: [] };
  for (const r of records) {
    const tris = topTriangles(r);
    if (!tris.length) continue;
    if (r.function === MARKING_CODES.crosswalk) {
      const striped = isStriped(tris);
      const band = plateauCrosswalkBand(r, striped ? undefined : hintFor(tris, osmCrossings));
      if (band) out.crosswalks.push({ r, tris, striped, band });
    } else if (r.function === MARKING_CODES.stopLine) {
      const band = plateauCrosswalkBand(r);
      if (band) out.stopLines.push({ r, tris, band });
    }
  }
  return out;
}

/** OSM 횡단 선분이 PLATEAU 横断歩道 띠(+ 2 m)에 덮이는지: 차도 위 표본(0.5 m)의 절반 이상. 덮이면 그 띠를 돌려준다. */
export function coveringBand(m: PlateauMarks, a: V2, b: V2, onRoad: (p: V2) => boolean): PlateauBand | undefined {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 0.5 || !m.crosswalks.length) return undefined;
  for (const cw of m.crosswalks) {
    let on = 0;
    let hit = 0;
    for (let s = 0; s <= L; s += 0.5) {
      const p: V2 = [a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L];
      if (!onRoad(p)) continue;
      on++;
      if (inBand(cw.band, p, 2)) hit++;
    }
    if (on > 0 && hit * 2 >= on) return cw.band;
  }
  return undefined;
}
