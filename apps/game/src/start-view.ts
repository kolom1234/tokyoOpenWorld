// 시작 시점(M01-T06): 스크램블 교차로 북서쪽 상공 약 60 m에서 Shibuya Scramble Square를 바라본다. 골든뷰 북마크(M03)가 생기면 그쪽으로 이동.
import type { GroundQuery, Vec3d } from '@sanpo/core';
import { type FreecamParams, lookAtAngles } from '@sanpo/traversal';

/** 시점 xz: 스크램블 교차로 WF(−22.3, 8.6)(01-architecture §7)에서 북서로 약 45 m — 교차로와 타워가 한 화면에 들어오게. */
export const START_EYE_XZ_WF = { x: -60, z: -15 } as const;
/** 지면 위 높이(m). */
export const START_HEIGHT_AGL_M = 60;
/**
 * 바라볼 점: world-mini L0_0_0 최고 건물(Shibuya Scramble Square) bbox 중심 xz, 높이는 지면(TP 14.6 m)과 지붕(TP 245.6 m)의 중간.
 * 값 출처: 픽스처 buildings.mesh(_BLDG = 최고 measuredHeight 건물)의 정점 bbox — WF x 90.9–170.6, z 91.1–173.9.
 */
export const SCRAMBLE_SQUARE_LOOK_WF: Readonly<Vec3d> = { x: 130.8, y: 130, z: 132.5 };
/** 지면을 아직 모를 때(셀 미적재) 쓰는 스크램블 교차로 부근 표고(TP m, M01-T03 GSI 측정 ≈ 15 m). */
const FALLBACK_GROUND_M = 15;

export function startFreecamPose(ground: GroundQuery): FreecamParams {
  const { x, z } = START_EYE_XZ_WF;
  const posWF = { x, y: (ground.groundHeightAt(x, z) ?? FALLBACK_GROUND_M) + START_HEIGHT_AGL_M, z };
  return { posWF, ...lookAtAngles(posWF, SCRAMBLE_SQUARE_LOOK_WF) };
}
