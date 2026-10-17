// drive 조작 순수 함수(M08-T01): 운전자 입력(가속·제동·후진·정지 유지), 키보드 조향 램프, 기어 표시, 차 방위, 운전석 문 앞 탑승 판정.
import { type Quat, type Vec3d, vec3ApplyQuat } from '@sanpo/core';
import type { VehicleInput, VehicleState } from '@sanpo/physics';
import type { EnterableVehicle } from '../../api.ts';

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
    // 차 로컬 (x, z) → WF: x' = x·c + z·s, z' = z·c − x·s(yaw +Y 반시계).
    const lx = side * 1.25;
    const lz = -0.35;
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
export function driverInput(fwd: number, speedMs: number, steer: number, handbrake: boolean): VehicleInput {
  const out: VehicleInput = { throttle: 0, brake: 0, steer, handbrake, reverse: false };
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

export function gearLabel(s: Readonly<VehicleState> | undefined): string {
  if (!s) return 'N';
  if (s.gear < 0) return 'R';
  return s.gear === 0 ? 'N' : String(s.gear);
}
