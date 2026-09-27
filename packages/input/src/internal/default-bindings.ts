// 기본 바인딩(09 §4 표, 키보드·마우스만 — 게임패드는 M04-T03). 설정 재바인딩은 이 맵을 복사해 수정한다.
import type { BindingMap, ContextBindings } from '../api.ts';

const key = (code: string) => ({ device: 'key', code }) as const;
const keyAxis = (negative: string, positive: string) => ({ device: 'keyAxis', negative, positive }) as const;

const LOOK: ContextBindings = {
  lookX: [{ device: 'mouseAxis', axis: 'x' }],
  lookY: [{ device: 'mouseAxis', axis: 'y' }],
  wheel: [{ device: 'mouseAxis', axis: 'wheel' }],
};

const COMMON: ContextBindings = {
  ...LOOK,
  freeCam: [key('KeyC')],
  map: [key('KeyM')],
  photo: [key('KeyP')],
  pause: [key('Escape')],
};

export const DEFAULT_BINDINGS: BindingMap = {
  walk: {
    ...COMMON,
    moveX: [keyAxis('KeyA', 'KeyD')],
    moveY: [keyAxis('KeyS', 'KeyW')],
    sprint: [key('ShiftLeft'), key('ShiftRight')],
    pace: [key('KeyX')],
    interact: [key('KeyF')],
    toggleView: [key('KeyV')],
  },
  vehicle: {
    ...COMMON,
    moveX: [keyAxis('KeyA', 'KeyD')],
    moveY: [keyAxis('KeyS', 'KeyW')],
    handbrake: [key('Space')],
    lights: [key('KeyL')],
    interact: [key('KeyF')],
    toggleView: [key('KeyV')],
  },
  fly: {
    ...COMMON,
    moveX: [keyAxis('KeyA', 'KeyD')],
    moveY: [keyAxis('KeyS', 'KeyW')],
    fly: [keyAxis('KeyQ', 'KeyE')],
    sprint: [key('ShiftLeft'), key('ShiftRight')],
  },
  ui: { pause: [key('Escape')], map: [key('KeyM')] },
};

/** 깊은 복사(재바인딩이 기본값을 건드리지 않도록). */
export function cloneBindings(m: BindingMap): BindingMap {
  return structuredClone(m);
}
