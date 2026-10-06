// @sanpo/input 공개 계약: 액션·바인딩·ActionState·InputService. 구현은 internal/*. see docs/modules/input.md, docs/09-traversal.md §4
import type { EventBus, Logger, SystemProvider } from '@sanpo/core';

/** 활성 바인딩 묶음. traversal 모드가 전환 시 설정한다(freecam = 'fly'). */
export type InputContext = 'walk' | 'vehicle' | 'fly' | 'ui';

/** 버튼 액션(09 §4 표). */
export type ButtonAction =
  | 'sprint'
  | 'pace'
  | 'interact'
  | 'toggleView'
  | 'freeCam'
  | 'map'
  | 'photo'
  | 'pause'
  | 'handbrake'
  | 'lights'
  /** 열차: 다음 역까지 빨리감기(T, M07-T05). */
  | 'skip';

/**
 * 축 액션. 단위는 디바이스 원값 — 감도(픽셀→라디안 등)는 소비자(traversal) 설정.
 * - `moveX` 오른쪽 +, `moveY` 앞 + (키 축: −1…1)
 * - `lookX` 오른쪽 +, `lookY` 아래 + (이번 프레임 누적 마우스 이동, CSS 픽셀)
 * - `fly` 위 + (E/Q: −1…1)
 * - `wheel` 휠을 위로(멀리) 굴리면 + (이번 프레임 누적 노치, 1 노치 ≈ 100 px)
 */
export type AxisAction = 'moveX' | 'moveY' | 'lookX' | 'lookY' | 'fly' | 'wheel';
export type Action = ButtonAction | AxisAction;

export type MouseAxis = 'x' | 'y' | 'wheel';
/** 디바이스 입력 1개. 키는 `KeyboardEvent.code`(배열 독립), 마우스 버튼은 `MouseEvent.button`. */
export type Binding =
  | { device: 'key'; code: string }
  | { device: 'mouseButton'; button: number }
  /** 두 키 → 축 −1…1 (둘 다 누르면 0). */
  | { device: 'keyAxis'; negative: string; positive: string }
  | { device: 'mouseAxis'; axis: MouseAxis }
  /**
   * 게임패드 버튼(Gamepad API 표준 매핑: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Select, 9 Start, 10 L3, 11 R3, 12–15 D-pad ↑↓←→).
   * hold = 함께 누르고 있어야 하는 버튼(Select+Y 등 조합).
   */
  | { device: 'padButton'; button: number; hold?: number }
  /**
   * 게임패드 축(0 L스틱 X 오른쪽 +, 1 L스틱 Y 아래 +, 2·3 R스틱) — 원형 데드존 뒤 값 × scale.
   * perSecond = 초당 값(× 프레임 dt — 시선·휠처럼 마우스 누적과 더하는 축).
   */
  | { device: 'padAxis'; axis: number; scale?: number; perSecond?: boolean }
  /** 두 버튼 값(트리거 = 아날로그) → 축(양 − 음) × scale. */
  | { device: 'padButtonAxis'; negative: number; positive: number; scale?: number; perSecond?: boolean };
export type ContextBindings = Partial<Record<Action, readonly Binding[]>>;
export type BindingMap = Record<InputContext, ContextBindings>;

/** 한 프레임 동안 불변(phase 0에서만 갱신). */
export interface ActionState {
  axis(a: AxisAction): number;
  /** 누르고 있음, 또는 이번 프레임 사이에 눌렀다 뗌. */
  pressed(a: ButtonAction): boolean;
  /** 이번 프레임에 새로 눌림(키 반복 제외). */
  justPressed(a: ButtonAction): boolean;
}

export interface InputService extends SystemProvider {
  readonly state: ActionState;
  readonly context: InputContext;
  /** 마우스가 target에 Pointer Lock 되어 있는지. */
  readonly pointerLocked: boolean;
  /** 게임패드가 연결돼 있는지(마지막 폴링). */
  readonly gamepadConnected: boolean;
  setContext(c: InputContext): void;
  /** 액션의 바인딩을 b 하나로 교체(기본: 현재 컨텍스트). */
  rebind(a: Action, b: Binding, context?: InputContext): void;
  bindings(): BindingMap;
  /** DOM 리스너 해제. */
  dispose(): void;
}

export interface InputDeps {
  /** 마우스 이벤트·Pointer Lock 대상(보통 게임 캔버스). 키보드는 target의 window에서 받는다. */
  target: HTMLElement;
  bus?: EventBus;
  log: Logger;
  bindings?: BindingMap;
  /** 시작 컨텍스트(기본 'walk'). */
  context?: InputContext;
}
