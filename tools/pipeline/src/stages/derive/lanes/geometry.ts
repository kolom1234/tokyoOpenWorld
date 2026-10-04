// 차선 기하(M06-T05, ADR-0065): 꺾은선 왼쪽 오프셋(마이터, 길이 제한), 양 끝 자르기, 2차 베지어 연결로, 사각형 자르기(셀 포털).
// 좌표 = WF xz. 진행 방향 (dx, dz)의 왼쪽 = (dz, −dx)(WF +X 동·−Z 북: 북향 (0, −1)의 왼쪽 = 서 (−1, 0)).
export type P2 = [number, number];

export const len2 = (a: P2, b: P2): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyLength(pts: readonly P2[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += len2(pts[i - 1] as P2, pts[i] as P2);
  return s;
}

/** 진행 방향 왼쪽으로 off(m) — 꼭짓점은 양쪽 법선 평균(마이터 길이 ≤ 2·off). */
export function offsetLeft(pts: readonly P2[], off: number): P2[] {
  if (off === 0 || pts.length < 2) return pts.map((p) => [p[0], p[1]] as P2);
  const out: P2[] = [];
  const left = (a: P2, b: P2): P2 => {
    const L = len2(a, b) || 1;
    return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as P2;
    const n0 = i > 0 ? left(pts[i - 1] as P2, p) : undefined;
    const n1 = i + 1 < pts.length ? left(p, pts[i + 1] as P2) : undefined;
    let nx = (n0?.[0] ?? 0) + (n1?.[0] ?? 0);
    let nz = (n0?.[1] ?? 0) + (n1?.[1] ?? 0);
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    // 마이터: 한쪽 법선과의 cos로 나눠 폭 유지(최대 2배).
    const c = Math.max(0.5, nx * (n1?.[0] ?? n0?.[0] ?? 0) + nz * (n1?.[1] ?? n0?.[1] ?? 0));
    out.push([p[0] + (nx * off) / c, p[1] + (nz * off) / c]);
  }
  return out;
}

/** 꺾은선 거리 s의 점·접선. */
export function pointAt(pts: readonly P2[], s: number): { p: P2; d: P2 } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as P2;
    const b = pts[i] as P2;
    const L = len2(a, b);
    if (acc + L >= s || i === pts.length - 1) {
      const t = L > 0 ? Math.min(Math.max((s - acc) / L, 0), 1) : 0;
      return {
        p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        d: [(b[0] - a[0]) / (L || 1), (b[1] - a[1]) / (L || 1)],
      };
    }
    acc += L;
  }
  const p = pts[0] as P2;
  return { p: [p[0], p[1]], d: [1, 0] };
}

/** 앞에서 s0, 뒤에서 s1 잘라낸 꺾은선(길이가 모자라면 가운데 점 둘). */
export function trim(pts: readonly P2[], s0: number, s1: number): P2[] {
  const L = polyLength(pts);
  const a = Math.min(s0, L / 2);
  const b = Math.max(L - s1, a);
  const out: P2[] = [pointAt(pts, a).p];
  let acc = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    acc += len2(pts[i - 1] as P2, pts[i] as P2);
    if (acc > a && acc < b) out.push([(pts[i] as P2)[0], (pts[i] as P2)[1]]);
  }
  out.push(pointAt(pts, b).p);
  return out;
}

/** 2차 베지어 연결로: p0(방향 d0) → p2(방향 d2), 제어점 = 두 반직선 교점(멀거나 평행이면 중점). */
export function connector(p0: P2, d0: P2, p2: P2, d2: P2): P2[] {
  const den = d0[0] * d2[1] - d0[1] * d2[0];
  const D = len2(p0, p2);
  let c: P2 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
  if (Math.abs(den) > 1e-3) {
    const t = ((p2[0] - p0[0]) * d2[1] - (p2[1] - p0[1]) * d2[0]) / den;
    if (t > 0 && t < 2 * D) c = [p0[0] + d0[0] * t, p0[1] + d0[1] * t];
  }
  const n = Math.min(12, Math.max(2, Math.ceil(D / 3)));
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  return out;
}

/** 사각형(닫힘)으로 자른 조각들. startsAtOrigin·endsAtOrigin = 조각 끝이 원래 꺾은선 끝인지(아니면 경계 포털). */
export function clipRect(
  pts: readonly P2[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): { pts: P2[]; fromStart: boolean; toEnd: boolean }[] {
  const out: { pts: P2[]; fromStart: boolean; toEnd: boolean }[] = [];
  let cur: { pts: P2[]; fromStart: boolean; toEnd: boolean } | undefined;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] as P2;
    const b = pts[i + 1] as P2;
    const r = clipSegment(a, b, x0, z0, x1, z1);
    if (!r) {
      if (cur) out.push(cur);
      cur = undefined;
      continue;
    }
    const A: P2 = [a[0] + (b[0] - a[0]) * r[0], a[1] + (b[1] - a[1]) * r[0]];
    const B: P2 = [a[0] + (b[0] - a[0]) * r[1], a[1] + (b[1] - a[1]) * r[1]];
    if (!cur) cur = { pts: [A], fromStart: i === 0 && r[0] === 0, toEnd: false };
    cur.pts.push(B);
    if (r[1] < 1) {
      out.push(cur);
      cur = undefined;
    } else if (i + 2 === pts.length) cur.toEnd = true;
  }
  if (cur) out.push(cur);
  return out;
}

/** Liang–Barsky: 선분 a→b의 사각형 안 매개변수 [t0, t1] 또는 null. */
function clipSegment(a: P2, b: P2, x0: number, z0: number, x1: number, z1: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (const [p, q] of [
    [-dx, a[0] - x0],
    [dx, x1 - a[0]],
    [-dz, a[1] - z0],
    [dz, z1 - a[1]],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : null;
}
