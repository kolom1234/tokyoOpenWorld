// `?sun=<방위>,<고도>`(도, 도북 기준 시계방향·지평선 위 +) → 태양 방향 고정(조명·대기 확인·골든 비교용). sim 환경 배선(M03-T03) 뒤에 실행해 덮어쓴다.
// see docs/modules/game.md
import type { EnvironmentState, GameSystem, Vec3 } from '@sanpo/core';

/** 01-architecture §5: renderPrep(70) 직전. */
const SUN_OVERRIDE_PHASE = 68;

export function parseSunFlag(v: string | null): { azDeg: number; elDeg: number } | undefined {
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v ?? '');
  if (!m) return undefined;
  const azDeg = Number(m[1]);
  const elDeg = Number(m[2]);
  return elDeg >= -90 && elDeg <= 90 ? { azDeg, elDeg } : undefined;
}

/** 방위·고도 → 태양을 향하는 WF 단위 벡터(+X 동, +Y 위, −Z 도북). */
export function dirFromAzEl(azDeg: number, elDeg: number): Vec3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return { x: Math.sin(az) * Math.cos(el), y: Math.sin(el), z: -Math.cos(az) * Math.cos(el) };
}

export function overrideEnvironment(azDeg: number, elDeg: number, now: number): EnvironmentState {
  const sun = dirFromAzEl(azDeg, elDeg);
  return {
    gameTimeMs: now,
    sunDirWF: sun,
    moonDirWF: { x: -sun.x, y: -sun.y, z: -sun.z },
    sunIlluminanceLux: 0,
    moonPhase: 0,
    weather: { cloudCover: 0, rainMmH: 0, fog: 0, windMs: 0, windDirDeg: 0, snow: 0 },
    season: { dayOfYear: 172, foliageTint: 0, bloom: 0, leafDensity: 1, outfitPalette: 0 },
    wind: { x: 0, y: 0, z: 0 },
  };
}

export function createSunOverride(
  target: { setEnvironment(e: Readonly<EnvironmentState>): void },
  sun: { azDeg: number; elDeg: number },
): GameSystem {
  return {
    id: 'debug/sunOverride',
    phase: SUN_OVERRIDE_PHASE,
    update(f) {
      target.setEnvironment(overrideEnvironment(sun.azDeg, sun.elDeg, f.gameTimeMs));
    },
    dispose() {},
  };
}
