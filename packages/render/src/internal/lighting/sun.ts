// 방향광 1개(태양) + 반구광(하늘 산란 대용). 물리 광량·대기·CSM은 M03(07 §6). 태양 방향은 sim(EnvironmentState)이 오면 교체.
import { type Vec3, vec3Normalize } from '@sanpo/core';
import { DirectionalLight, HemisphereLight, type Object3D } from 'three/webgpu';

/** 임시 고정 태양 방향(→ 태양, WF): 남남서 방위 200°, 고도 50°. sim 연결(M06) 전까지. */
export const DEFAULT_SUN_DIR_WF: Readonly<Vec3> = sunDirFromAzEl(200, 50);
/** 톤매핑(AgX) 후 한낮처럼 보이는 임시 강도(물리 lux 아님 — M03 자동 노출에서 교체). */
const SUN_INTENSITY = 4;
const SKY_INTENSITY = 1.6;
const SKY_COLOR = 0xbfd8ff;
const GROUND_COLOR = 0x6b6358;
/** 광원 위치 거리(방향광이라 값 자체는 의미 없음, 타깃과 분리만). */
const LIGHT_DISTANCE_M = 1000;

/** 방위(북=0°, 동=90°, 도북 기준)·고도 → 태양을 향하는 단위 벡터(WF: +X 동, +Y 위, −Z 북). */
export function sunDirFromAzEl(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return vec3Normalize(
    { x: 0, y: 0, z: 0 },
    { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) },
  );
}

export interface SunRig {
  readonly sun: DirectionalLight;
  readonly objects: readonly Object3D[];
}

/** 광원은 렌더 원점 기준 방향만 쓰므로 원점 재설정에 영향받지 않는다(타깃 = 렌더 원점). */
export function createSunRig(dirWF: Readonly<Vec3> = DEFAULT_SUN_DIR_WF): SunRig {
  const sun = new DirectionalLight(0xfff4e5, SUN_INTENSITY);
  sun.name = 'sun';
  sun.position.set(dirWF.x * LIGHT_DISTANCE_M, dirWF.y * LIGHT_DISTANCE_M, dirWF.z * LIGHT_DISTANCE_M);
  const sky = new HemisphereLight(SKY_COLOR, GROUND_COLOR, SKY_INTENSITY);
  sky.name = 'sky-fill';
  return { sun, objects: [sun, sun.target, sky] };
}
