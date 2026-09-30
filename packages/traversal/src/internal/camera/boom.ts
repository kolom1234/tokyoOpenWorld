// 3인칭 카메라 붐 충돌(09 §3 ThirdPersonRig, M04-T05, ADR-0045): 피벗 → 카메라 방향 sphereCast(반경 0.2 m, 워커 — 비동기 ≈ 1프레임).
// 3인칭 카메라 회전은 프레임당 최대 8°(STEP) → 다음 프레임 방향은 이번 프레임 방향 ±8° 안. 그래서 매 프레임 그 범위를 덮는 부채꼴 5개
// (가운데·yaw ±8°·pitch ±8°)를 쏘고 가장 짧은 한계를 쓴다 → 결과가 한 프레임 늦어도 카메라가 가는 방향은 이미 검사됨. 당기기는 즉시, 풀기는 초당 4 m.
import type { Vec3d } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';
import type { Boom } from './third-person-rig.ts';

/** 카메라 구 반경(m) — 근평면 0.1 m보다 커서 피벗 이동 1프레임(≤ 8 cm)을 덮는다. */
export const CAMERA_RADIUS_M = 0.2;
/** 3인칭 카메라 프레임당 최대 회전(rad). */
export const MAX_STEP_RAD = (8 * Math.PI) / 180;
const MARGIN_M = 0.05;
const MIN_BOOM_M = 0.25;
const OUT_MS = 4;

export interface BoomState {
  pending: boolean;
  valid: boolean;
  /** 마지막 부채꼴의 가운데 시선(yaw, pitch)·허용 길이. */
  yaw: number;
  pitch: number;
  limit: number;
  /** 지금 적용 중인 길이. */
  applied: number;
  /** 질의 세대(재배치·시점 전환 뒤 옛 결과 무시). */
  gen: number;
}

export function createBoomState(): BoomState {
  return { pending: false, valid: false, yaw: 0, pitch: 0, limit: 0, applied: MIN_BOOM_M, gen: 0 };
}

export function resetBoom(b: BoomState): void {
  b.gen++;
  b.pending = false;
  b.valid = false;
  b.applied = MIN_BOOM_M;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** 목표 쪽으로 프레임당 최대 STEP만 도는 3인칭 시선. */
export function stepToward(cur: number, target: number, wrapAngle: boolean): number {
  const d = wrapAngle ? wrap(target - cur) : target - cur;
  return cur + Math.max(-MAX_STEP_RAD, Math.min(MAX_STEP_RAD, d));
}

/**
 * 대기 중인 질의가 없으면 (yaw, pitch) 가운데 부채꼴 5개 붐을 쏜다. boomAt(yaw, pitch) = 그 시선의 붐(피벗·방향·길이).
 * 결과 = 붐마다 (맞으면 거리 − 여유, 아니면 길이)의 최솟값.
 */
export function requestBoom(
  b: BoomState,
  physics: Pick<PhysicsService, 'sphereCast'>,
  yaw: number,
  pitch: number,
  boomAt: (yaw: number, pitch: number) => Readonly<Boom>,
): void {
  if (b.pending) return;
  b.pending = true;
  const gen = b.gen;
  const s = MAX_STEP_RAD;
  const fan: [number, number][] = [
    [yaw, pitch],
    [yaw + s, pitch],
    [yaw - s, pitch],
    [yaw, pitch + s],
    [yaw, pitch - s],
  ];
  const casts = fan.map(([y, p]) => {
    const boom = boomAt(y, p);
    const pivot: Vec3d = { ...boom.pivot };
    const len = boom.len;
    return physics
      .sphereCast(pivot, { ...boom.dir }, CAMERA_RADIUS_M, len)
      .then((hit) => (hit ? Math.max(MIN_BOOM_M, hit.distance - MARGIN_M) : len));
  });
  Promise.all(casts).then(
    (limits) => {
      if (gen !== b.gen) return;
      b.pending = false;
      b.valid = true;
      b.yaw = yaw;
      b.pitch = pitch;
      b.limit = Math.min(...limits);
    },
    () => {
      if (gen === b.gen) b.pending = false;
    },
  );
}

/**
 * 이번 프레임 붐 길이: 시선이 마지막 부채꼴(±STEP) 안이면 그 한계, 두 스텝 안이면 한계·지금 길이 중 짧은 쪽, 그 밖(결과가 여러 프레임 늦음)이면 최소 길이.
 * 당기기는 즉시·풀기는 초당 4 m.
 */
export function boomLength(b: BoomState, yaw: number, pitch: number, desired: number, dt: number): number {
  let allowed = MIN_BOOM_M;
  if (b.valid) {
    const off = Math.max(Math.abs(wrap(yaw - b.yaw)), Math.abs(pitch - b.pitch));
    if (off <= MAX_STEP_RAD + 1e-6) allowed = Math.min(desired, b.limit);
    else if (off <= 2 * MAX_STEP_RAD) allowed = Math.min(desired, b.limit, b.applied);
  }
  b.applied = allowed <= b.applied ? allowed : Math.min(allowed, b.applied + OUT_MS * dt);
  return b.applied;
}
