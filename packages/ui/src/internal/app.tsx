// UI 루트: 화면 스택(boot → title|hud, hud 위에 pause·settings·…), 언어·배율 적용, 메뉴 동안 게임 일시정지(bridge.commands.pause), 내비게이션 드라이버.
import { computed, effect, type ReadonlySignal, type Signal, signal } from '@preact/signals';
import { render } from 'preact';
import type { ScreenId, UiBridge, UiHandle, UiOptions } from '../api.ts';
import { lang } from './i18n/t.ts';
import { createNav, type NavHandlers } from './nav/nav.ts';
import { BootScreen } from './screens/boot.tsx';
import { CreditsScreen } from './screens/credits.tsx';
import { FadeLayer, HudLayer } from './screens/hud.tsx';
import { LogScreen } from './screens/log.tsx';
import { MapScreen } from './screens/map.tsx';
import { PauseScreen, type ScreenNav, TitleScreen } from './screens/menus.tsx';
import { PhotoScreen } from './screens/photo.tsx';
import { SETTINGS_TABS, SettingsScreen, type SettingsTab } from './screens/settings.tsx';
import { injectTheme } from './theme.ts';

/** 화면 스택 규칙(순수 — 테스트). */
export function nextStack(
  stack: readonly ScreenId[],
  op: 'push' | 'back' | 'play' | 'title',
  s?: ScreenId,
): ScreenId[] {
  const top = stack[stack.length - 1];
  switch (op) {
    case 'push':
      if (!s || top === s || top === 'boot') return [...stack];
      return [...stack, s];
    case 'back':
      if (stack.length <= 1 || top === 'hud' || top === 'title' || top === 'boot') return [...stack];
      return stack.slice(0, -1);
    case 'play':
      return ['hud'];
    case 'title':
      return ['title'];
  }
}

/** 게임이 돌아가는(입력을 받는) 화면인가 — 포토 모드는 자유 카메라를 움직인다(시계는 게임이 멈춘다). */
export const isPlaying = (s: ScreenId): boolean => s === 'hud' || s === 'photo';

function App(p: {
  bridge: UiBridge;
  stack: Signal<ScreenId[]>;
  nav: ScreenNav;
  tab: Signal<SettingsTab>;
  helpOpen: Signal<boolean>;
}) {
  const b = p.bridge;
  const stack = p.stack.value;
  const top = stack[stack.length - 1] ?? 'boot';
  const hud = b.hud.value;
  const pad = hud.gamepad;
  return (
    <div class="ui-root" data-top={top} data-lang={lang.value}>
      {top === 'boot' ? <BootScreen loading={b.loading.value} /> : null}
      {top === 'hud' ? <HudLayer bridge={b} hud={hud} settings={b.settings.value} helpOpen={p.helpOpen.value} /> : null}
      {top === 'title' ? <TitleScreen bridge={b} nav={p.nav} pad={pad} /> : null}
      {top === 'pause' ? <PauseScreen nav={p.nav} pad={pad} /> : null}
      {top === 'settings' ? (
        <SettingsScreen
          bridge={b}
          back={p.nav.back}
          pad={pad}
          tab={p.tab.value}
          setTab={(k) => {
            p.tab.value = k;
          }}
        />
      ) : null}
      {top === 'credits' ? <CreditsScreen bridge={b} back={p.nav.back} pad={pad} /> : null}
      {top === 'log' ? <LogScreen bridge={b} back={p.nav.back} pad={pad} /> : null}
      {top === 'photo' ? <PhotoScreen bridge={b} back={p.nav.back} pad={pad} /> : null}
      {top === 'map' ? (
        <MapScreen
          bridge={b}
          back={p.nav.back}
          pad={pad}
          travel={(id) => {
            p.nav.play();
            void b.commands.fastTravel(id);
          }}
        />
      ) : null}
      <FadeLayer fade={hud.fade} />
    </div>
  );
}

export function mountUi(root: HTMLElement, bridge: UiBridge, opts: UiOptions = { menus: true }): UiHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView as Window;
  injectTheme(doc);
  const stack = signal<ScreenId[]>([...(opts.initial ?? ['boot'])]);
  const tab = signal<SettingsTab>('graphics');
  const helpOpen = signal(true);
  const screen = computed<ScreenId>(() => stack.value[stack.value.length - 1] ?? 'boot');
  const go = (op: Parameters<typeof nextStack>[1], s?: ScreenId) => {
    stack.value = nextStack(stack.value, op, s);
  };
  const nav: ScreenNav = {
    push: (s) => go('push', s),
    back: () => go('back'),
    play: () => go('play'),
    toTitle: () => go('title'),
  };
  const offs = uiEffects(root, bridge, opts, stack, screen);
  const driver = createNav(win, navHandlers(root, screen, go, tab));
  render(<App bridge={bridge} stack={stack} nav={nav} tab={tab} helpOpen={helpOpen} />, root);
  return {
    screen,
    open: (s) => {
      if (screen.peek() === 'hud') go('push', s);
    },
    close: () => go('play'),
    toggleHelp: () => {
      helpOpen.value = !helpOpen.peek();
    },
    dispose() {
      for (const off of offs) off();
      driver.dispose();
      render(null, root);
    },
  };
}

/** 로딩 끝 → 타이틀|HUD, 언어·배율, 메뉴 = 게임 일시정지. */
function uiEffects(
  root: HTMLElement,
  bridge: UiBridge,
  opts: UiOptions,
  stack: Signal<ScreenId[]>,
  screen: ReadonlySignal<ScreenId>,
): (() => void)[] {
  const doc = root.ownerDocument;
  return [
    effect(() => {
      if (bridge.loading.value.stage === 'ready' && stack.peek()[0] === 'boot')
        stack.value = [opts.menus ? 'title' : 'hud'];
    }),
    effect(() => {
      const s = bridge.settings.value;
      lang.value = s.lang;
      doc.documentElement.lang = s.lang;
      root.style.setProperty('--ui-scale', String(s.uiScale));
    }),
    effect(() => {
      const s = screen.value;
      if (s !== 'boot') bridge.commands.pause(!isPlaying(s));
    }),
  ];
}

function navHandlers(
  root: HTMLElement,
  screen: ReadonlySignal<ScreenId>,
  go: (op: Parameters<typeof nextStack>[1], s?: ScreenId) => void,
  tab: Signal<SettingsTab>,
): NavHandlers {
  return {
    scope: () => root.querySelector<HTMLElement>('.screen[data-menu]'),
    back: () => {
      const top = screen.peek();
      if (top === 'pause') go('play');
      else go('back');
    },
    start: () => {
      const top = screen.peek();
      if (top === 'pause') go('play');
      else if (top !== 'title') go('back');
    },
    tab: (d) => {
      if (screen.peek() !== 'settings') return;
      const i = SETTINGS_TABS.indexOf(tab.peek());
      tab.value = SETTINGS_TABS[(i + d + SETTINGS_TABS.length) % SETTINGS_TABS.length] as SettingsTab;
    },
  };
}
