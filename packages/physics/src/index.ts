// @sanpo/physics 공개 엔트리(L2): Jolt 워커 물리. api.ts 재수출 + create* 팩토리만. see docs/modules/physics.md
export * from './api.ts';
export { createInlineTransport } from './internal/inline-transport.ts';
export { anchorOf, createPhysics, DEFAULT_PHYSICS_CONFIG, PHYSICS_PHASE } from './internal/service.ts';
