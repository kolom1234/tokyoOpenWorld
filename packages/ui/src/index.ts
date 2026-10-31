// @sanpo/ui 공개 엔트리(L4): Preact HUD/메뉴/지도. api.ts 재수출 + mountUi·create* 팩토리 + 시그널(게임이 같은 인스턴스로 UiBridge를 만든다). see docs/modules/ui.md
export { batch, computed, effect, type ReadonlySignal, type Signal, signal } from '@preact/signals';
export * from './api.ts';
export { mountUi } from './internal/app.tsx';
export { DEFAULT_KEYS, keyLabel } from './internal/keys.ts';
export { createMockBridge } from './internal/sandbox/mock-bridge.ts';
export { SAVE_LIMITS, SaveImportError } from './internal/save/limits.ts';
export { migrateSave, parseSaveExport, readSaveExport, SAVE_VERSION } from './internal/save/migrations.ts';
export { DEFAULT_SETTINGS, langFromNavigator, normalizeSettings } from './internal/settings.ts';
