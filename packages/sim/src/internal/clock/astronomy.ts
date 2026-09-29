// 천문(10 §2, 01 §7): suncalc 2.x(도 단위, 방위 = 진북 기준 시계방향, 고도 = 대기차 보정 겉보기) → 도북 방위(수렴각 보정) → WF 단위 벡터.
// render는 이 벡터만 소비한다(태양·달 계산 없음).
import type { Vec3 } from '@sanpo/core';
import { type LonLat, trueToGridAzimuthDeg } from '@sanpo/geo';
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';

export interface BodyPosition {
  /** 진북 기준 방위(도, 시계방향). */
  azTrueDeg: number;
  /** 도북 기준 방위(도). */
  azGridDeg: number;
  /** 겉보기 고도(도). */
  elDeg: number;
  /** → 천체, WF 단위 벡터(+X 동, +Y 위, −Z 도북). */
  dirWF: Vec3;
}

const DEG = Math.PI / 180;

export function dirWFFromGrid(azGridDeg: number, elDeg: number): Vec3 {
  const az = azGridDeg * DEG;
  const el = elDeg * DEG;
  return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
}

function toBody(azTrueDeg: number, elDeg: number, ll: LonLat): BodyPosition {
  const azGridDeg = trueToGridAzimuthDeg(azTrueDeg, ll);
  return { azTrueDeg, azGridDeg, elDeg, dirWF: dirWFFromGrid(azGridDeg, elDeg) };
}

export function sunPosition(ms: number, ll: LonLat): BodyPosition {
  const p = getPosition(new Date(ms), ll.lat, ll.lon);
  return toBody(p.azimuth, p.altitude, ll);
}

/** 달 위치 + 위상(0 = 삭, 0.5 = 망). */
export function moonPosition(ms: number, ll: LonLat): BodyPosition & { phase: number } {
  const p = getMoonPosition(new Date(ms), ll.lat, ll.lon);
  const ill = getMoonIllumination(new Date(ms));
  return { ...toBody(p.azimuth, p.altitude, ll), phase: ill.phase };
}

/**
 * 맑은 하늘 수평면 태양 조도(lux) 근사 — 오디오·UI·밤 판정용(렌더 조명은 대기 모델이 따로 계산).
 * E = 128 000 · exp(−0.2 · AM) · sin(el), AM = Kasten–Young 대기 질량. 지평선 아래 0.
 */
export function clearSkyIlluminanceLux(elDeg: number): number {
  if (elDeg <= 0) return 0;
  const am = 1 / (Math.sin(elDeg * DEG) + 0.50572 * (elDeg + 6.07995) ** -1.6364);
  return 128_000 * Math.exp(-0.2 * am) * Math.sin(elDeg * DEG);
}
