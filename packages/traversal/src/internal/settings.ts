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
  walk: {
    // 08 §5: 걷기 1.35 · 빠른 걸음 1.8 · 조깅 3.0, 달리기 5.0 m/s.
    paceSpeedsMs: [1.35, 1.8, 3.0],
    sprintMs: 5.0,
    // 09 §3 FirstPersonRig: 눈높이 1.60 m, 헤드밥 수직 1.2 cm·측면 0.6 cm, 룩 스무딩 30 ms.
    eyeHeightM: 1.6,
    headBob: true,
    bobVerticalM: 0.012,
    bobLateralM: 0.006,
    lookSmoothingS: 0.03,
    eyeFollowPerS: 12,
    // 09 §3 ThirdPersonRig: 어깨 0.4 m, 거리 3.5 m(휠 1.5–6).
    thirdPerson: { shoulderM: 0.4, distanceM: 3.5, minDistanceM: 1.5, maxDistanceM: 6, pivotHeightM: 1.55 },
    returnToBodyM: 150,
    view: 'first',
  },
};
