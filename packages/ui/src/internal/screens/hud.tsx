// HUD(게임 중): 도움말(H)·상호작용 안내·알림·역 근접 안내·지면 대기·검은 막. id(#station-prompt 등) = e2e·봇이 읽는다(옛 임시 DOM과 같음).
// 갱신 = bridge.hud 시그널(게임이 ≤ 10 Hz로 바꿈) — 매 프레임 DOM을 건드리지 않는다.
import { useEffect, useState } from 'preact/hooks';
import type { GuideModel, HudModel, Msg, SettingsModel } from '../../api.ts';
import { t } from '../i18n/t.ts';
import { keyLabel, keyOf } from '../keys.ts';
import { helpItems } from './help.ts';

/** 안내 글의 키 자리(`{kInteract}` 등) — 지금 바인딩(패드면 패드 글자). */
export function keyParams(s: Pick<SettingsModel, 'keys'>, pad: boolean): Record<string, string> {
  return {
    kInteract: pad ? 'Ⓧ' : keyLabel(keyOf(s, 'interact')),
    kSummon: pad ? '◀' : keyLabel(keyOf(s, 'summon')),
    kLand: pad ? 'Ⓐ' : keyLabel(keyOf(s, 'land')),
  };
}

const tk = (m: Msg, keys: Record<string, string>): string => t(m.key, { ...keys, ...m.params });

const NOTICE_MS = 4000;
const ARROWS = ['↑', '↖', '←', '↙', '↓', '↘', '→', '↗'] as const;

export function arrowOf(deg: number): string {
  const k = ((Math.round(deg / 45) % 8) + 8) % 8;
  return ARROWS[k] as string;
}

export function guideText(g: GuideModel, units: SettingsModel['units'], keys: Record<string, string> = {}): string {
  return t(`hud.guide.${g.kind}`, {
    ...keys,
    arrow: arrowOf(g.arrowDeg),
    dist: distText(g.distanceM, units),
    station: g.station,
    exit: g.exit,
  });
}

export function distText(m: number, units: SettingsModel['units']): string {
  if (units === 'imperial') return `${Math.round(m * 3.28084)} ft`;
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function Help(p: { hud: HudModel; s: SettingsModel; open: boolean }) {
  if (!p.s.showHelp) return null;
  if (!p.open)
    return (
      <div id="sanpo-help" class="help collapsed">
        <kbd>H</kbd> {t('help.collapsed')}
      </div>
    );
  const items = helpItems(p.hud.mode, p.s, p.hud.gamepad);
  return (
    <div id="sanpo-help" class="help" data-mode={p.hud.mode}>
      {items.map((i) => (
        <div key={i.action + i.keys} class="help-item">
          <kbd>{i.keys}</kbd>
          <span>{t(i.action)}</span>
        </div>
      ))}
    </div>
  );
}

function Notice(p: { hud: HudModel; keys: Record<string, string> }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!p.hud.notice) return;
    setShown(true);
    const id = setTimeout(() => setShown(false), NOTICE_MS);
    return () => clearTimeout(id);
  }, [p.hud.noticeSeq]);
  if (!shown || !p.hud.notice) return null;
  return (
    <div id="sanpo-notice" class="notice" role="alert">
      {tk(p.hud.notice, p.keys)}
    </div>
  );
}

export function HudLayer(p: { hud: HudModel; settings: SettingsModel; helpOpen: boolean }) {
  const h = p.hud;
  const keys = keyParams(p.settings, h.gamepad);
  return (
    <div class="screen hud" data-screen="hud" data-mode={h.mode}>
      {h.guide ? (
        <div id="station-guide" class="guide" role="status">
          {guideText(h.guide, p.settings.units, keys)}
        </div>
      ) : null}
      {h.prompt ? (
        <div id="station-prompt" class="prompt" role="status">
          {tk(h.prompt, keys)}
        </div>
      ) : null}
      <Notice hud={h} keys={keys} />
      {h.groundLoading ? (
        <div class="ground-loading" role="status">
          {t('hud.groundLoading')}
        </div>
      ) : null}
      <Help hud={h} s={p.settings} open={p.helpOpen} />
    </div>
  );
}

/** 검은 막(역 계단·빠른 이동) — 메뉴 위에도 그린다. */
export function FadeLayer(p: { fade: number }) {
  return <div id="station-fade" class="fade" style={{ opacity: String(p.fade) }} />;
}
