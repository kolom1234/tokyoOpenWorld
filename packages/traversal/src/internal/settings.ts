// traversal 기본 설정(09 §2 freecam, §3 리그). 오버라이드는 createTraversal 옵션 → mergeConfig. see docs/09-traversal.md
import type { TraversalSettings } from '../api.ts';

export const DEFAULT_TRAVERSAL_SETTINGS: TraversalSettings = {
  lookRadPerPx: 0.0025,
  // 09 §3 FirstPersonRig 기본 FOV 70°(수직).
  fovDeg: 70,
  // 07 §1 근평면 0.1 m.
  nearM: 0.1,
  freecam: {
    dampingPerS: 3,
    // 09 §2: 속도 휠 0.5–60 m/s, 고도 상한 1,000 m.
    minSpeedMs: 0.5,
    maxSpeedMs: 60,
    startSpeedMs: 15,
    speedStepPerNotch: 1.25,
    sprintMultiplier: 4,
    maxAltitudeM: 1000,
    minClearanceM: 1,
  },
};
