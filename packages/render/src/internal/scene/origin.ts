// 렌더 원점 재설정 순수 계산: 판정(거리 ≥ 2048 m), 256 m 격자 스냅, 노드 위치 = WF − renderOrigin(float64 → 대입 시 float32). see docs/01-architecture.md §7, docs/07-rendering.md §2
import type { Vec3d } from '@sanpo/core';

/** 수평·수직 모두 포함한 3D 거리로 판정(고고도 비행도 정밀도 손실 요인). */
export function needsRebase(cameraWF: Readonly<Vec3d>, originWF: Readonly<Vec3d>, distanceM: number): boolean {
  const dx = cameraWF.x - originWF.x;
  const dy = cameraWF.y - originWF.y;
  const dz = cameraWF.z - originWF.z;
  return dx * dx + dy * dy + dz * dz >= distanceM * distanceM;
}

/** 새 원점: 카메라 위치를 격자에 스냅(x·z만, y = 0 — 지형 고도 범위가 작아 수직 스냅 불필요). */
export function snapOrigin(out: Vec3d, cameraWF: Readonly<Vec3d>, gridM: number): Vec3d {
  out.x = Math.round(cameraWF.x / gridM) * gridM;
  out.y = 0;
  out.z = Math.round(cameraWF.z / gridM) * gridM;
  return out;
}

/**
 * 렌더 좌표 = WF − renderOrigin. 항상 원본 WF(float64)에서 새로 계산한다(누적 이동 금지 — 모듈 카드 불변식).
 * three의 Object3D.position은 JS number(float64)지만 GPU 행렬은 float32이므로 원점 근처 값만 정밀하다.
 */
export function toRender(out: { x: number; y: number; z: number }, wf: Readonly<Vec3d>, originWF: Readonly<Vec3d>) {
  out.x = wf.x - originWF.x;
  out.y = wf.y - originWF.y;
  out.z = wf.z - originWF.z;
  return out;
}
