// 자오선 수렴각(도북 − 진북)과 방위각 보정. sim이 태양 방위를 도북 기준으로 바꿀 때 쓴다. see docs/01-architecture.md §7
import type { LonLat } from '../api.ts';
import { lonLatToPrj } from './transforms.ts';

// 중앙차분 간격(도). 1e-6° ≈ 0.11 m — 투영 곡률에 의한 오차는 1e-9° 미만, 반올림 오차는 ~1e-8° 수준.
const DIFF_STEP_DEG = 1e-6;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * 격자 수렴각 γ(도). 진북에서 도북까지 시계방향 +. IX계 중앙자오선(139°50′E) 서쪽은 음수
 * (MVP 구역 ≈ −0.08°). 투영 결과를 수치 미분해 PROJ `meridian_convergence`와 같은 값을 낸다.
 */
export function gridConvergenceDeg(ll: LonLat): number {
  const south = lonLatToPrj({ lon: ll.lon, lat: ll.lat - DIFF_STEP_DEG });
  const north = lonLatToPrj({ lon: ll.lon, lat: ll.lat + DIFF_STEP_DEG });
  // 진북 방향 벡터의 격자 방위각 = −γ.
  return -Math.atan2(north.easting - south.easting, north.northing - south.northing) * RAD_TO_DEG;
}

/** 진북 기준 방위각(도, 시계방향) → 도북 기준 방위각(도, [0, 360)). */
export function trueToGridAzimuthDeg(azTrueDeg: number, ll: LonLat): number {
  const az = (azTrueDeg - gridConvergenceDeg(ll)) % 360;
  return az < 0 ? az + 360 : az;
}
