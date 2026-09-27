// Vec3d/Vec3/Quat 연산. 핫패스용으로 out 파라미터에 기록하고 out을 반환(할당 없음). see docs/15-conventions.md §4
import type { Quat, Vec3d } from '../api.ts';

const DEG_PER_RAD = 180 / Math.PI;
// 정규화 시 0 벡터 판정(길이² 기준).
const EPS_LEN_SQ = 1e-24;
// slerp에서 두 쿼터니언이 거의 같으면 선형 보간으로 대체(수치 안정).
const SLERP_LINEAR_DOT = 0.9995;

export const degToRad = (deg: number): number => deg / DEG_PER_RAD;
export const radToDeg = (rad: number): number => rad * DEG_PER_RAD;
export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── Vec3d (WF float64 / Vec3도 같은 형태) ──

export const vec3 = (x = 0, y = 0, z = 0): Vec3d => ({ x, y, z });

export function vec3Set(out: Vec3d, x: number, y: number, z: number): Vec3d {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}
export const vec3Copy = (out: Vec3d, a: Readonly<Vec3d>): Vec3d => vec3Set(out, a.x, a.y, a.z);
export const vec3Add = (out: Vec3d, a: Readonly<Vec3d>, b: Readonly<Vec3d>): Vec3d =>
  vec3Set(out, a.x + b.x, a.y + b.y, a.z + b.z);
export const vec3Sub = (out: Vec3d, a: Readonly<Vec3d>, b: Readonly<Vec3d>): Vec3d =>
  vec3Set(out, a.x - b.x, a.y - b.y, a.z - b.z);
export const vec3Scale = (out: Vec3d, a: Readonly<Vec3d>, s: number): Vec3d => vec3Set(out, a.x * s, a.y * s, a.z * s);
/** out = a + b·s */
export const vec3AddScaled = (out: Vec3d, a: Readonly<Vec3d>, b: Readonly<Vec3d>, s: number): Vec3d =>
  vec3Set(out, a.x + b.x * s, a.y + b.y * s, a.z + b.z * s);
export const vec3Dot = (a: Readonly<Vec3d>, b: Readonly<Vec3d>): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vec3Cross = (out: Vec3d, a: Readonly<Vec3d>, b: Readonly<Vec3d>): Vec3d =>
  vec3Set(out, a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const vec3LengthSq = (a: Readonly<Vec3d>): number => vec3Dot(a, a);
export const vec3Length = (a: Readonly<Vec3d>): number => Math.sqrt(vec3Dot(a, a));
export function vec3DistanceSq(a: Readonly<Vec3d>, b: Readonly<Vec3d>): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
export const vec3Distance = (a: Readonly<Vec3d>, b: Readonly<Vec3d>): number => Math.sqrt(vec3DistanceSq(a, b));
/** 0 벡터는 (0,0,0)으로 둔다. */
export function vec3Normalize(out: Vec3d, a: Readonly<Vec3d>): Vec3d {
  const lenSq = vec3Dot(a, a);
  if (lenSq < EPS_LEN_SQ) return vec3Set(out, 0, 0, 0);
  return vec3Scale(out, a, 1 / Math.sqrt(lenSq));
}
export const vec3Lerp = (out: Vec3d, a: Readonly<Vec3d>, b: Readonly<Vec3d>, t: number): Vec3d =>
  vec3Set(out, lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));

// ── Quat ──

export const quatIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export function quatSet(out: Quat, x: number, y: number, z: number, w: number): Quat {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}
export const quatCopy = (out: Quat, q: Readonly<Quat>): Quat => quatSet(out, q.x, q.y, q.z, q.w);

/** axis는 단위 벡터여야 한다. */
export function quatFromAxisAngle(out: Quat, axis: Readonly<Vec3d>, angleRad: number): Quat {
  const s = Math.sin(angleRad / 2);
  return quatSet(out, axis.x * s, axis.y * s, axis.z * s, Math.cos(angleRad / 2));
}

/** +Y축 회전. yaw=0 → 정면 -Z(북), 양수 = 반시계(위에서 볼 때, 오른손 좌표계). */
export const quatFromYaw = (out: Quat, yawRad: number): Quat =>
  quatSet(out, 0, Math.sin(yawRad / 2), 0, Math.cos(yawRad / 2));

/** out = a·b (b를 먼저 적용한 뒤 a). out이 a/b와 같아도 안전. */
export function quatMultiply(out: Quat, a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  const { x: ax, y: ay, z: az, w: aw } = a;
  const { x: bx, y: by, z: bz, w: bw } = b;
  return quatSet(
    out,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  );
}

export function quatNormalize(out: Quat, q: Readonly<Quat>): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len * len < EPS_LEN_SQ) return quatSet(out, 0, 0, 0, 1);
  const inv = 1 / len;
  return quatSet(out, q.x * inv, q.y * inv, q.z * inv, q.w * inv);
}

/** out = q ⊗ v ⊗ q⁻¹ (q는 단위 쿼터니언). out이 v와 같아도 안전. */
export function vec3ApplyQuat(out: Vec3d, v: Readonly<Vec3d>, q: Readonly<Quat>): Vec3d {
  const { x, y, z } = v;
  // t = 2·(q.xyz × v)
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  // v' = v + w·t + q.xyz × t
  return vec3Set(
    out,
    x + q.w * tx + (q.y * tz - q.z * ty),
    y + q.w * ty + (q.z * tx - q.x * tz),
    z + q.w * tz + (q.x * ty - q.y * tx),
  );
}

/** 최단 경로 구면 보간. out이 a/b와 같아도 안전. */
export function quatSlerp(out: Quat, a: Readonly<Quat>, b: Readonly<Quat>, t: number): Quat {
  let { x: bx, y: by, z: bz, w: bw } = b;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  let s0 = 1 - t;
  let s1 = t;
  if (cos < SLERP_LINEAR_DOT) {
    const theta = Math.acos(cos);
    const sinTheta = Math.sin(theta);
    s0 = Math.sin((1 - t) * theta) / sinTheta;
    s1 = Math.sin(t * theta) / sinTheta;
  }
  quatSet(out, s0 * a.x + s1 * bx, s0 * a.y + s1 * by, s0 * a.z + s1 * bz, s0 * a.w + s1 * bw);
  return cos < SLERP_LINEAR_DOT ? out : quatNormalize(out, out);
}
