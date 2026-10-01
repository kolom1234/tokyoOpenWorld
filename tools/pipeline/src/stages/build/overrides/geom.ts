// 랜드마크 메시 스트림(셀 로컬, 양자화 전) + 기본 도형: 평면 다각형·상자·원기둥(테이퍼)·타원체·직사각 단면 스윕·압출.
// UV = 미터: 수평면 (x, z), 벽 (수평 접선 거리, y − vBase). `_LMAT` = spec.ts LMAT. see ADR-0053
import { triangulateRings, type Vec3 } from '../../../lib/triangulate.ts';

/** |n.y|가 이보다 작으면 벽 UV. */
export const WALL_NY = 0.7;

export class LStream {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  mat: number[] = [];
  idx: number[] = [];
  /** true = UV를 0으로(옥상 설비 — 무늬가 필요 없고, 큰 월드 미터 UV는 meshopt 압축이 거의 안 된다). */
  plainUv = false;
  get count(): number {
    return this.pos.length / 3;
  }
  vert(p: Vec3, n: Vec3, uv: readonly [number, number], m: number): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    if (this.plainUv) this.uv.push(0, 0);
    else this.uv.push(uv[0], uv[1]);
    this.mat.push(m);
    return this.count - 1;
  }
  get tris(): number {
    return this.idx.length / 3;
  }
}

export const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** 면 법선 n의 미터 UV. */
export function faceUv(p: Vec3, n: Vec3, vBase: number): [number, number] {
  if (Math.abs(n[1]) >= WALL_NY) return [p[0], p[2]];
  const th = Math.hypot(n[0], n[2]) || 1;
  return [(p[0] * n[2] - p[2] * n[0]) / th, p[1] - vBase];
}

/** 삼각분할 결과(평면 법선)를 그대로 추가. */
export function addTriangulated(
  s: LStream,
  t: { vertices: number[]; triangles: number[]; normal: Vec3 },
  m: number,
  vBase: number,
): void {
  const base = s.count;
  for (let i = 0; i < t.vertices.length; i += 3) {
    const p: Vec3 = [t.vertices[i] as number, t.vertices[i + 1] as number, t.vertices[i + 2] as number];
    s.vert(p, t.normal, faceUv(p, t.normal, vBase), m);
  }
  for (const k of t.triangles) s.idx.push(base + k);
}

/** 볼록 평면 다각형(바깥에서 볼 때 반시계). */
export function face(s: LStream, pts: readonly Vec3[], m: number, vBase = 0): void {
  if (pts.length < 3) return;
  const n = norm(cross(sub(pts[1] as Vec3, pts[0] as Vec3), sub(pts[2] as Vec3, pts[0] as Vec3)));
  const base = s.count;
  for (const p of pts) s.vert(p, n, faceUv(p, n, vBase), m);
  for (let i = 1; i + 1 < pts.length; i++) s.idx.push(base, base + i, base + i + 1);
}

/** 로컬 (x, y, z) → 셀 로컬: yaw(라디안, +Y축) 회전 + 평행이동. */
export function placer(o: Vec3, yaw: number): (x: number, y: number, z: number) => Vec3 {
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return (x, y, z) => [o[0] + x * c + z * sn, o[1] + y, o[2] - x * sn + z * c];
}

/** 상자: o = 바닥 중심, size = (x 폭, 높이, z 깊이). bottom = 밑면 포함. */
export function box(
  s: LStream,
  o: Vec3,
  size: readonly [number, number, number],
  yaw: number,
  m: number,
  bottom = false,
) {
  const [hx, h, hz] = [size[0] / 2, size[1], size[2] / 2];
  const P = placer(o, yaw);
  const c = [
    P(-hx, 0, -hz),
    P(hx, 0, -hz),
    P(hx, 0, hz),
    P(-hx, 0, hz),
    P(-hx, h, -hz),
    P(hx, h, -hz),
    P(hx, h, hz),
    P(-hx, h, hz),
  ];
  const q = (a: number, b: number, cc: number, d: number) => face(s, [c[a], c[b], c[cc], c[d]] as Vec3[], m, o[1]);
  q(4, 7, 6, 5); // 위
  q(3, 2, 6, 7); // +z
  q(1, 0, 4, 5); // −z
  q(2, 1, 5, 6); // +x
  q(0, 3, 7, 4); // −x
  if (bottom) q(0, 1, 2, 3);
}

/** 수직 원기둥(테이퍼): o = 바닥 중심. 옆면 매끈한 법선, 윗면 뚜껑. */
export function cylinder(s: LStream, o: Vec3, r: number, rTop: number, h: number, seg: number, m: number): void {
  const base = s.count;
  const slope = (r - rTop) / h;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const [cx, cz] = [Math.cos(a), Math.sin(a)];
    const n = norm([cx, slope, cz]);
    const u = (i / seg) * Math.PI * 2 * r;
    s.vert([o[0] + cx * r, o[1], o[2] + cz * r], n, [u, 0], m);
    s.vert([o[0] + cx * rTop, o[1] + h, o[2] + cz * rTop], n, [u, h], m);
  }
  for (let i = 0; i < seg; i++) {
    const k = base + i * 2;
    s.idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
  }
  const top: Vec3[] = [];
  for (let i = seg - 1; i >= 0; i--) {
    const a = (i / seg) * Math.PI * 2;
    top.push([o[0] + Math.cos(a) * rTop, o[1] + h, o[2] + Math.sin(a) * rTop]);
  }
  face(s, top, m);
}

/** 타원체: c = 중심, r = 반지름(로컬 x, y, z), yaw·pitch(로컬 x축 회전) 라디안. */
export function ellipsoid(s: LStream, c: Vec3, r: Vec3, yaw: number, pitch: number, m: number, seg = 12): void {
  const rows = Math.max(4, Math.round(seg * 0.6));
  const base = s.count;
  const [cp, sp] = [Math.cos(pitch), Math.sin(pitch)];
  const P = placer(c, yaw);
  const rot = (x: number, y: number, z: number): Vec3 => [x, y * cp - z * sp, y * sp + z * cp];
  for (let j = 0; j <= rows; j++) {
    const v = (j / rows) * Math.PI;
    for (let i = 0; i <= seg; i++) {
      const u = (i / seg) * Math.PI * 2;
      const d: Vec3 = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
      const lp = rot(d[0] * r[0], d[1] * r[1], d[2] * r[2]);
      const ln = rot(d[0] / r[0], d[1] / r[1], d[2] / r[2]);
      const wn = sub(P(ln[0], ln[1], ln[2]), P(0, 0, 0));
      s.vert(P(lp[0], lp[1], lp[2]), norm(wn), [u * r[0], v * r[1]], m);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i;
      const b = a + seg + 1;
      s.idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
}

/** 직사각 단면(폭 w = 수평 옆, 높이 h = 위) 스윕 — 점 = 단면 중심. 양끝 뚜껑. */
export function sweep(s: LStream, path: readonly Vec3[], w: number, h: number, m: number): void {
  const rings: Vec3[][] = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)] as Vec3;
    const b = path[Math.min(path.length - 1, i + 1)] as Vec3;
    const t = norm(sub(b, a));
    const side = norm(cross(t, [0, 1, 0]));
    const up = norm(cross(side, t));
    const at = (x: number, y: number): Vec3 => [
      p[0] + side[0] * x + up[0] * y,
      p[1] + side[1] * x + up[1] * y,
      p[2] + side[2] * x + up[2] * y,
    ];
    return [at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)];
  });
  for (let i = 0; i + 1 < rings.length; i++) {
    const [a, b] = [rings[i] as Vec3[], rings[i + 1] as Vec3[]];
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      face(s, [a[k1] as Vec3, a[k] as Vec3, b[k] as Vec3, b[k1] as Vec3], m);
    }
  }
  const first = rings[0] as Vec3[];
  const last = rings[rings.length - 1] as Vec3[];
  face(s, first, m);
  face(s, [last[3], last[2], last[1], last[0]] as Vec3[], m);
}

/** 수직 압출: ring = 셀 로컬 xz(감기 무관), 바닥 y0 ~ 위 y1. 윗면 + 옆면. */
export function extrude(s: LStream, ring: readonly number[], y0: number, y1: number, m: number): void {
  const n = ring.length / 2;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area +=
      (ring[i * 2] as number) * (ring[j * 2 + 1] as number) - (ring[j * 2] as number) * (ring[i * 2 + 1] as number);
  }
  // xz 평면 면적 > 0 = (x→z) 반시계 = 위에서(−y로) 볼 때 시계 → 위 법선 +y가 되도록 뒤집는다.
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([ring[i * 2] as number, ring[i * 2 + 1] as number]);
  if (area > 0) pts.reverse();
  const top = triangulateRings([pts.flatMap(([x, z]) => [x, y1, z])]);
  if (top) addTriangulated(s, top, m, y0);
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i] as [number, number];
    const [bx, bz] = pts[(i + 1) % n] as [number, number];
    face(
      s,
      [
        [ax, y0, az],
        [bx, y0, bz],
        [bx, y1, bz],
        [ax, y1, az],
      ],
      m,
      y0,
    );
  }
}
