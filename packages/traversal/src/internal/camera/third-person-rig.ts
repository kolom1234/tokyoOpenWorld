// ThirdPersonRig(09 §3): 피벗 = 발 + 어깨 높이, 붐 = 오른쪽 어깨 0.4 m − 시선 × 거리 3.5 m(휠 1.5–6). 충돌은 boom.ts(sphereCast)가 붐 길이를 줄인다(M04-T05),
// 지면(높이장) 위 0.3 m 아래로는 내려가지 않는다. 순수 계산. see docs/09-traversal.md §3
import { type CameraState, clamp, type Vec3, type Vec3d } from '@sanpo/core';
import type { WalkSettings } from '../../api.ts';
import { forwardOf, rigQuat } from './free-rig.ts';

/** 휠 1노치당 거리 배율(위로 굴림 = 가까이). */
const ZOOM_PER_NOTCH = 0.85;
/** 지면 위 최소 카메라 높이(m). */
const MIN_CLEARANCE_M = 0.3;
/** 아바타 근접 페이드: 붐 0.5 m에서 투명 → 1.2 m부터 불투명. */
const FADE_FROM_M = 0.5;
const FADE_TO_M = 1.2;

export function zoomDistance(d: number, wheelNotches: number, tp: Readonly<WalkSettings['thirdPerson']>): number {
  return clamp(d * ZOOM_PER_NOTCH ** wheelNotches, tp.minDistanceM, tp.maxDistanceM);
}

export interface Boom {
  pivot: Vec3d;
  /** 피벗 → 카메라(단위). */
  dir: Vec3;
  /** 원하는 길이(m). */
  len: number;
}

export function createBoom(): Boom {
  return { pivot: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 1 }, len: 0 };
}

/** 붐(yaw·pitch 시선 기준): 피벗 = (발 x, 스무딩 발 높이 + 피벗 높이, 발 z), 카메라 오프셋 = 오른쪽 × 어깨 − 시선 × 거리. */
export function thirdPersonBoom(
  out: Boom,
  feet: Readonly<Vec3d>,
  feetY: number,
  yawRad: number,
  pitchRad: number,
  distanceM: number,
  w: Readonly<WalkSettings>,
): Boom {
  const tp = w.thirdPerson;
  const f = forwardOf(yawRad, pitchRad);
  const ox = Math.cos(yawRad) * tp.shoulderM - f.x * distanceM;
  const oy = -f.y * distanceM;
  const oz = -Math.sin(yawRad) * tp.shoulderM - f.z * distanceM;
  const len = Math.hypot(ox, oy, oz) || 1;
  out.pivot.x = feet.x;
  out.pivot.y = feetY + tp.pivotHeightM;
  out.pivot.z = feet.z;
  out.dir.x = ox / len;
  out.dir.y = oy / len;
  out.dir.z = oz / len;
  out.len = len;
  return out;
}

/** 카메라 = 피벗 + 붐 방향 × 적용 길이(충돌로 줄인), 회전 = (yaw, pitch). groundY를 알면 그 위 0.3 m 아래로 내려가지 않는다. */
export function thirdPersonCamera(
  out: CameraState,
  boom: Readonly<Boom>,
  lengthM: number,
  yawRad: number,
  pitchRad: number,
  groundY: number | undefined,
): void {
  out.posWF.x = boom.pivot.x + boom.dir.x * lengthM;
  out.posWF.y = boom.pivot.y + boom.dir.y * lengthM;
  out.posWF.z = boom.pivot.z + boom.dir.z * lengthM;
  if (groundY !== undefined) out.posWF.y = Math.max(out.posWF.y, groundY + MIN_CLEARANCE_M);
  rigQuat(out.quat, yawRad, pitchRad);
}

/** 붐 길이 → 아바타 불투명도(가까우면 디더로 사라진다). */
export function avatarOpacity(lengthM: number): number {
  return clamp((lengthM - FADE_FROM_M) / (FADE_TO_M - FADE_FROM_M), 0, 1);
}
