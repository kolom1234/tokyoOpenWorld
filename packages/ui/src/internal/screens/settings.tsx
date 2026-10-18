// 설정 화면: 탭(그래픽·카메라·모션·조작·소리·일반) — 바뀌면 곧바로 bridge.settings(게임이 적용·저장). 키 재바인딩 = 누를 때까지 대기(data-capturing).
import { useEffect, useState } from 'preact/hooks';
import { LANGS, REBIND_ACTIONS, type RebindAction, type SettingsModel, type UiBridge } from '../../api.ts';
import { Choice, MenuButton, Row, Slider, Toggle } from '../components/controls.tsx';
import { t } from '../i18n/t.ts';
import { DEFAULT_KEYS, keyLabel, keyOf, rebindKeys } from '../keys.ts';
import { DEFAULT_SETTINGS } from '../settings.ts';
import { MenuScreen } from './menus.tsx';

export const SETTINGS_TABS = ['graphics', 'camera', 'controls', 'audio', 'general'] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

type Patch = (p: Partial<SettingsModel>) => void;
const pct = (v: number) => `${Math.round(v * 100)}%`;

function GraphicsTab(p: { s: SettingsModel; set: Patch }) {
  const tiers = ['auto', 'low', 'medium', 'high', 'ultra'] as const;
  return (
    <Row label={t('settings.quality')} hint={t('settings.qualityHint')}>
      <Choice
        id="set-quality"
        value={p.s.quality}
        options={tiers.map((v) => ({ value: v, label: t(`quality.${v}`) }))}
        onChange={(quality) => p.set({ quality })}
      />
    </Row>
  );
}

function CameraTab(p: { s: SettingsModel; set: Patch }) {
  return (
    <>
      <Row label={t('settings.fov')}>
        <Slider
          id="set-fov"
          value={p.s.fovDeg}
          min={50}
          max={100}
          step={1}
          format={(v) => `${v}°`}
          onChange={(fovDeg) => p.set({ fovDeg })}
        />
      </Row>
      <Row label={t('settings.reduceMotion')} hint={t('settings.reduceMotionHint')}>
        <Toggle id="set-reduce-motion" value={p.s.reduceMotion} onChange={(reduceMotion) => p.set({ reduceMotion })} />
      </Row>
      <Row label={t('settings.headBob')}>
        <Toggle value={p.s.headBob && !p.s.reduceMotion} onChange={(headBob) => p.set({ headBob })} />
      </Row>
      <Row label={t('settings.lookSensitivity')}>
        <Slider
          value={p.s.lookSensitivity}
          min={0.25}
          max={3}
          step={0.05}
          format={(v) => `×${v.toFixed(2)}`}
          onChange={(lookSensitivity) => p.set({ lookSensitivity })}
        />
      </Row>
      <Row label={t('settings.invertY')}>
        <Toggle value={p.s.invertY} onChange={(invertY) => p.set({ invertY })} />
      </Row>
    </>
  );
}

function KeyRow(p: { a: RebindAction; s: SettingsModel; set: Patch; onNote: (n: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const h = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCapturing(false);
      if (e.code === 'Escape') return;
      const r = rebindKeys(p.s, p.a, e.code);
      if (!r) return;
      p.set({ keys: r.keys });
      p.onNote(r.swapped ? t('settings.keyConflict', { key: keyLabel(e.code) }) : '');
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [capturing, p.s, p.a]);
  const code = keyOf(p.s, p.a);
  return (
    <Row label={t(`action.${p.a}`)}>
      <button
        type="button"
        class={`keycap ${code !== DEFAULT_KEYS[p.a] ? 'changed' : ''}`}
        data-nav
        data-capturing={capturing ? '' : undefined}
        id={`key-${p.a}`}
        onClick={() => setCapturing(true)}
      >
        {capturing ? t('settings.keyPress') : keyLabel(code)}
      </button>
    </Row>
  );
}

function ControlsTab(p: { s: SettingsModel; set: Patch }) {
  const [note, setNote] = useState('');
  return (
    <>
      <p class="note">{t('settings.moveNote')}</p>
      {REBIND_ACTIONS.map((a) => (
        <KeyRow key={a} a={a} s={p.s} set={p.set} onNote={setNote} />
      ))}
      {note ? <p class="note warn">{note}</p> : null}
      <p class="note">{t('settings.padNote')}</p>
      <MenuButton id="set-reset-controls" label={t('settings.resetControls')} onClick={() => p.set({ keys: {} })} />
    </>
  );
}

function AudioTab(p: { s: SettingsModel; set: Patch }) {
  const keys = ['master', 'ambience', 'sfx', 'vehicle', 'train', 'ui'] as const;
  return (
    <>
      {keys.map((k) => (
        <Row key={k} label={t(`settings.volume.${k}`)}>
          <Slider
            id={`set-vol-${k}`}
            value={p.s.volume[k]}
            min={0}
            max={k === 'master' ? 1.5 : 1}
            step={0.05}
            format={pct}
            onChange={(v) => p.set({ volume: { ...p.s.volume, [k]: v } })}
          />
        </Row>
      ))}
      <Row label={t('settings.muted')}>
        <Toggle id="set-muted" value={p.s.muted} onChange={(muted) => p.set({ muted })} />
      </Row>
    </>
  );
}

function GeneralTab(p: { s: SettingsModel; set: Patch }) {
  return (
    <>
      <Row label={t('settings.lang')}>
        <Choice
          id="set-lang"
          value={p.s.lang}
          options={LANGS.map((l) => ({ value: l, label: t(`lang.${l}`) }))}
          onChange={(lang) => p.set({ lang })}
        />
      </Row>
      <Row label={t('settings.units')}>
        <Choice
          value={p.s.units}
          options={(['metric', 'imperial'] as const).map((u) => ({ value: u, label: t(`units.${u}`) }))}
          onChange={(units) => p.set({ units })}
        />
      </Row>
      <Row label={t('settings.uiScale')}>
        <Slider
          value={p.s.uiScale}
          min={0.8}
          max={1.5}
          step={0.05}
          format={pct}
          onChange={(uiScale) => p.set({ uiScale })}
        />
      </Row>
      <Row label={t('settings.showHelp')}>
        <Toggle value={p.s.showHelp} onChange={(showHelp) => p.set({ showHelp })} />
      </Row>
      <Row label={t('settings.hudFade')}>
        <Toggle value={p.s.hudFade} onChange={(hudFade) => p.set({ hudFade })} />
      </Row>
      <Row label={t('settings.minimapRotate')}>
        <Toggle value={p.s.minimapRotate} onChange={(minimapRotate) => p.set({ minimapRotate })} />
      </Row>
    </>
  );
}

export function SettingsScreen(p: {
  bridge: UiBridge;
  back: () => void;
  pad: boolean;
  tab: SettingsTab;
  setTab(t: SettingsTab): void;
}) {
  const s = p.bridge.settings.value;
  const set: Patch = (patch) => {
    p.bridge.settings.value = { ...p.bridge.settings.value, ...patch };
  };
  return (
    <MenuScreen id="settings" class="settings" focusKey={p.tab} pad={p.pad}>
      <h2>{t('settings.title')}</h2>
      <div class="tabs" role="tablist">
        {SETTINGS_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            class={`tab ${k === p.tab ? 'active' : ''}`}
            aria-selected={k === p.tab}
            data-nav
            data-autofocus={k === p.tab ? '' : undefined}
            id={`tab-${k}`}
            onClick={() => p.setTab(k)}
          >
            {t(`settings.tab.${k}`)}
          </button>
        ))}
      </div>
      <div class="tab-body">
        {p.tab === 'graphics' ? <GraphicsTab s={s} set={set} /> : null}
        {p.tab === 'camera' ? <CameraTab s={s} set={set} /> : null}
        {p.tab === 'controls' ? <ControlsTab s={s} set={set} /> : null}
        {p.tab === 'audio' ? <AudioTab s={s} set={set} /> : null}
        {p.tab === 'general' ? <GeneralTab s={s} set={set} /> : null}
      </div>
      <div class="menu-row">
        <MenuButton
          id="set-reset-all"
          label={t('settings.resetAll')}
          variant="plain"
          onClick={() => {
            p.bridge.settings.value = { ...DEFAULT_SETTINGS, lang: s.lang };
          }}
        />
        <MenuButton id="set-back" label={t('common.back')} onClick={p.back} />
      </div>
    </MenuScreen>
  );
}
