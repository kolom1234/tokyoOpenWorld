// 수평(XZ) 2D 기하: 볼록 껍질(monotone chain), 최소 면적 사각형(회전 캘리퍼스), 다각형 면적. HLOD 박스·매스용.
export type P2 = readonly [number, number];

const cross = (o: P2, a: P2, b: P2): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** 볼록 껍질(반시계, 중복·일직선 점 제거). 점이 3개 미만이면 입력 그대로(정렬·중복 제거). */
export function convexHull(points: readonly P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]?.[0] || p[1] !== pts[i - 1]?.[1]);
  if (uniq.length < 3) return uniq;
  const lower: P2[] = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as P2, lower[lower.length - 1] as P2, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i] as P2;
    while (upper.length >= 2 && cross(upper[upper.length - 2] as P2, upper[upper.length - 1] as P2, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** 부호 없는 면적(신발끈). */
export function polygonArea(ring: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i] as P2;
    const q = ring[(i + 1) % ring.length] as P2;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** 방향 사각형: 중심, 단위 축 u(v = u를 90° 회전), 반폭 hu·hv. */
export interface Obb {
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  hu: number;
  hv: number;
}

/** 볼록 껍질의 최소 면적 외접 사각형(껍질 변 방향 중 하나가 최적). 점 1–2개도 처리(폭 0). */
export function minAreaRect(hull: readonly P2[]): Obb {
  if (hull.length === 0) return { cx: 0, cz: 0, ux: 1, uz: 0, hu: 0, hv: 0 };
  let best: Obb | undefined;
  let bestArea = Number.POSITIVE_INFINITY;
  const n = hull.length;
  for (let i = 0; i < Math.max(1, n); i++) {
    const a = hull[i] as P2;
    const b = hull[(i + 1) % n] as P2;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uz] = len > 0 ? [(b[0] - a[0]) / len, (b[1] - a[1]) / len] : [1, 0];
    let [u0, u1, v0, v1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uz;
      const v = -p[0] * uz + p[1] * ux;
      [u0, u1, v0, v1] = [Math.min(u0, u), Math.max(u1, u), Math.min(v0, v), Math.max(v1, v)];
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      const cu = (u0 + u1) / 2;
      const cv = (v0 + v1) / 2;
      best = { cx: cu * ux - cv * uz, cz: cu * uz + cv * ux, ux, uz, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
    }
  }
  return best as Obb;
}

/** OBB 네 모서리(반시계: 위에서 볼 때 x 동, z 남 좌표계 기준 u→v 순). */
export function obbCorners(o: Obb): P2[] {
  const vx = -o.uz;
  const vz = o.ux;
  const c = (su: number, sv: number): P2 => [
    o.cx + su * o.hu * o.ux + sv * o.hv * vx,
    o.cz + su * o.hu * o.uz + sv * o.hv * vz,
  ];
  return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
}
