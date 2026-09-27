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
  | 'lights';

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
  | { device: 'mouseAxis'; axis: MouseAxis };
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
