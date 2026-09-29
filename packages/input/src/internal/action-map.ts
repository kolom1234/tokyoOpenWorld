// 원시 입력 + 컨텍스트 바인딩 → 불변 ActionState 스냅샷(phase 0). see docs/09-traversal.md §4
import type { ActionState, AxisAction, Binding, ButtonAction, ContextBindings } from '../api.ts';
import { PAD_PRESS } from './devices/gamepad.ts';
import type { RawInput } from './raw-input.ts';

const padDown = (raw: RawInput, i: number): boolean => (raw.pad.buttons[i] ?? 0) > PAD_PRESS;
const holdOk = (raw: RawInput, hold: number | undefined): boolean => hold === undefined || padDown(raw, hold);

function isDown(raw: RawInput, b: Binding): boolean {
  if (b.device === 'key') return raw.keysDown.has(b.code) || raw.keysHit.has(b.code);
  if (b.device === 'mouseButton') return raw.buttonsDown.has(b.button) || raw.buttonsHit.has(b.button);
  if (b.device === 'padButton') return (padDown(raw, b.button) || raw.pad.hit.has(b.button)) && holdOk(raw, b.hold);
  return false;
}

function isHit(raw: RawInput, b: Binding): boolean {
  if (b.device === 'key') return raw.keysHit.has(b.code);
  if (b.device === 'mouseButton') return raw.buttonsHit.has(b.button);
  if (b.device === 'padButton') return raw.pad.hit.has(b.button) && holdOk(raw, b.hold);
  return false;
}

/** 누적(프레임 합) 축인지: 마우스, 초당 패드 축 — 자르지 않고 더한다. */
const isAccumulated = (b: Binding): boolean =>
  b.device === 'mouseAxis' || ((b.device === 'padAxis' || b.device === 'padButtonAxis') && b.perSecond === true);

function axisValue(raw: RawInput, b: Binding, dt: number): number {
  if (b.device === 'mouseAxis') return raw.mouse[b.axis];
  if (b.device === 'keyAxis') return (raw.keysDown.has(b.positive) ? 1 : 0) - (raw.keysDown.has(b.negative) ? 1 : 0);
  if (b.device === 'padAxis' || b.device === 'padButtonAxis') {
    const v =
      b.device === 'padAxis'
        ? (raw.pad.axes[b.axis] ?? 0)
        : (raw.pad.buttons[b.positive] ?? 0) - (raw.pad.buttons[b.negative] ?? 0);
    return v * (b.scale ?? 1) * (b.perSecond ? dt : 1);
  }
  return isDown(raw, b) ? 1 : 0;
}

/** 빈 상태(입력 없음). 첫 phase 0 이전과 'ui' 컨텍스트 등에서 사용. */
export const EMPTY_STATE: ActionState = { axis: () => 0, pressed: () => false, justPressed: () => false };

/**
 * 현재 원시 입력을 복사해 고정한다(이후 raw가 바뀌어도 결과 불변). 같은 액션의 여러 바인딩은
 * 버튼 = OR, 축 = 합(키·스틱 축은 −1…1로 자름, 마우스·초당 패드 축 누적은 그대로). dt = 프레임 시간(s, 초당 축용).
 */
export function snapshotActions(raw: RawInput, bindings: ContextBindings, dt = 0): ActionState {
  const pressed = new Set<ButtonAction>();
  const hit = new Set<ButtonAction>();
  const axes = new Map<AxisAction, number>();
  for (const [action, list] of Object.entries(bindings) as [ButtonAction | AxisAction, readonly Binding[]][]) {
    let down = false;
    let justHit = false;
    let keySum = 0;
    let mouseSum = 0;
    for (const b of list) {
      down ||= isDown(raw, b);
      justHit ||= isHit(raw, b);
      if (isAccumulated(b)) mouseSum += axisValue(raw, b, dt);
      else keySum += axisValue(raw, b, dt);
    }
    if (down) pressed.add(action as ButtonAction);
    if (justHit) hit.add(action as ButtonAction);
    const v = Math.max(-1, Math.min(1, keySum)) + mouseSum;
    if (v !== 0) axes.set(action as AxisAction, v);
  }
  return {
    axis: (a) => axes.get(a) ?? 0,
    pressed: (a) => pressed.has(a),
    justPressed: (a) => hit.has(a),
  };
}
