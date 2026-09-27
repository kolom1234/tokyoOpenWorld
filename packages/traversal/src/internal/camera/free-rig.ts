// FreeRig: 6DOF 관성 자유비행(요·피치, 롤 잠금) 순수 계산. WF float64. see docs/09-traversal.md §2 freecam, §3
import { clamp, type Quat, quatFromAxisAngle, quatMultiply, type Vec3, type Vec3d } from '@sanpo/core';
import type { FreecamSettings } from '../../api.ts';

/** 피치 한계: 수직 ±89°(짐벌 뒤집힘 방지). */
const PITCH_LIMIT_RAD = (89 * Math.PI) / 180;
const AXIS_X: Vec3 = { x: 1, y: 0, z: 0 };
const AXIS_Y: Vec3 = { x: 0, y: 1, z: 0 };

export interface FreeRigState {
  posWF: Vec3d;
  velWF: Vec3;
  /** +Y축 반시계(위에서 봄), 0 = −Z(도북) 바라봄. */
  yawRad: number;
  pitchRad: number;
  /** 휠로 조절하는 기본 속도(m/s). */
  speedMs: number;
}

/** 한 프레임 입력(input 원값 → 정규화는 호출 측). move/fly −1…1, look = 라디안. */
export interface FreeRigIntent {
  moveX: number;
  moveY: number;
  fly: number;
  yawDeltaRad: number;
  pitchDeltaRad: number;
  wheelNotches: number;
  sprint: boolean;
}

export function createFreeRigState(posWF: Vec3d, yawRad: number, pitchRad: number, speedMs: number): FreeRigState {
  return { posWF: { ...posWF }, velWF: { x: 0, y: 0, z: 0 }, yawRad, pitchRad: clampPitch(pitchRad), speedMs };
}

export const clampPitch = (p: number): number => clamp(p, -PITCH_LIMIT_RAD, PITCH_LIMIT_RAD);

/** 시선 방향(단위 벡터, WF). */
export function forwardOf(yawRad: number, pitchRad: number): Vec3 {
  const cp = Math.cos(pitchRad);
  return { x: -Math.sin(yawRad) * cp, y: Math.sin(pitchRad), z: -Math.cos(yawRad) * cp };
}

/** 카메라 회전 = yaw(Y) · pitch(X). three 카메라 규약(−Z 전방, +Y 위)과 같다. */
export function rigQuat(out: Quat, yawRad: number, pitchRad: number): Quat {
  const qy: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const qx: Quat = { x: 0, y: 0, z: 0, w: 1 };
  quatFromAxisAngle(qy, AXIS_Y, yawRad);
  quatFromAxisAngle(qx, AXIS_X, pitchRad);
  return quatMultiply(out, qy, qx);
}

/** 목표 위치를 바라보는 yaw/pitch. */
export function lookAtAngles(fromWF: Readonly<Vec3d>, toWF: Readonly<Vec3d>): { yawRad: number; pitchRad: number } {
  const dx = toWF.x - fromWF.x;
  const dy = toWF.y - fromWF.y;
  const dz = toWF.z - fromWF.z;
  return { yawRad: Math.atan2(-dx, -dz), pitchRad: clampPitch(Math.atan2(dy, Math.hypot(dx, dz))) };
}

/**
 * 한 스텝 적분. 목표 속도 = 전방(피치 포함)·우측(수평)·월드 위 축 합 × 속도로 두고,
 * 속도를 `1 − e^(−damping·dt)` 비율로 수렴시킨다(관성). groundY를 알면 최소 높이 유지.
 */
export function stepFreeRig(
  s: FreeRigState,
  intent: Readonly<FreeRigIntent>,
  dt: number,
  cfg: Readonly<FreecamSettings>,
  groundY: number | undefined,
): void {
  s.yawRad = (s.yawRad + intent.yawDeltaRad) % (2 * Math.PI);
  s.pitchRad = clampPitch(s.pitchRad + intent.pitchDeltaRad);
  if (intent.wheelNotches !== 0) {
    s.speedMs = clamp(s.speedMs * cfg.speedStepPerNotch ** intent.wheelNotches, cfg.minSpeedMs, cfg.maxSpeedMs);
  }
  const speed = s.speedMs * (intent.sprint ? cfg.sprintMultiplier : 1);
  const f = forwardOf(s.yawRad, s.pitchRad);
  const rx = Math.cos(s.yawRad);
  const rz = -Math.sin(s.yawRad);
  const tx = (f.x * intent.moveY + rx * intent.moveX) * speed;
  const ty = (f.y * intent.moveY + intent.fly) * speed;
  const tz = (f.z * intent.moveY + rz * intent.moveX) * speed;
  const k = 1 - Math.exp(-cfg.dampingPerS * dt);
  s.velWF.x += (tx - s.velWF.x) * k;
  s.velWF.y += (ty - s.velWF.y) * k;
  s.velWF.z += (tz - s.velWF.z) * k;
  s.posWF.x += s.velWF.x * dt;
  s.posWF.y += s.velWF.y * dt;
  s.posWF.z += s.velWF.z * dt;
  const floor = groundY === undefined ? Number.NEGATIVE_INFINITY : groundY + cfg.minClearanceM;
  if (s.posWF.y > cfg.maxAltitudeM || s.posWF.y < floor) {
    s.posWF.y = clamp(s.posWF.y, floor, cfg.maxAltitudeM);
    s.velWF.y = 0;
  }
}
