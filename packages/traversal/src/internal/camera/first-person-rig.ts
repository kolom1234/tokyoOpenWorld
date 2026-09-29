// FirstPersonRig(09 §3): 눈 = 발 + 눈높이(연석·계단 높이 변화는 스무딩) + 헤드밥(걸음 주기 수직·반주기 측면), 시선 스무딩. 순수 계산. see docs/09-traversal.md §3
import type { CameraState, Vec3d } from '@sanpo/core';
import type { WalkSettings } from '../../api.ts';
import { clampPitch, rigQuat } from './free-rig.ts';

/** 걸음 주기(Hz) = 속도 / 보폭 0.7 m, 최대 3 Hz(달리기). */
const STRIDE_M = 0.7;
const MAX_CADENCE_HZ = 3;
/** 이 이상 높이 변화(순간이동·낙하 착지)는 스무딩 없이 따라간다. */
const SNAP_M = 0.6;
/** 헤드밥 진폭 배율 상한(속도 / 걷기 1.35). */
const MAX_BOB_SCALE = 1.5;
const WALK_REF_MS = 1.35;

export interface LookState {
  /** 목표(입력 누적) 방향. */
  yawRad: number;
  pitchRad: number;
  /** 스무딩된 방향(카메라). */
  smYaw: number;
  smPitch: number;
}

export interface FirstPersonState {
  /** 걸음 위상(걸음 수, 연속). */
  stepPhase: number;
  /** 스무딩된 발 높이(WF y). NaN = 아직 없음. */
  feetY: number;
}

export function createLookState(yawRad: number, pitchRad: number): LookState {
  const p = clampPitch(pitchRad);
  return { yawRad, pitchRad: p, smYaw: yawRad, smPitch: p };
}

export function createFirstPersonState(): FirstPersonState {
  return { stepPhase: 0, feetY: Number.NaN };
}

/** 입력(rad) 누적 + 지수 스무딩(시간 상수 tau). yaw는 감긴 차이로 따라간다. */
export function stepLook(s: LookState, dYaw: number, dPitch: number, dt: number, tau: number): void {
  s.yawRad += dYaw;
  s.pitchRad = clampPitch(s.pitchRad + dPitch);
  const k = tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
  s.smYaw += (s.yawRad - s.smYaw) * k;
  s.smPitch += (s.pitchRad - s.smPitch) * k;
  // 감긴 값이 커지지 않게 같은 만큼 되돌린다(차이는 보존).
  if (Math.abs(s.yawRad) > 4 * Math.PI) {
    const wrap = Math.round(s.yawRad / (2 * Math.PI)) * 2 * Math.PI;
    s.yawRad -= wrap;
    s.smYaw -= wrap;
  }
}

/** 발 높이 스무딩: 지면 위 작은 변화(연석 0.15 m)는 비율 perS로, 공중·큰 변화는 즉시. */
export function followFeet(s: FirstPersonState, y: number, grounded: boolean, dt: number, perS: number): number {
  if (!Number.isFinite(s.feetY) || !grounded || Math.abs(y - s.feetY) > SNAP_M) s.feetY = y;
  else s.feetY += (y - s.feetY) * (1 - Math.exp(-perS * dt));
  return s.feetY;
}

/** 헤드밥 오프셋(수직·측면 m). 수평 속력으로 걸음 위상을 진행. */
export function headBob(s: FirstPersonState, speedMs: number, dt: number, w: Readonly<WalkSettings>): [number, number] {
  if (!w.headBob || speedMs < 0.05) {
    s.stepPhase = 0;
    return [0, 0];
  }
  s.stepPhase += Math.min(speedMs / STRIDE_M, MAX_CADENCE_HZ) * dt;
  const amp = Math.min(speedMs / WALK_REF_MS, MAX_BOB_SCALE);
  const v = w.bobVerticalM * amp * Math.sin(2 * Math.PI * s.stepPhase);
  const l = w.bobLateralM * amp * Math.sin(Math.PI * s.stepPhase);
  return [v, l];
}

/** 1인칭 카메라: 눈 = (x, 스무딩 발 y + 눈높이 + 밥, z) + 측면 밥(오른쪽 축). */
export function firstPersonCamera(
  out: CameraState,
  feet: Readonly<Vec3d>,
  feetY: number,
  look: Readonly<LookState>,
  bob: readonly [number, number],
  w: Readonly<WalkSettings>,
): void {
  const rx = Math.cos(look.smYaw);
  const rz = -Math.sin(look.smYaw);
  out.posWF.x = feet.x + rx * bob[1];
  out.posWF.y = feetY + w.eyeHeightM + bob[0];
  out.posWF.z = feet.z + rz * bob[1];
  rigQuat(out.quat, look.smYaw, look.smPitch);
}
