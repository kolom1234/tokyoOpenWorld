// AttachedRig(09 §3, M07-T05): 부모(열차 칸) 로컬 오프셋 + 부모 기준 시선(yaw·pitch) + 미세 진동(속력 비례 — 레일 이음매 상하·좌우 흔들림).
// 부모 자세는 sim이 프레임마다 정확히 준다(외삽 없음 — ADR-0072) → 스무딩 없이 그대로 붙인다(전면 전망에서 떨림 0).
import { type CameraState, type Quat, quatFromAxisAngle, quatMultiply, type Vec3d } from '@sanpo/core';

const AXIS_X = { x: 1, y: 0, z: 0 } as const;
const AXIS_Y = { x: 0, y: 1, z: 0 } as const;

export interface ParentPose {
  posWF: Readonly<Vec3d>;
  yawRad: number;
  pitchRad: number;
}

/** 부모 로컬 점 → WF(pitch(X) 먼저, 그다음 yaw(Y) — render·physics와 같은 순서). */
export function localToWorld(p: ParentPose, x: number, y: number, z: number, out: Vec3d): Vec3d {
  const cp = Math.cos(p.pitchRad);
  const sp = Math.sin(p.pitchRad);
  const y1 = y * cp - z * sp;
  const z1 = y * sp + z * cp;
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  out.x = p.posWF.x + x * c + z1 * s;
  out.y = p.posWF.y + y1;
  out.z = p.posWF.z + z1 * c - x * s;
  return out;
}

/** WF → 부모 로컬(수평만 — 승차 판정용, pitch 무시). */
export function worldToLocal(p: ParentPose, w: Readonly<Vec3d>): { x: number; y: number; z: number } {
  const dx = w.x - p.posWF.x;
  const dz = w.z - p.posWF.z;
  const c = Math.cos(p.yawRad);
  const s = Math.sin(p.yawRad);
  return { x: dx * c - dz * s, y: w.y - p.posWF.y, z: dx * s + dz * c };
}

/** 미세 진동(m): 속력 20 m/s 이상에서 상하 4 mm·좌우 3 mm(서로 다른 주기 — 이음매 박자 흉내). */
export function vibration(timeS: number, speedMs: number): { dy: number; dx: number } {
  const k = Math.min(1, Math.max(0, speedMs) / 20);
  return {
    dy: k * (0.003 * Math.sin(timeS * 11.3) + 0.001 * Math.sin(timeS * 27.1)),
    dx: k * 0.003 * Math.sin(timeS * 3.7 + 1.1),
  };
}

const qa: Quat = { x: 0, y: 0, z: 0, w: 1 };
const qb: Quat = { x: 0, y: 0, z: 0, w: 1 };

/**
 * 카메라 = 부모 · 로컬 오프셋(진동 더함) · 부모 기준 시선. quat = yaw(부모) ⊗ pitch(부모) ⊗ yaw(시선) ⊗ pitch(시선).
 */
export function attachedCamera(
  out: CameraState,
  p: ParentPose,
  offset: readonly [number, number, number],
  look: { yawRad: number; pitchRad: number },
  vib: { dy: number; dx: number },
): CameraState {
  localToWorld(p, offset[0] + vib.dx, offset[1] + vib.dy, offset[2], out.posWF);
  quatFromAxisAngle(qa, AXIS_Y, p.yawRad);
  quatFromAxisAngle(qb, AXIS_X, p.pitchRad);
  quatMultiply(out.quat, qa, qb);
  quatFromAxisAngle(qa, AXIS_Y, look.yawRad);
  quatMultiply(out.quat, out.quat, qa);
  quatFromAxisAngle(qb, AXIS_X, look.pitchRad);
  quatMultiply(out.quat, out.quat, qb);
  return out;
}
