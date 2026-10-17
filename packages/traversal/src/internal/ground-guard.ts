// 발밑 셀 미적재 보호(08 §4 groundMissing, M04-T06): 발 아래 L0 셀 콜라이더가 없으면 제자리 고정(hold — 중력·이동 없음),
// 가려는 쪽(원하는 방향·지금 속도 방향)으로 제동 거리(v²/2·10 m/s²) + 0.6 m 앞 셀이 없으면 멈춤(stop). 셀 경계에서 기다렸다가 적재되면 계속 간다.
import type { Vec3, Vec3d } from '@sanpo/core';
import { cellOf } from '@sanpo/geo';
import type { PhysicsService } from '@sanpo/physics';

/** 08 §5 감속(m/s²). */
const DECEL = 10;
const MARGIN_M = 0.6;

export interface GroundGuard {
  hold: boolean;
  stop: boolean;
}

function loadedAhead(
  physics: Pick<PhysicsService, 'hasCell'>,
  feet: Readonly<Vec3d>,
  dx: number,
  dz: number,
  dist: number,
): boolean {
  const n = Math.hypot(dx, dz);
  if (n < 1e-6) return true;
  return physics.hasCell(cellOf(0, feet.x + (dx / n) * dist, feet.z + (dz / n) * dist));
}

export function groundGuard(
  physics: Pick<PhysicsService, 'hasCell'>,
  feet: Readonly<Vec3d>,
  want: { x: number; z: number },
  vel: Readonly<Vec3>,
): GroundGuard {
  if (!physics.hasCell(cellOf(0, feet.x, feet.z))) return { hold: true, stop: true };
  const speed = Math.max(Math.hypot(want.x, want.z), Math.hypot(vel.x, vel.z));
  const dist = (speed * speed) / (2 * DECEL) + MARGIN_M;
  const ok = loadedAhead(physics, feet, want.x, want.z, dist) && loadedAhead(physics, feet, vel.x, vel.z, dist);
  return { hold: false, stop: !ok };
}

/** 차(M08-T01): 제동 거리(v²/2·6 m/s² — 젖은 노면 여유) + 3 m 앞, 진행 방향 셀이 없으면 멈춤(스로틀 0·제동). */
const CAR_DECEL = 6;
const CAR_MARGIN_M = 3;
export function carGroundGuard(
  physics: Pick<PhysicsService, 'hasCell'>,
  pos: Readonly<Vec3d>,
  vel: Readonly<Vec3>,
): boolean {
  if (!physics.hasCell(cellOf(0, pos.x, pos.z))) return true;
  const v = Math.hypot(vel.x, vel.z);
  return !loadedAhead(physics, pos, vel.x, vel.z, (v * v) / (2 * CAR_DECEL) + CAR_MARGIN_M);
}
