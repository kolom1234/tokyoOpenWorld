// ChaseRig(09 §3): 차량 뒤 distance·위 height, 방향 지연(차 진행 방향을 ω로 따라감)·위치 스프링(ω 6), 마우스로 둘러보기(손을 떼면 2 s 뒤 뒤로 복귀),
// 붐 충돌 = 3인칭과 같은 부채꼴 sphereCast(boom.ts — 결과 1프레임 늦음), 고속 FOV +5°(100 km/h). 순수 계산 — 물리 질의는 호출 측이 requestBoom.
import { type CameraState, type Quat, quatFromAxisAngle, quatMultiply, type Vec3d } from '@sanpo/core';
import type { Boom } from './third-person-rig.ts';

export interface ChaseSettings {
  distanceM: number;
  heightM: number;
  /** 위치 스프링 각진동수(rad/s). */
  positionOmega: number;
  /** 방향 지연 각진동수(rad/s). */
  yawOmega: number;
  /** 피벗 높이(차 바닥 위 m) — 카메라가 보는 점·붐 시작. */
  pivotHeightM: number;
  /** 이 속력(m/s)에서 FOV +fovBoostDeg. */
  fovBoostDeg: number;
  fovBoostAtMs: number;
  /** 둘러보기 뒤 복귀 대기(s). */
  recenterAfterS: number;
}

export const DEFAULT_CHASE: ChaseSettings = {
  distanceM: 5.5,
  // 09 §3 초안 1.6 m는 피벗 구(0.2 m)가 차체 충돌 상자(지붕 ≈ 1.1 m) 안에서 시작해 붐이 최소로 줄었다(M08-T01 실측) → 피벗 1.6 m·카메라 2.2 m.
  heightM: 2.2,
  positionOmega: 6,
  yawOmega: 4,
  pivotHeightM: 1.6,
  fovBoostDeg: 5,
  fovBoostAtMs: 100 / 3.6,
  recenterAfterS: 2,
};

export interface ChaseState {
  /** 지연된 진행 방위(yaw). */
  yaw: number;
  /** 둘러보기 오프셋(yaw·pitch, rad). */
  lookYaw: number;
  lookPitch: number;
  /** 마지막 둘러보기 뒤 경과(s). */
  idleS: number;
  pos: Vec3d;
  init: boolean;
}

export function createChaseState(): ChaseState {
  return { yaw: 0, lookYaw: 0, lookPitch: -0.12, idleS: 99, pos: { x: 0, y: 0, z: 0 }, init: false };
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** 지금 시선(진행 방위 + 둘러보기)의 붐: 피벗(차 위) → 카메라 방향. */
export function chaseBoom(car: Readonly<Vec3d>, yaw: number, pitch: number, s: ChaseSettings, out: Boom): Boom {
  out.pivot.x = car.x;
  out.pivot.y = car.y + s.pivotHeightM;
  out.pivot.z = car.z;
  const back = Math.cos(pitch);
  out.dir.x = Math.sin(yaw) * back;
  out.dir.y = Math.sin(-pitch) + (s.heightM - s.pivotHeightM) / s.distanceM;
  out.dir.z = Math.cos(yaw) * back;
  const n = Math.hypot(out.dir.x, out.dir.y, out.dir.z);
  out.dir.x /= n;
  out.dir.y /= n;
  out.dir.z /= n;
  out.len = Math.hypot(s.distanceM, s.heightM - s.pivotHeightM);
  return out;
}

/** 한 프레임: 진행 방위 지연·둘러보기 복귀 → 붐 길이(boomLen) 만큼 뒤에 카메라(위치 스프링) → 피벗을 본다. */
export function stepChase(
  st: ChaseState,
  car: { posWF: Readonly<Vec3d>; yawRad: number; speedMs: number },
  look: { dx: number; dy: number },
  boomLen: number,
  boom: Boom,
  s: ChaseSettings,
  dt: number,
  baseFovDeg: number,
  out: CameraState,
): void {
  if (look.dx !== 0 || look.dy !== 0) st.idleS = 0;
  else st.idleS += dt;
  st.lookYaw = wrap(st.lookYaw - look.dx);
  st.lookPitch = Math.max(-1.2, Math.min(0.5, st.lookPitch - look.dy));
  if (st.idleS > s.recenterAfterS) {
    const k = 1 - Math.exp(-3 * dt);
    st.lookYaw -= st.lookYaw * k;
    st.lookPitch += (-0.12 - st.lookPitch) * k;
  }
  st.yaw = st.init ? st.yaw + wrap(car.yawRad - st.yaw) * (1 - Math.exp(-s.yawOmega * dt)) : car.yawRad;
  chaseBoom(car.posWF, st.yaw + st.lookYaw, st.lookPitch, s, boom);
  const want = {
    x: boom.pivot.x + boom.dir.x * boomLen,
    y: boom.pivot.y + boom.dir.y * boomLen,
    z: boom.pivot.z + boom.dir.z * boomLen,
  };
  const k = st.init ? 1 - Math.exp(-s.positionOmega * dt) : 1;
  st.pos.x += (want.x - st.pos.x) * k;
  st.pos.y += (want.y - st.pos.y) * k;
  st.pos.z += (want.z - st.pos.z) * k;
  st.init = true;
  out.posWF.x = st.pos.x;
  out.posWF.y = st.pos.y;
  out.posWF.z = st.pos.z;
  lookAt(out.quat, out.posWF, boom.pivot);
  out.fovDeg = baseFovDeg + s.fovBoostDeg * Math.min(1, Math.abs(car.speedMs) / s.fovBoostAtMs);
}

const qa: Quat = { x: 0, y: 0, z: 0, w: 1 };
const qb: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** from → to를 보는 롤 없는 회전(yaw(Y) ⊗ pitch(X), 전방 −Z). */
export function lookAt(out: Quat, from: Readonly<Vec3d>, to: Readonly<Vec3d>): Quat {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  quatFromAxisAngle(qa, { x: 0, y: 1, z: 0 }, yaw);
  quatFromAxisAngle(qb, { x: 1, y: 0, z: 0 }, pitch);
  return quatMultiply(out, qa, qb);
}
