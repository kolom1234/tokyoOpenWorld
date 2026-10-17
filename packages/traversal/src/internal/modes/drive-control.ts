// drive 조작 순수 함수(M08-T01): 운전자 입력(가속·제동·후진·정지 유지), 키보드 조향 램프, 기어 표시, 차 방위, 운전석 문 앞 탑승 판정.
import { type Quat, type Vec3d, vec3ApplyQuat } from '@sanpo/core';
import type { VehicleInput, VehicleState } from '@sanpo/physics';
import type { EnterableVehicle, HazardCircle } from '../../api.ts';

/** 키보드 조향 램프(1/s): 꺾기·되돌리기. */
const STEER_IN_PER_S = 2.2;
const STEER_OUT_PER_S = 4;
/** 이 속력(m/s) 아래면 S = 후진, F = 하차 가능. */
export const STOP_MS = 0.6;
/** 입력 없이 정지 상태 유지 제동. */
const HOLD_BRAKE = 0.3;

/** 운전석 문 앞 판정: 문 점(차 로컬 x = 쪽 × 1.25, z = −0.35)에서 이 거리(m) 안. */
const DOOR_REACH_M = 1.3;

/** walk 중 발이 운전석 문 앞이면 그 차(여러 대면 가장 가까운 것). */
export function entryTarget(
  list: ReadonlyArray<EnterableVehicle>,
  feet: Readonly<Vec3d>,
): EnterableVehicle | undefined {
  let best: EnterableVehicle | undefined;
  let bestD = DOOR_REACH_M;
  for (const v of list) {
    const side = v.driveSide === 'left' ? -1 : 1;
    const c = Math.cos(v.yawRad);
    const sn = Math.sin(v.yawRad);
    // 차 로컬 (x, z) → WF: x' = x·c + z·s, z' = z·c − x·s(yaw +Y 반시계). 자전거 = 옆 0.6 m(안장 옆).
    const lx = side * (v.kind === 'bicycle' ? 0.6 : 1.25);
    const lz = v.kind === 'bicycle' ? 0 : -0.35;
    const d = Math.hypot(v.posWF.x + lx * c + lz * sn - feet.x, v.posWF.z + lz * c - lx * sn - feet.z);
    if (d < bestD && Math.abs(v.posWF.y - feet.y) < 1.2) {
      best = v;
      bestD = d;
    }
  }
  return best;
}

/** 차 쿼터니언의 수평 방위(전방 −Z). */
export function yawOfCar(q: Readonly<Quat>): number {
  const f = vec3ApplyQuat({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, q);
  return Math.atan2(-f.x, -f.z);
}

/** 운전자 입력 → 차량 입력: 앞으로 가는 중 S = 제동, 멈추면 S = 후진(뒤로 가는 중 W = 제동). */
export function driverInput(
  fwd: number,
  speedMs: number,
  steer: number,
  handbrake: boolean,
  canReverse = true,
): VehicleInput {
  const out: VehicleInput = { throttle: 0, brake: 0, steer, handbrake, reverse: false };
  if (!canReverse && fwd < 0) {
    out.brake = -fwd;
    return out;
  }
  if (fwd > 0) {
    if (speedMs < -STOP_MS) out.brake = fwd;
    else out.throttle = fwd;
  } else if (fwd < 0) {
    if (speedMs > STOP_MS) out.brake = -fwd;
    else {
      out.throttle = -fwd;
      out.reverse = true;
    }
  } else if (Math.abs(speedMs) < STOP_MS) out.brake = HOLD_BRAKE;
  return out;
}

/** 키보드 축(−1·0·1)을 램프로. 아날로그 스틱도 같은 램프(급조향 완화). */
export function rampSteer(cur: number, target: number, dt: number): number {
  const rate =
    Math.abs(target) > Math.abs(cur) && Math.sign(target) === Math.sign(cur || target)
      ? STEER_IN_PER_S
      : STEER_OUT_PER_S;
  const d = target - cur;
  return Math.abs(d) <= rate * dt + 1e-9 ? target : cur + Math.sign(d) * rate * dt;
}

/** 기어 글자: 후진 R, 정지 N, 변속 중(Jolt 0)·전진 = 마지막 전진 기어(last). */
export function gearLabel(s: Readonly<VehicleState> | undefined, last: { gear: number }): string {
  if (!s) return 'N';
  if (s.gear < 0) return 'R';
  if (s.gear > 0) last.gear = s.gear;
  else if (Math.abs(s.speedMs) < 0.5) return 'N';
  return String(last.gear);
}

/**
 * 탈것 사양(M08-T01·T03): 바닥 반길이·반폭·최대 조향(deg)·휠베이스(m)·1인칭 눈(로컬, 오른쪽 x)·추적 카메라·하차 거리·보도 규칙·후진·방향지시등.
 * 보도: car = 언제나 maxMs, bicycle = 위험물(보행자)이 nearM 안일 때만 maxMs(08 §7 — 보도 주행 허용, 보행자 근접 서행 6 km/h).
 */
export interface RideSpec {
  halfLength: number;
  halfWidth: number;
  steerDeg: number;
  wheelbase: number;
  eye: readonly [number, number, number];
  chase: { distanceM: number; heightM: number; pivotHeightM: number };
  exitSideM: number;
  exitBackM: number;
  sidewalk: { maxMs: number; nearM?: number };
  reverse: boolean;
  indicators: boolean;
}

export const RIDE_SPECS: Readonly<Record<'sedan' | 'bicycle', RideSpec>> = {
  sedan: {
    halfLength: 2.25,
    halfWidth: 0.88,
    steerDeg: 35,
    wheelbase: 2.64,
    // 우핸들 운전석 눈(0.37, 1.30, −0.15) — 벨트라인 0.86·지붕 1.42 사이.
    eye: [0.37, 1.3, -0.15],
    chase: { distanceM: 5.5, heightM: 2.2, pivotHeightM: 1.6 },
    exitSideM: 1.7,
    exitBackM: 3.6,
    sidewalk: { maxMs: 10 / 3.6 },
    reverse: true,
    indicators: true,
  },
  bicycle: {
    halfLength: 0.9,
    halfWidth: 0.3,
    steerDeg: 30,
    wheelbase: 1.12,
    // 탄 사람 눈(안장 위 1.62 m, 핸들 쪽으로 조금).
    eye: [0, 1.62, 0.02],
    chase: { distanceM: 3.4, heightM: 2.1, pivotHeightM: 1.9 },
    exitSideM: 0.9,
    exitBackM: 1.6,
    sidewalk: { maxMs: 6 / 3.6, nearM: 6 },
    reverse: false,
    indicators: false,
  },
};

/** AEB(08 §6 — M08-T02): 반응 시간(s)·가정 감속(m/s² — 젖은 노면 쪽으로 보수적)·앞 여유(m)·옆 여유(m)·TTC(s). */
const AEB_REACT_S = 0.25;
const AEB_DECEL = 4.5;
const AEB_FRONT_MARGIN_M = 2;
const AEB_SIDE_MARGIN_M = 0.45;
const AEB_TTC_S = 1.5;
/** 이 속력(m/s) 아래는 정지로 본다. */
const AEB_MIN_MS = 0.3;

export interface AebCar {
  pos: Readonly<Vec3d>;
  yaw: number;
  /** 전방 + 속력(m/s). */
  speed: number;
  halfLength: number;
  halfWidth: number;
  /** 경로 곡률(1/m, 오른쪽 +) — 조향 각 ÷ 휠베이스 근사. */
  curvature: number;
}

/** 진행 방향 차체 앞(후진이면 뒤) 통로 안 가장 가까운 위험물까지 거리(m) — 없으면 ∞. */
export function hazardAhead(car: Readonly<AebCar>, list: readonly HazardCircle[]): number {
  const dir = car.speed >= 0 ? 1 : -1;
  const fx = -Math.sin(car.yaw);
  const fz = -Math.cos(car.yaw);
  let best = Number.POSITIVE_INFINITY;
  for (const h of list) {
    const dx = h.x - car.pos.x;
    const dz = h.z - car.pos.z;
    const along = (dx * fx + dz * fz) * dir - car.halfLength;
    if (along < -h.r) continue;
    // 오른쪽 = (−fz, fx).
    const lat = dx * -fz + dz * fx;
    const bend = (car.curvature * dir * Math.max(along, 0) ** 2) / 2;
    if (Math.abs(lat - bend) < car.halfWidth + h.r + AEB_SIDE_MARGIN_M) best = Math.min(best, Math.max(along - h.r, 0));
  }
  return best;
}

/** 지금 속력에서 멈춰야 하는 거리(정지 거리 + 여유 또는 TTC 1.5 s 중 큰 것). */
export function aebRange(speedMs: number): number {
  const v = Math.abs(speedMs);
  if (v < AEB_MIN_MS) return 0;
  return Math.max(v * AEB_REACT_S + (v * v) / (2 * AEB_DECEL) + AEB_FRONT_MARGIN_M, v * AEB_TTC_S);
}
