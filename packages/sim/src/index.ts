// @sanpo/sim 공개 엔트리(L3): 시계·날씨·군중·교통·열차. api.ts 재수출 + create* 팩토리만. see docs/modules/sim.md
export * from './api.ts';
export { createSim } from './internal/service.ts';
