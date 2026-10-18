// 설정 기본값·정규화(저장본·가져오기 값의 범위·형식 검사). 저장은 게임(localStorage — 부팅 때 동기로 읽어 품질·언어 적용).
import type { QualityTier } from '@sanpo/core';
import {
  COLOR_VISIONS,
  LANGS,
  type Lang,
  REBIND_ACTIONS,
  type RebindAction,
  type SettingsModel,
  type VolumeSettings,
} from '../api.ts';

export const DEFAULT_SETTINGS: SettingsModel = {
  v: 1,
  lang: 'ko',
  quality: 'auto',
  fovDeg: 70,
  headBob: true,
  reduceMotion: false,
  lookSensitivity: 1,
  invertY: false,
  volume: { master: 1, ambience: 1, sfx: 1, vehicle: 1, train: 1, ui: 1 },
  muted: false,
  hudFade: true,
  units: 'metric',
  minimapRotate: false,
  uiScale: 1,
  showHelp: true,
  colorVision: 'off',
  captions: false,
  keys: {},
};

const QUALITIES: readonly ('auto' | QualityTier)[] = ['auto', 'low', 'medium', 'high', 'ultra'];
const KEY_CODE = /^[A-Za-z0-9]{1,24}$/;

const num = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

function volumeOf(v: unknown): VolumeSettings {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS.volume;
  return {
    master: num(o.master, 0, 1.5, d.master),
    ambience: num(o.ambience, 0, 1.5, d.ambience),
    sfx: num(o.sfx, 0, 1.5, d.sfx),
    vehicle: num(o.vehicle, 0, 1.5, d.vehicle),
    train: num(o.train, 0, 1.5, d.train),
    ui: num(o.ui, 0, 1.5, d.ui),
  };
}

function keysOf(v: unknown): Partial<Record<RebindAction, string>> {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
  const out: Partial<Record<RebindAction, string>> = {};
  for (const a of REBIND_ACTIONS) {
    const code = o[a];
    if (typeof code === 'string' && KEY_CODE.test(code)) out[a] = code;
  }
  return out;
}

/** 아무 값 → 유효한 설정(모르는 필드 버림, 범위 밖 자름, 없으면 기본). */
export function normalizeSettings(raw: unknown, fallbackLang: Lang = DEFAULT_SETTINGS.lang): SettingsModel {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    v: 1,
    lang: oneOf(o.lang, LANGS, fallbackLang),
    quality: oneOf(o.quality, QUALITIES, d.quality),
    fovDeg: num(o.fovDeg, 50, 100, d.fovDeg),
    headBob: bool(o.headBob, d.headBob),
    reduceMotion: bool(o.reduceMotion, d.reduceMotion),
    lookSensitivity: num(o.lookSensitivity, 0.25, 3, d.lookSensitivity),
    invertY: bool(o.invertY, d.invertY),
    volume: volumeOf(o.volume),
    muted: bool(o.muted, d.muted),
    hudFade: bool(o.hudFade, d.hudFade),
    units: oneOf(o.units, ['metric', 'imperial'] as const, d.units),
    minimapRotate: bool(o.minimapRotate, d.minimapRotate),
    uiScale: num(o.uiScale, 0.8, 1.5, d.uiScale),
    showHelp: bool(o.showHelp, d.showHelp),
    colorVision: oneOf(o.colorVision, COLOR_VISIONS, d.colorVision),
    captions: bool(o.captions, d.captions),
    keys: keysOf(o.keys),
  };
}

/** 브라우저 언어 → 기본 UI 언어(ko·ja 아니면 en). */
export function langFromNavigator(languages: readonly string[] | undefined): Lang {
  for (const l of languages ?? []) {
    const p = l.toLowerCase().slice(0, 2);
    if (p === 'ko' || p === 'ja' || p === 'en') return p;
  }
  return 'en';
}
