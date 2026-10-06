// 선로 스플라인(M07-T01, 04 §4.3): 꼭짓점 → 구심 Catmull-Rom → 0.5 m 등간격 표본(x, z, s, 구간 플래그) → 높이:
// 지상 = 지형(DEM) 위 RAIL_TOP_M, 교량·터널 구간 = 구간 양끝 지상 높이 선형 보간(DEM은 교량 밑 도로·터널 위 지표라), 끝으로 ±SMOOTH_M 이동 평균(구배 매끈 — DEM 잡음·절토 경계).
// see docs/04-data-pipeline.md §4.3, docs/10-simulation.md §6.1
import { type V2, VERTEX_FLAG } from './tracks.ts';

export const RAIL_STEP_M = 0.5;
/** 레일 윗면 = 지형 + 이 값(도상 0.3 + 침목·레일). */
export const RAIL_TOP_M = 0.5;
const SMOOTH_M = 20;

export interface TrackSamples {
  /** WF x·y(레일 윗면)·z, 표본 간격 RAIL_STEP_M(마지막은 끝점). */
  xyz: Float32Array;
  /** 표본별 플래그(VERTEX_FLAG: 터널 1·교량 2 — 구간 양끝 AND). */
  flags: Uint8Array;
  lengthM: number;
}

/** 구심 Catmull-Rom 한 구간(p1 → p2) t∈[0,1] 점. */
function catmull(p0: V2, p1: V2, p2: V2, p3: V2, t: number): V2 {
  const knot = (a: V2, b: V2) => Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5, 1e-4);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const lerp = (a: V2, b: V2, ta: number, tb: number): V2 => {
    const w = (u - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
  };
  const a1 = lerp(p0, p1, 0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, 0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** 꼭짓점(중복 제거) → 촘촘한 곡선(구간마다 거리 ÷ 0.25 m 분할) + 점별 플래그. */
function dense(pts: readonly V2[], flags: readonly number[]): { p: V2[]; f: number[] } {
  const P: V2[] = [];
  const F: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const q = pts[i] as V2;
    const last = P[P.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.05) {
      F[F.length - 1] = (F[F.length - 1] as number) | (flags[i] ?? 0);
      continue;
    }
    P.push(q);
    F.push(flags[i] ?? 0);
  }
  const out: V2[] = [];
  const of: number[] = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const p0 = P[Math.max(0, i - 1)] as V2;
    const p1 = P[i] as V2;
    const p2 = P[i + 1] as V2;
    const p3 = P[Math.min(P.length - 1, i + 2)] as V2;
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
    const seg = (F[i] as number) & (F[i + 1] as number);
    for (let k = 0; k < n; k++) {
      out.push(i === 0 || i + 2 >= P.length ? lerpLin(p1, p2, k / n) : catmull(p0, p1, p2, p3, k / n));
      of.push(seg);
    }
  }
  out.push(P[P.length - 1] as V2);
  of.push(of[of.length - 1] ?? 0);
  return { p: out, f: of };
}

const lerpLin = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** 촘촘한 곡선 → 호 길이 등간격(step) 재표본. */
function resample(p: readonly V2[], f: readonly number[], step: number): { xz: V2[]; flags: number[]; length: number } {
  const xz: V2[] = [p[0] as V2];
  const flags: number[] = [f[0] ?? 0];
  let acc = 0;
  let next = step;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1] as V2;
    const b = p[i] as V2;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (L > 0 && acc + L >= next) {
      xz.push(lerpLin(a, b, (next - acc) / L));
      flags.push(f[i - 1] ?? 0);
      next += step;
    }
    acc += L;
  }
  const end = p[p.length - 1] as V2;
  const last = xz[xz.length - 1] as V2;
  if (Math.hypot(end[0] - last[0], end[1] - last[1]) > 1e-3) {
    xz.push(end);
    flags.push(f[f.length - 1] ?? 0);
  }
  return { xz, flags, length: acc };
}

/** 지상 높이 열: 터널·교량 연속 구간은 양끝 지상 값 보간(한쪽만 있으면 그 값), 그다음 ±SMOOTH_M 이동 평균. */
export function railHeights(
  ground: readonly (number | undefined)[],
  flags: readonly number[],
  step: number,
): Float64Array {
  const n = ground.length;
  const lifted = (i: number) => ((flags[i] as number) & (VERTEX_FLAG.tunnel | VERTEX_FLAG.bridge)) !== 0;
  const g = new Float64Array(n);
  const known = (i: number) => !lifted(i) && ground[i] !== undefined;
  for (let i = 0; i < n; i++) g[i] = known(i) ? (ground[i] as number) : Number.NaN;
  // 빈 구간 보간.
  let i = 0;
  while (i < n) {
    if (!Number.isNaN(g[i] as number)) {
      i++;
      continue;
    }
    const a = i - 1;
    let b = i;
    while (b < n && Number.isNaN(g[b] as number)) b++;
    const ya = a >= 0 ? (g[a] as number) : undefined;
    const yb = b < n ? (g[b] as number) : undefined;
    for (let k = i; k < b; k++) {
      if (ya !== undefined && yb !== undefined) g[k] = ya + ((yb - ya) * (k - a)) / (b - a);
      else g[k] = ya ?? yb ?? (ground[k] as number | undefined) ?? 0;
    }
    i = b;
  }
  const w = Math.max(1, Math.round(SMOOTH_M / step));
  const prefix = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) prefix[k + 1] = (prefix[k] as number) + (g[k] as number);
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const lo = Math.max(0, k - w);
    const hi = Math.min(n - 1, k + w);
    out[k] = ((prefix[hi + 1] as number) - (prefix[lo] as number)) / (hi - lo + 1);
  }
  return out;
}

/** 선로 꼭짓점 → 등간격 표본(WF xyz·플래그·길이). groundAt = 지형 높이(WF, 없으면 undefined). */
export function trackSamples(
  pts: readonly V2[],
  vertexFlags: readonly number[],
  groundAt: (x: number, z: number) => number | undefined,
  step = RAIL_STEP_M,
): TrackSamples {
  const d = dense(pts, vertexFlags);
  const r = resample(d.p, d.f, step);
  const h = railHeights(
    r.xz.map(([x, z]) => groundAt(x, z)),
    r.flags,
    step,
  );
  const xyz = new Float32Array(r.xz.length * 3);
  for (const [k, [x, z]] of r.xz.entries()) xyz.set([x, (h[k] as number) + RAIL_TOP_M, z], k * 3);
  return { xyz, flags: Uint8Array.from(r.flags), lengthM: r.length };
}
