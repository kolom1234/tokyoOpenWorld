// createInput: 디바이스 부착 + phase 0 시스템(원시 입력 → ActionState 스냅샷). see docs/modules/input.md
import type { GameSystem } from '@sanpo/core';
import type { ActionState, InputContext, InputDeps, InputService } from '../api.ts';
import { EMPTY_STATE, snapshotActions } from './action-map.ts';
import { cloneBindings, DEFAULT_BINDINGS } from './default-bindings.ts';
import { attachKeyboard } from './devices/keyboard.ts';
import { attachMouse } from './devices/mouse.ts';
import { createRawInput, endFrame } from './raw-input.ts';

/** 01-architecture §5: input = phase 0. */
export const INPUT_PHASE = 0;

export function createInput(deps: InputDeps): InputService {
  const raw = createRawInput();
  const bindings = cloneBindings(deps.bindings ?? DEFAULT_BINDINGS);
  let context: InputContext = deps.context ?? 'walk';
  let state: ActionState = EMPTY_STATE;
  const win = deps.target.ownerDocument.defaultView;
  const detachKeyboard = win ? attachKeyboard(win, raw) : () => undefined;
  const mouse = attachMouse(deps.target, raw);
  const log = deps.log.child('input');

  const system: GameSystem = {
    id: 'input',
    phase: INPUT_PHASE,
    update() {
      state = snapshotActions(raw, bindings[context]);
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
    setContext(c) {
      if (c !== context) log.debug('context', context, '→', c);
      context = c;
    },
    rebind(a, b, ctx = context) {
      bindings[ctx][a] = [b];
    },
    bindings: () => cloneBindings(bindings),
    dispose: () => system.dispose(),
    systems: () => [system],
  };
}
