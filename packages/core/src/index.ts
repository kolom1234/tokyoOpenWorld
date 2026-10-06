// @sanpo/core 공개 엔트리(L0): 공통 타입·이벤트버스·로거·rng·설정. api.ts 재수출 + 팩토리/순수 함수. see docs/modules/core.md
export * from './api.ts';
export { cellIdString, packCellKey, unpackCellKey } from './internal/cell-key.ts';
export { mergeConfig } from './internal/config.ts';
export { createEventBus } from './internal/event-bus.ts';
export { hash32 } from './internal/hash.ts';
export { createLogger } from './internal/logger.ts';
export {
  clamp,
  degToRad,
  lerp,
  quatCopy,
  quatFromAxisAngle,
  quatFromYaw,
  quatIdentity,
  quatMultiply,
  quatNormalize,
  quatSet,
  quatSlerp,
  radToDeg,
  vec3,
  vec3Add,
  vec3AddScaled,
  vec3ApplyQuat,
  vec3Copy,
  vec3Cross,
  vec3Distance,
  vec3DistanceSq,
  vec3Dot,
  vec3Length,
  vec3LengthSq,
  vec3Lerp,
  vec3Normalize,
  vec3Scale,
  vec3Set,
  vec3Sub,
} from './internal/math.ts';
export { computeRunProfile, profileAt, RAIL_STOP_EPS_M, timeAtS, tripLegs } from './internal/rail-profile.ts';
export { err, mapResult, ok, unwrapOr } from './internal/result.ts';
export { createRng } from './internal/rng.ts';
export { createScheduler, MAX_DT_REAL_S } from './internal/scheduler.ts';
export { createWorkerSupervisor } from './internal/worker-supervisor.ts';
