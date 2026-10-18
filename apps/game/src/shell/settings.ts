// 설정 저장(localStorage `sanpo.settings.v1` — 부팅 때 동기로 읽어 품질·언어를 첫 화면부터 적용)과 서비스 적용(품질·FOV·감도·모션·키·볼륨).
// IndexedDB가 아니라 localStorage인 이유: render 생성 전에 티어가 필요하다(ADR-0091). 세이브 내보내기에는 함께 담긴다(T06).
import type { AudioMix, AudioService } from '@sanpo/audio';
import type { QualityTier } from '@sanpo/core';
import { type BindingMap, DEFAULT_BINDINGS, type InputService } from '@sanpo/input';
import type { RenderService } from '@sanpo/render';
import type { TraversalService } from '@sanpo/traversal';
import {
  DEFAULT_KEYS,
  langFromNavigator,
  normalizeSettings,
  REBIND_ACTIONS,
  type RebindAction,
  type SettingsModel,
} from '@sanpo/ui';

export const SETTINGS_KEY = 'sanpo.settings.v1';
/** traversal 기본 감도(rad/px) — 설정 배율 1. */
const BASE_LOOK_RAD_PER_PX = 0.0025;

/** 저장된 설정(없으면 기본 — 언어 = 브라우저 언어, 모션 민감 = OS `prefers-reduced-motion`(M11-T04)). */
export function loadSettings(
  storage: Pick<Storage, 'getItem'> | undefined,
  navLangs?: readonly string[],
  prefersReducedMotion = false,
): SettingsModel {
  const lang = langFromNavigator(navLangs);
  const fresh = () => normalizeSettings(prefersReducedMotion ? { reduceMotion: true } : {}, lang);
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw), lang) : fresh();
  } catch {
    return fresh();
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | undefined, s: SettingsModel): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // 사생활 모드 등 — 이번 세션만.
  }
}

/** 설정 티어(자동이면 undefined — quality.ts 저장값·감지). */
export const tierOf = (s: SettingsModel): QualityTier | undefined => (s.quality === 'auto' ? undefined : s.quality);

export function mixOf(s: SettingsModel): Partial<AudioMix> {
  const v = s.volume;
  return {
    master: s.muted ? 0 : v.master,
    ambience: v.ambience,
    sfx: v.sfx,
    vehicle: v.vehicle,
    train: v.train,
    ui: v.ui,
  };
}

/** 기본 바인딩에서 재바인딩한 액션의 키보드 키만 바꾼다(패드·마우스 바인딩 유지). */
export function bindingsWithKeys(keys: SettingsModel['keys'], base: BindingMap = DEFAULT_BINDINGS): BindingMap {
  const out = structuredClone(base);
  for (const a of REBIND_ACTIONS as readonly RebindAction[]) {
    const code = keys[a];
    if (!code || code === DEFAULT_KEYS[a]) continue;
    for (const ctx of Object.values(out)) {
      const list = (ctx as Record<string, BindingMap['walk'][keyof BindingMap['walk']]>)[a];
      if (!list) continue;
      const kept = list.filter((b) => b.device !== 'key');
      (ctx as Record<string, unknown>)[a] = [{ device: 'key', code }, ...kept];
    }
  }
  return out;
}

export interface SettingsTargets {
  render: Pick<RenderService, 'setQuality' | 'setColorVision'>;
  traversal: Pick<TraversalService, 'configure'>;
  input: Pick<InputService, 'setBindings' | 'setAxisScale'>;
  audio: () => Pick<AudioService, 'setMix'> | undefined;
  /** `?quality=`·골든뷰 = 티어 고정(설정 무시). */
  fixedQuality: boolean;
  /** 골든뷰 = FOV 고정. */
  fixedFov: boolean;
}

/** 바뀐 부분만 서비스에 적용(prev 없으면 전부). */
export function applySettings(t: SettingsTargets, s: SettingsModel, prev?: SettingsModel): void {
  const tier = tierOf(s);
  if (!t.fixedQuality && tier && (!prev || prev.quality !== s.quality)) t.render.setQuality(tier);
  if (!prev || prev.colorVision !== s.colorVision) t.render.setColorVision(s.colorVision);
  t.traversal.configure({
    ...(t.fixedFov ? {} : { fovDeg: s.fovDeg }),
    lookRadPerPx: BASE_LOOK_RAD_PER_PX * s.lookSensitivity,
    motionEffects: !s.reduceMotion,
    walk: { headBob: s.headBob && !s.reduceMotion },
  });
  t.input.setAxisScale('lookY', s.invertY ? -1 : 1);
  if (!prev || JSON.stringify(prev.keys) !== JSON.stringify(s.keys)) t.input.setBindings(bindingsWithKeys(s.keys));
  if (!prev || JSON.stringify(mixOf(prev)) !== JSON.stringify(mixOf(s))) t.audio()?.setMix(mixOf(s));
}
