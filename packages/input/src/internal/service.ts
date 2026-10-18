// createInput: 디바이스 부착 + phase 0 시스템(원시 입력 → ActionState 스냅샷). see docs/modules/input.md
import type { GameSystem } from '@sanpo/core';
import type { ActionState, AxisAction, InputContext, InputDeps, InputService } from '../api.ts';
import { EMPTY_STATE, snapshotActions } from './action-map.ts';
import { cloneBindings, DEFAULT_BINDINGS } from './default-bindings.ts';
import { attachGamepad } from './devices/gamepad.ts';
import { attachKeyboard } from './devices/keyboard.ts';
import { attachMouse } from './devices/mouse.ts';
import { createRawInput, endFrame } from './raw-input.ts';

/** 01-architecture §5: input = phase 0. */
export const INPUT_PHASE = 0;

/** 메뉴 동안 끄기(EMPTY_STATE)·축 배율(시선 반전) — 스냅샷 뒤에 적용(M10-T01). */
function createGate() {
  const scales: Partial<Record<AxisAction, number>> = {};
  let scaled = false;
  let enabled = true;
  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on: boolean) {
      enabled = on;
    },
    setAxisScale(a: AxisAction, k: number) {
      scales[a] = k;
      scaled = Object.values(scales).some((v) => v !== 1);
    },
    apply(base: ActionState): ActionState {
      if (!enabled) return EMPTY_STATE;
      return scaled ? { ...base, axis: (a) => base.axis(a) * (scales[a] ?? 1) } : base;
    },
  };
}

export function createInput(deps: InputDeps): InputService {
  const raw = createRawInput();
  const bindings = cloneBindings(deps.bindings ?? DEFAULT_BINDINGS);
  let context: InputContext = deps.context ?? 'walk';
  let state: ActionState = EMPTY_STATE;
  const gate = createGate();
  const win = deps.target.ownerDocument.defaultView;
  const detachKeyboard = win ? attachKeyboard(win, raw) : () => undefined;
  const mouse = attachMouse(deps.target, raw);
  const gamepad = win ? attachGamepad(win) : undefined;
  const log = deps.log.child('input');

  const system: GameSystem = {
    id: 'input',
    phase: INPUT_PHASE,
    update(frame) {
      gamepad?.poll(raw);
      state = gate.apply(snapshotActions(raw, bindings[context], frame.dtReal));
      endFrame(raw);
    },
    dispose() {
      detachKeyboard();
      mouse.detach();
    },
  };

  return {
    get state() {
      return state;
    },
    get context() {
      return context;
    },
    get pointerLocked() {
      return mouse.locked;
    },
    get gamepadConnected() {
      return raw.pad.connected;
    },
    setContext(c) {
      if (c !== context) log.debug('context', context, '→', c);
      context = c;
    },
    rebind(a, b, ctx = context) {
      bindings[ctx][a] = [b];
    },
    bindings: () => cloneBindings(bindings),
    setBindings(m) {
      const next = cloneBindings(m);
      for (const c of Object.keys(bindings) as InputContext[]) bindings[c] = next[c];
    },
    get enabled() {
      return gate.enabled;
    },
    setEnabled: (on) => gate.setEnabled(on),
    setAxisScale: (a, k) => gate.setAxisScale(a, k),
    dispose: () => system.dispose(),
    systems: () => [system],
  };
}
