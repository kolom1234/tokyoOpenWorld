// M10-T01 createInput: setEnabled(메뉴 동안 0, 다시 켠 첫 프레임 비움 — 메뉴를 닫은 Esc가 일시정지를 다시 열지 않게), setAxisScale(시선 반전), setBindings(키 재바인딩).
import { createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { cloneBindings, DEFAULT_BINDINGS } from '../src/internal/default-bindings.ts';
import { createInput } from '../src/internal/service.ts';

type Listener = (e: unknown) => void;

function fakeDom() {
  const listeners = new Map<string, Listener[]>();
  const on = (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]);
  const win = {
    addEventListener: on,
    removeEventListener: () => {},
    navigator: {},
  };
  const doc = { defaultView: win, addEventListener: on, removeEventListener: () => {}, pointerLockElement: null };
  const target = {
    ownerDocument: doc,
    addEventListener: on,
    removeEventListener: () => {},
    locks: 0,
    requestPointerLock() {
      this.locks++;
    },
  };
  const fire = (type: string, e: object) => {
    for (const fn of listeners.get(type) ?? []) fn({ target: null, preventDefault() {}, ...e });
  };
  return { target: target as unknown as HTMLElement, fire, locks: () => target.locks };
}

const frame = (dtReal = 1 / 60) => ({ dtReal, dtSim: dtReal, frame: 0, nowMs: 0 }) as never;

describe('createInput gate (M10-T01)', () => {
  it('disabled = no actions; first frame after re-enable is empty, then normal', () => {
    const d = fakeDom();
    const input = createInput({ target: d.target, log: createLogger({ level: 'error' }) });
    const sys = input.systems()[0] as { update(f: unknown): void };
    input.setEnabled(false);
    d.fire('keydown', { code: 'Escape', repeat: false });
    sys.update(frame());
    expect(input.state.justPressed('pause')).toBe(false);
    d.fire('keydown', { code: 'Escape', repeat: false });
    input.setEnabled(true);
    sys.update(frame());
    expect(input.state.justPressed('pause')).toBe(false);
    d.fire('keyup', { code: 'Escape' });
    d.fire('keydown', { code: 'Escape', repeat: false });
    sys.update(frame());
    expect(input.state.justPressed('pause')).toBe(true);
  });
  it('axis scale inverts look Y; setBindings swaps a key and keeps the rest', () => {
    const d = fakeDom();
    const input = createInput({ target: d.target, log: createLogger({ level: 'error' }) });
    const sys = input.systems()[0] as { update(f: unknown): void };
    const m = cloneBindings(DEFAULT_BINDINGS);
    m.walk.interact = [{ device: 'key', code: 'KeyJ' }];
    input.setBindings(m);
    input.setAxisScale('moveY', -1);
    d.fire('keydown', { code: 'KeyJ', repeat: false });
    d.fire('keydown', { code: 'KeyW', repeat: false });
    sys.update(frame());
    expect(input.state.justPressed('interact')).toBe(true);
    expect(input.state.axis('moveY')).toBe(-1);
    expect(input.bindings().walk.interact).toEqual([{ device: 'key', code: 'KeyJ' }]);
  });

  it('setPointerLockOnClick(false) stops click-to-lock; true restores it (photo mode, M10-T05)', () => {
    const d = fakeDom();
    const input = createInput({ target: d.target, log: createLogger({ level: 'error' }) });
    d.fire('click', {});
    expect(d.locks()).toBe(1);
    input.setPointerLockOnClick(false);
    d.fire('click', {});
    expect(d.locks()).toBe(1);
    input.setPointerLockOnClick(true);
    d.fire('click', {});
    expect(d.locks()).toBe(2);
  });
});
