// `?ui-sandbox=1` 스토리 페이지(M10-T01): 게임·렌더 없이 @sanpo/ui를 목 브리지로. `&screen=title|pause|settings|credits|hud|boot|map|log|photo`, `&lang=ko|ja|en`, `&pad=1`, `&scale=0.8–1.5`(UI 배율 — M11-T04 레이아웃 검사).
import { createMockBridge, type Lang, mountUi, type ScreenId } from '@sanpo/ui';

const SCREENS: readonly ScreenId[] = ['boot', 'title', 'hud', 'pause', 'settings', 'credits', 'map', 'log', 'photo'];

export function runUiSandbox(root: HTMLElement, q: URLSearchParams): void {
  document.body.classList.add('ui-sandbox');
  const lang = (['ko', 'ja', 'en'] as const).find((l) => l === q.get('lang')) as Lang | undefined;
  const screen = SCREENS.find((s) => s === q.get('screen'));
  const scale = Number(q.get('scale'));
  const settings = { ...(lang ? { lang } : {}), ...(scale >= 0.8 && scale <= 1.5 ? { uiScale: scale } : {}) };
  const bridge = createMockBridge({ settings, ready: screen !== 'boot' });
  if (q.get('pad') === '1') bridge.hudSignal.value = { ...bridge.hudSignal.value, gamepad: true };
  const initial: ScreenId[] =
    screen === undefined || screen === 'boot' || screen === 'title' || screen === 'hud'
      ? [screen ?? 'boot']
      : ['hud', screen];
  const ui = mountUi(root, bridge, { menus: true, initial });
  Object.assign(globalThis, { __SANPO_UI__: { bridge, ui } });
  document.body.dataset.uiSandbox = 'ready';
}
