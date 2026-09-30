// 기본 바인딩(09 §4 표 — 키보드·마우스 + 게임패드 표준 매핑). 설정 재바인딩은 이 맵을 복사해 수정한다.
// 패드: Select·Start 단독(지도·일시정지)과 Start+Y(포토)는 조합 충돌 규칙과 함께 M08 UI에서(지금은 Select+Y = freecam만).
import type { Binding, BindingMap, ContextBindings } from '../api.ts';

const key = (code: string) => ({ device: 'key', code }) as const;
const keyAxis = (negative: string, positive: string) => ({ device: 'keyAxis', negative, positive }) as const;
const pad = (button: number, hold?: number): Binding =>
  hold === undefined ? { device: 'padButton', button } : { device: 'padButton', button, hold };
const stick = (axis: number, scale = 1): Binding => ({ device: 'padAxis', axis, scale });

/** 표준 매핑 버튼 번호. */
const PAD = { A: 0, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, L3: 10, R3: 11, UP: 12, DOWN: 13 } as const;
/** R스틱 최대 기울기 시선 속도(px/s 상당 — traversal 감도 0.0025 rad/px면 ≈ 2.25 rad/s). */
export const PAD_LOOK_PX_PER_S = 900;
/** D-pad ↑↓ = 휠(노치/s). */
const PAD_WHEEL_PER_S = 4;

const LOOK: ContextBindings = {
  lookX: [
    { device: 'mouseAxis', axis: 'x' },
    { device: 'padAxis', axis: 2, scale: PAD_LOOK_PX_PER_S, perSecond: true },
  ],
  lookY: [
    { device: 'mouseAxis', axis: 'y' },
    { device: 'padAxis', axis: 3, scale: PAD_LOOK_PX_PER_S, perSecond: true },
  ],
  wheel: [
    { device: 'mouseAxis', axis: 'wheel' },
    { device: 'padButtonAxis', negative: PAD.DOWN, positive: PAD.UP, scale: PAD_WHEEL_PER_S, perSecond: true },
  ],
};

const COMMON: ContextBindings = {
  ...LOOK,
  freeCam: [key('KeyC'), pad(PAD.Y, PAD.SELECT)],
  map: [key('KeyM')],
  photo: [key('KeyP')],
  pause: [key('Escape')],
};

/** L스틱 이동(Y는 아래 + → 앞 +로 뒤집음). */
const MOVE: ContextBindings = {
  moveX: [keyAxis('KeyA', 'KeyD'), stick(0)],
  moveY: [keyAxis('KeyS', 'KeyW'), stick(1, -1)],
};

export const DEFAULT_BINDINGS: BindingMap = {
  walk: {
    ...COMMON,
    ...MOVE,
    sprint: [key('ShiftLeft'), key('ShiftRight'), pad(PAD.L3)],
    pace: [key('KeyX')],
    interact: [key('KeyF'), pad(PAD.X)],
    toggleView: [key('KeyV'), pad(PAD.R3)],
  },
  vehicle: {
    ...COMMON,
    moveX: [keyAxis('KeyA', 'KeyD'), stick(0)],
    moveY: [keyAxis('KeyS', 'KeyW'), { device: 'padButtonAxis', negative: PAD.LT, positive: PAD.RT }],
    handbrake: [key('Space'), pad(PAD.A)],
    lights: [key('KeyL')],
    interact: [key('KeyF'), pad(PAD.X)],
    toggleView: [key('KeyV'), pad(PAD.R3)],
  },
  fly: {
    ...COMMON,
    ...MOVE,
    fly: [keyAxis('KeyQ', 'KeyE'), { device: 'padButtonAxis', negative: PAD.LB, positive: PAD.RB }],
    sprint: [key('ShiftLeft'), key('ShiftRight'), pad(PAD.L3)],
  },
  ui: { pause: [key('Escape')], map: [key('KeyM')] },
};

/** 깊은 복사(재바인딩이 기본값을 건드리지 않도록). */
export function cloneBindings(m: BindingMap): BindingMap {
  return structuredClone(m);
}
