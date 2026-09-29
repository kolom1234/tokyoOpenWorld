// ThirdPersonRig(09 §3): 피벗 = 발 + 어깨 높이, 오른쪽 어깨 오프셋 0.4 m, 시선 반대쪽으로 거리 3.5 m(휠 1.5–6).
// 충돌(sphereCast)·아바타 디더 페이드는 M04-T05 — 지금은 지면(높이장) 아래로만 내려가지 않게. 순수 계산. see docs/09-traversal.md §3
import { type CameraState, clamp, type Vec3d } from '@sanpo/core';
import type { WalkSettings } from '../../api.ts';
import type { LookState } from './first-person-rig.ts';
import { forwardOf, rigQuat } from './free-rig.ts';

/** 휠 1노치당 거리 배율(위로 굴림 = 가까이). */
const ZOOM_PER_NOTCH = 0.85;
/** 지면 위 최소 카메라 높이(m). */
const MIN_CLEARANCE_M = 0.3;

export function zoomDistance(d: number, wheelNotches: number, tp: Readonly<WalkSettings['thirdPerson']>): number {
  return clamp(d * ZOOM_PER_NOTCH ** wheelNotches, tp.minDistanceM, tp.maxDistanceM);
}

/** 3인칭 카메라: 피벗 + 오른쪽 × 어깨 − 시선 × 거리. groundY를 알면 그 위 0.3 m 아래로 내려가지 않는다. */
export function thirdPersonCamera(
  out: CameraState,
  feet: Readonly<Vec3d>,
  feetY: number,
  look: Readonly<LookState>,
  distanceM: number,
  w: Readonly<WalkSettings>,
  groundY: number | undefined,
): void {
  const tp = w.thirdPerson;
  const f = forwardOf(look.smYaw, look.smPitch);
  const rx = Math.cos(look.smYaw);
  const rz = -Math.sin(look.smYaw);
  out.posWF.x = feet.x + rx * tp.shoulderM - f.x * distanceM;
  out.posWF.y = feetY + tp.pivotHeightM - f.y * distanceM;
  out.posWF.z = feet.z + rz * tp.shoulderM - f.z * distanceM;
  if (groundY !== undefined) out.posWF.y = Math.max(out.posWF.y, groundY + MIN_CLEARANCE_M);
  rigQuat(out.quat, look.smYaw, look.smPitch);
}
