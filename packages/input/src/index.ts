// @sanpo/input 공개 엔트리(L2): 액션 맵(키보드/마우스; 게임패드는 M04-T03). api.ts 재수출 + create* 팩토리만. see docs/modules/input.md
export * from './api.ts';
export { DEFAULT_BINDINGS } from './internal/default-bindings.ts';
export { createInput } from './internal/service.ts';
