// 액션 맵: 원시 입력 → 컨텍스트별 ActionState 스냅샷(축·버튼·에지·누적), 편집 대상 판별. see docs/modules/input.md
import { describe, expect, it } from 'vitest';
import { snapshotActions } from '../src/internal/action-map.ts';
import { DEFAULT_BINDINGS } from '../src/internal/default-bindings.ts';
import { isEditableTarget } from '../src/internal/devices/keyboard.ts';
import {
  buttonDown,
  createRawInput,
  endFrame,
  keyDown,
  keyUp,
  mouseMove,
  releaseAll,
  wheel,
} from '../src/internal/raw-input.ts';

const fly = DEFAULT_BINDINGS.fly;

describe('snapshotActions', () => {
  it('maps WASD/E/Q to axes in the fly context', () => {
    const raw = createRawInput();
    keyDown(raw, 'KeyW', false);
    keyDown(raw, 'KeyD', false);
    keyDown(raw, 'KeyQ', false);
    const s = snapshotActions(raw, fly);
    expect(s.axis('moveY')).toBe(1);
    expect(s.axis('moveX')).toBe(1);
    expect(s.axis('fly')).toBe(-1);
    keyDown(raw, 'KeyE', false);
    expect(snapshotActions(raw, fly).axis('fly')).toBe(0);
  });

  it('is immutable after capture (raw changes do not leak into the frame)', () => {
    const raw = createRawInput();
    keyDown(raw, 'KeyW', false);
    const s = snapshotActions(raw, fly);
    keyUp(raw, 'KeyW');
    mouseMove(raw, 50, 0);
    expect(s.axis('moveY')).toBe(1);
    expect(s.axis('lookX')).toBe(0);
  });

  it('justPressed fires only on the first frame and ignores key repeat', () => {
    const raw = createRawInput();
    keyDown(raw, 'KeyC', false);
    expect(snapshotActions(raw, fly).justPressed('freeCam')).toBe(true);
    endFrame(raw);
    keyDown(raw, 'KeyC', true);
    const s2 = snapshotActions(raw, fly);
    expect(s2.justPressed('freeCam')).toBe(false);
    expect(s2.pressed('freeCam')).toBe(true);
  });

  it('a tap between two frames still counts as pressed + justPressed', () => {
    const raw = createRawInput();
    keyDown(raw, 'ShiftLeft', false);
    keyUp(raw, 'ShiftLeft');
    const s = snapshotActions(raw, fly);
    expect(s.pressed('sprint')).toBe(true);
    expect(s.justPressed('sprint')).toBe(true);
  });

  it('accumulates mouse movement and wheel notches per frame, then resets', () => {
    const raw = createRawInput();
    mouseMove(raw, 3, -2);
    mouseMove(raw, 4, 1);
    wheel(raw, -200, 0); // 위로 2노치(픽셀 모드)
    wheel(raw, 3, 1); // 아래로 1노치(줄 모드)
    const s = snapshotActions(raw, fly);
    expect(s.axis('lookX')).toBe(7);
    expect(s.axis('lookY')).toBe(-1);
    expect(s.axis('wheel')).toBe(1);
    endFrame(raw);
    expect(snapshotActions(raw, fly).axis('lookX')).toBe(0);
  });

  it('bindings are per context (E/Q fly only in fly; mouse buttons map when bound)', () => {
    const raw = createRawInput();
    keyDown(raw, 'KeyE', false);
    expect(snapshotActions(raw, DEFAULT_BINDINGS.walk).axis('fly')).toBe(0);
    buttonDown(raw, 2);
    const s = snapshotActions(raw, { interact: [{ device: 'mouseButton', button: 2 }] });
    expect(s.justPressed('interact')).toBe(true);
  });

  it('releaseAll clears held keys (window blur)', () => {
    const raw = createRawInput();
    keyDown(raw, 'KeyW', false);
    endFrame(raw);
    releaseAll(raw);
    expect(snapshotActions(raw, fly).axis('moveY')).toBe(0);
  });
});

describe('isEditableTarget', () => {
  it('detects text inputs and contentEditable', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({ tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });
});
