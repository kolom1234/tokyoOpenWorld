// streaming 기본 설정(06 §3–4, 07 §9 L0 반경 배율, ADR-0021). 오버라이드는 createStreaming deps.config → mergeConfig.
import type { StreamingConfig } from '../api.ts';

export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  interest: {
    // 06 §3. transition(빠른 이동 페이드)은 도보 기준 — 도착지는 whenReady가 따로 보장한다.
    l0RadiusByModeM: { walk: 384, cycle: 448, drive: 640, train: 768, freecam: 384, transition: 384 },
    freecamRadiusPerAltitudeM: 0.5,
    l0RadiusScaleByTier: { low: 0.75, medium: 1.0, high: 1.0, ultra: 1.25 },
    l0RadiusMaxM: 768,
    releaseFactor: 1.25,
    highAltitudeM: 300,
    highAltitudeLoadRing: 1,
    highAltitudeKeepRing: 2,
    l1RadiusM: 3000,
    l1RadiusPerAltitudeM: 1.0,
    l1RadiusMaxM: 3500,
    l2RadiusM: 12_000,
    trainBehindPenalty: 0.5,
    directionMinSpeedMs: 5,
  },
  priority: {
    inViewFactor: 0.5,
    viewHalfAngleDeg: 60,
    teleportFactor: 0.05,
    footScore: -1,
    parentEpsilon: 1e-3,
  },
  // L1 64 → 80: 고고도 R1 3.5 km의 해제 반경(4.375 km) 셀 수 최대 80(ADR-0021).
  residentMax: [72, 80, 64, 16],
  fetch: { maxConcurrent: 8, retries: 3, backoffMs: 250, cacheStorage: true },
  decode: { workers: 0, perWorker: 2, verifyHash: true },
};
