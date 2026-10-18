// 타이틀(이어하기·새 산책(시작 지점)·설정·크레딧)과 일시정지(계속·지도·도감·포토·설정·타이틀로) 메뉴.
import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ScreenId, UiBridge } from '../../api.ts';
import { MenuButton, NavHint } from '../components/controls.tsx';
import { pick, t } from '../i18n/t.ts';
import { focusFirst } from '../nav/nav.ts';

export interface ScreenNav {
  push(s: ScreenId): void;
  back(): void;
  /** 게임으로(HUD). */
  play(): void;
  toTitle(): void;
}

/** 메뉴 화면 공통 틀: 열릴 때(그리고 key가 바뀔 때) 첫 컨트롤에 포커스. */
export function MenuScreen(p: {
  id: ScreenId;
  focusKey?: string;
  class?: string;
  pad: boolean;
  children: ComponentChildren;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 레이아웃 효과 = 렌더 직후 동기(useEffect는 rAF 뒤라 렌더가 무거우면 포커스가 늦게 온다 — CI SwiftShader 실측).
  useLayoutEffect(() => {
    if (ref.current) focusFirst(ref.current);
  }, [p.focusKey]);
  return (
    <div ref={ref} class={`screen menu ${p.class ?? ''}`} data-screen={p.id} data-menu>
      {p.children}
      <NavHint pad={p.pad} />
    </div>
  );
}

export function TitleScreen(p: { bridge: UiBridge; nav: ScreenNav; pad: boolean }) {
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = (choice: Parameters<UiBridge['commands']['start']>[0]) => {
    setBusy(true);
    void p.bridge.commands
      .start(choice)
      .then(() => p.nav.play())
      .finally(() => setBusy(false));
  };
  return (
    <MenuScreen id="title" class="title" focusKey={picking ? 'pick' : 'main'} pad={p.pad}>
      <h1 class="logo big">
        TOKYO SANPO<span>{t('app.name')}</span>
      </h1>
      <p class="tagline">{t('title.tagline')}</p>
      {busy ? (
        <p class="busy">{t('title.starting')}</p>
      ) : picking ? (
        <div class="menu-list">
          <h2>{t('title.pickStart')}</h2>
          {p.bridge.startPoints.map((s, i) => (
            <MenuButton
              key={s.id}
              id={`start-${s.id}`}
              label={pick(s.name)}
              autofocus={i === 0}
              onClick={() => start({ kind: 'new', at: s.id })}
            />
          ))}
          <MenuButton label={t('common.back')} variant="plain" onClick={() => setPicking(false)} />
        </div>
      ) : (
        <div class="menu-list">
          {p.bridge.hasSave.value ? (
            <MenuButton
              id="title-continue"
              label={t('title.continue')}
              autofocus
              onClick={() => start({ kind: 'continue' })}
            />
          ) : null}
          <MenuButton id="title-new" label={t('title.newWalk')} onClick={() => setPicking(true)} />
          <MenuButton id="title-settings" label={t('title.settings')} onClick={() => p.nav.push('settings')} />
          <MenuButton id="title-credits" label={t('title.credits')} onClick={() => p.nav.push('credits')} />
        </div>
      )}
    </MenuScreen>
  );
}

export function PauseScreen(p: { nav: ScreenNav; pad: boolean }) {
  return (
    <MenuScreen id="pause" class="pause" pad={p.pad}>
      <h2>{t('pause.title')}</h2>
      <div class="menu-list">
        <MenuButton id="pause-resume" label={t('pause.resume')} autofocus onClick={() => p.nav.play()} />
        <MenuButton id="pause-map" label={t('pause.map')} onClick={() => p.nav.push('map')} />
        <MenuButton id="pause-log" label={t('pause.log')} onClick={() => p.nav.push('log')} />
        <MenuButton id="pause-photo" label={t('pause.photo')} onClick={() => p.nav.push('photo')} />
        <MenuButton id="pause-settings" label={t('pause.settings')} onClick={() => p.nav.push('settings')} />
        <MenuButton id="pause-title" label={t('pause.toTitle')} variant="plain" onClick={() => p.nav.toTitle()} />
      </div>
    </MenuScreen>
  );
}
