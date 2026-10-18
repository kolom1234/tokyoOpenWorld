// M10-T01 UI 셸: i18n 키 동등성·치환, 공간 내비게이션, 패드 메뉴 입력, 화면 스택, 키 재바인딩, 설정 정규화, 도움말 줄.
import { describe, expect, it } from 'vitest';
import { LANGS, REBIND_ACTIONS } from '../src/api.ts';
import { nextStack } from '../src/internal/app.tsx';
import { DICTS, pick, t } from '../src/internal/i18n/t.ts';
import { DEFAULT_KEYS, keyLabel, rebindKeys } from '../src/internal/keys.ts';
import { dirOfKey, pickNext } from '../src/internal/nav/focus.ts';
import { initPadState, stepPad } from '../src/internal/nav/pad.ts';
import { helpItems } from '../src/internal/screens/help.ts';
import { DEFAULT_SETTINGS, langFromNavigator, normalizeSettings } from '../src/internal/settings.ts';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
  it('ko·ja·en have the same keys, no empty strings and the same placeholders', () => {
    const keys = Object.keys(DICTS.ko).sort();
    for (const l of LANGS) {
      expect(Object.keys(DICTS[l]).sort()).toEqual(keys);
      for (const k of keys) {
        expect(DICTS[l][k]?.trim(), `${l}:${k}`).toBeTruthy();
        expect(placeholders(DICTS[l][k] as string), `${l}:${k}`).toEqual(placeholders(DICTS.ko[k] as string));
      }
    }
  });
  it('every rebindable action, quality tier and settings tab has a label', () => {
    for (const a of REBIND_ACTIONS) expect(DICTS.ko[`action.${a}`]).toBeTruthy();
    for (const q of ['auto', 'low', 'medium', 'high', 'ultra']) expect(DICTS.ja[`quality.${q}`]).toBeTruthy();
    for (const tab of ['graphics', 'camera', 'controls', 'audio', 'general'])
      expect(DICTS.en[`settings.tab.${tab}`]).toBeTruthy();
  });
  it('substitutes params and local names', () => {
    const name = { ko: '하라주쿠', ja: '原宿', en: 'Harajuku' };
    expect(t('boot.detail.shaders', { done: 3, total: 9 }, 'en')).toBe('Shaders 3/9');
    expect(t('hud.prompt.toPlatform', { kInteract: 'F', exit: name }, 'ja')).toContain('原宿');
    expect(pick(name, 'ko')).toBe('하라주쿠');
    expect(t('missing.key', undefined, 'ko')).toBe('missing.key');
  });
});

describe('navigation', () => {
  const r = (x: number, y: number, w = 100, h = 30) => ({ x, y, w, h });
  it('moves to the nearest control in the pressed direction, none behind', () => {
    const list = [r(0, 0), r(0, 50), r(0, 100), r(200, 50)];
    expect(pickNext(list[1] ?? null, list, 'down')).toBe(2);
    expect(pickNext(list[1] ?? null, list, 'up')).toBe(0);
    expect(pickNext(list[1] ?? null, list, 'right')).toBe(3);
    expect(pickNext(list[0] ?? null, [r(0, -50)], 'down')).toBe(-1);
    expect(pickNext(null, list, 'down')).toBe(0);
  });
  it('arrow keys only (WASD stays with the game)', () => {
    expect(dirOfKey('ArrowLeft')).toBe('left');
    expect(dirOfKey('KeyW')).toBeNull();
  });
  it('gamepad: button edges, held Start ignored on open, D-pad repeat', () => {
    const btn = (on: number[]) => ({ buttons: Array.from({ length: 16 }, (_, i) => on.includes(i)), axes: [0, 0] });
    const st = initPadState(btn([9]));
    expect(stepPad(st, btn([9]), 0.016)).toEqual([]);
    expect(stepPad(st, btn([0]), 0.016)).toEqual([{ kind: 'button', button: 'a' }]);
    expect(stepPad(st, btn([13]), 0.016)).toEqual([{ kind: 'dir', dir: 'down' }]);
    expect(stepPad(st, btn([13]), 0.2)).toEqual([]);
    expect(stepPad(st, btn([13]), 0.2)).toEqual([{ kind: 'dir', dir: 'down' }]);
    expect(stepPad(st, { buttons: [], axes: [0.9, 0.1] }, 0.016)).toEqual([{ kind: 'dir', dir: 'right' }]);
    expect(stepPad(st, btn([1]), 0.016)).toContainEqual({ kind: 'button', button: 'b' });
  });
});

describe('screen stack', () => {
  it('push over hud, back pops to hud, play resets, boot is locked', () => {
    expect(nextStack(['hud'], 'push', 'pause')).toEqual(['hud', 'pause']);
    expect(nextStack(['hud', 'pause', 'settings'], 'back')).toEqual(['hud', 'pause']);
    expect(nextStack(['hud'], 'back')).toEqual(['hud']);
    expect(nextStack(['title'], 'back')).toEqual(['title']);
    expect(nextStack(['title', 'settings'], 'back')).toEqual(['title']);
    expect(nextStack(['hud', 'pause', 'settings'], 'play')).toEqual(['hud']);
    expect(nextStack(['boot'], 'push', 'pause')).toEqual(['boot']);
    expect(nextStack(['hud', 'pause'], 'title')).toEqual(['title']);
  });
});

describe('keys & settings', () => {
  it('rebinding swaps a taken key, rejects reserved keys and drops defaults', () => {
    const r = rebindKeys({ keys: {} }, 'interact', 'KeyV');
    expect(r?.keys).toEqual({ interact: 'KeyV', toggleView: 'KeyF' });
    expect(r?.swapped).toBe('toggleView');
    expect(rebindKeys({ keys: {} }, 'interact', 'KeyW')).toBeUndefined();
    expect(rebindKeys({ keys: { interact: 'KeyJ' } }, 'interact', DEFAULT_KEYS.interact)?.keys).toEqual({});
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('KeyF')).toBe('F');
    expect(keyLabel('Digit3')).toBe('3');
  });
  it('normalizes unknown/invalid values and clamps ranges', () => {
    const s = normalizeSettings({
      lang: 'fr',
      fovDeg: 300,
      volume: { master: -1, sfx: 'x' },
      keys: { interact: '<b>' },
      junk: 1,
    });
    expect(s.lang).toBe(DEFAULT_SETTINGS.lang);
    expect(s.fovDeg).toBe(100);
    expect(s.volume.master).toBe(0);
    expect(s.volume.sfx).toBe(1);
    expect(s.keys).toEqual({});
    expect('junk' in s).toBe(false);
    expect(normalizeSettings(null, 'ja').lang).toBe('ja');
    expect(langFromNavigator(['ja-JP', 'en'])).toBe('ja');
    expect(langFromNavigator(['fr-FR'])).toBe('en');
  });
  it('help lines follow the mode, rebinding and gamepad', () => {
    const walk = helpItems('walk', { keys: { interact: 'KeyJ' } }, false);
    expect(walk.find((i) => i.action === 'action.interact')?.keys).toBe('J');
    expect(helpItems('drive', { keys: {} }, false).some((i) => i.action === 'action.handbrake')).toBe(true);
    const pad = helpItems('walk', { keys: {} }, true);
    expect(pad.find((i) => i.action === 'action.interact')?.keys).toBe('X');
    expect(pad.some((i) => i.action === 'action.map')).toBe(false);
  });
});

describe('hud info (M10-T02)', () => {
  it('formats JST clock, speed units and guide arrows', async () => {
    const { jstClock, speedText } = await import('../src/internal/screens/hud-info.tsx');
    const { arrowOf, distText } = await import('../src/internal/screens/hud.tsx');
    expect(jstClock(Date.parse('2026-05-15T03:04:00Z'))).toBe('12:04');
    expect(speedText(100, 'imperial')).toEqual({ value: '62', unit: 'mph' });
    expect(speedText(42.4, 'metric')).toEqual({ value: '42', unit: 'km/h' });
    expect(arrowOf(90)).toBe('←');
    expect(distText(1234, 'metric')).toBe('1.2 km');
    expect(distText(10, 'imperial')).toBe('33 ft');
  });
});
