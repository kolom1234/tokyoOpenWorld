// walk 착지점: 후보(기준점 → 6·12·24·48 m 링 × 8방위)마다 하늘(1,200 m)에서 수직 레이 → 첫 충돌이 TERRAIN(지면)인 가장 앞 후보.
// 지붕·건물 안(PLATEAU 셸 내부)·고가 아래에는 놓지 않는다. 콜라이더가 아직 없으면 undefined(호출 측이 재시도). see docs/09-traversal.md §2 walk
import type { Vec3, Vec3d } from '@sanpo/core';
import type { PhysicsService } from '@sanpo/physics';

/** 08 §3 ObjectLayer TERRAIN. */
export const TERRAIN_LAYER = 1;
const RING_RADII_M = [6, 12, 24, 48] as const;
const DIRECTIONS = 8;
/** 레이 시작 높이(WF y — MVP 최고층 ≈ 250 m 위)·길이. */
const SKY_Y = 1200;
const MAX_DIST_M = 1500;
/** 발을 지면 위에 살짝 띄워 놓는다(첫 스텝에 붙는다). */
const LIFT_M = 0.02;
const DOWN: Readonly<Vec3> = { x: 0, y: -1, z: 0 };

export function spotCandidates(center: Readonly<Vec3d>): Vec3d[] {
  const out: Vec3d[] = [{ x: center.x, y: SKY_Y, z: center.z }];
  for (const r of RING_RADII_M) {
    for (let i = 0; i < DIRECTIONS; i++) {
      const a = (i / DIRECTIONS) * 2 * Math.PI;
      out.push({ x: center.x + Math.cos(a) * r, y: SKY_Y, z: center.z + Math.sin(a) * r });
    }
  }
  return out;
}

export async function findStreetSpot(
  physics: Pick<PhysicsService, 'raycast'>,
  center: Readonly<Vec3d>,
): Promise<Vec3d | undefined> {
  const cands = spotCandidates(center);
  const hits = await Promise.all(cands.map((c) => physics.raycast(c, DOWN, MAX_DIST_M)));
  for (const hit of hits) {
    if (hit?.layer === TERRAIN_LAYER) return { x: hit.posWF.x, y: hit.posWF.y + LIFT_M, z: hit.posWF.z };
  }
  return undefined;
}
