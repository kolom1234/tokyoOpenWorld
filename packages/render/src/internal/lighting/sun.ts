// 태양 방향 규약(WF: +X 동, +Y 위, −Z 도북) + 기본값. 방향은 계산하지 않고 sim(EnvironmentState.sunDirWF)에서 받는다 — 연결 전 기본 방향만 여기.
// 광원 자체는 대기 라이트(lighting/atmosphere.ts, M03-T02). see docs/07-rendering.md §6
import { type Vec3, vec3Normalize } from '@sanpo/core';

/** sim 연결 전 기본 태양 방향(→ 태양, WF): 남남서 방위 200°, 고도 50°. */
export const DEFAULT_SUN_DIR_WF: Readonly<Vec3> = sunDirFromAzEl(200, 50);
/** 기본 달 방향: 지평선 아래(보이지 않음). */
export const DEFAULT_MOON_DIR_WF: Readonly<Vec3> = sunDirFromAzEl(20, -30);

/** 방위(북=0°, 동=90°, 도북 기준)·고도 → 태양을 향하는 단위 벡터(WF: +X 동, +Y 위, −Z 북). */
export function sunDirFromAzEl(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return vec3Normalize(
    { x: 0, y: 0, z: 0 },
    { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) },
  );
}
