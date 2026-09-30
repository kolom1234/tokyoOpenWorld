// 게임패드(M04-T03): 원형 데드존·재조정, 버튼 새 눌림(에지), 연결 해제 시 0, 기본 바인딩(L스틱 이동·R스틱 시선 초당·Select+Y 조합·트리거 축).
import { describe, expect, it } from 'vitest';
import { snapshotActions } from '../src/internal/action-map.ts';
import { DEFAULT_BINDINGS, PAD_LOOK_PX_PER_S } from '../src/internal/default-bindings.ts';
import { deadzone, type PadLike, readPad, STICK_DEADZONE } from '../src/internal/devices/gamepad.ts';
import { createRawInput, endFrame } from '../src/internal/raw-input.ts';

function pad(axes: number[] = [0, 0, 0, 0], pressed: number[] = [], values: Record<number, number> = {}): PadLike {
  const buttons = Array.from({ length: 17 }, (_, i) => ({
    pressed: pressed.includes(i) || (values[i] ?? 0) > 0.1,
    value: values[i] ?? (pressed.includes(i) ? 1 : 0),
  }));
  return { connected: true, mapping: 'standard', axes, buttons };
}

describe('gamepad', () => {
  it('applies a radial deadzone and rescales to 0…1', () => {
    expect(deadzone(0.1, 0.1)).toEqual([0, 0]);
    const [x, y] = deadzone(1, 0);
    expect(x).toBeCloseTo(1, 12);
    expect(y).toBe(0);
    const [hx] = deadzone((1 + STICK_DEADZONE) / 2, 0);
    expect(hx).toBeCloseTo(0.5, 12);
    const [dx, dy] = deadzone(0.6, 0.8);
    expect(Math.hypot(dx, dy)).toBeCloseTo(1, 12);
  });

  it('maps sticks, look per second, pad button edges and the Select+Y chord', () => {
    const raw = createRawInput();
    readPad(raw, pad([0.5, -1, 1, 0], [10]));
    const walk = snapshotActions(raw, DEFAULT_BINDINGS.walk, 0.02);
    // (0.5, −1)은 크기 > 1 → 방향 유지·크기 1로.
    expect(walk.axis('moveY')).toBeCloseTo(1 / Math.hypot(0.5, 1), 12);
    expect(walk.axis('moveX')).toBeCloseTo(0.5 / Math.hypot(0.5, 1), 12);
    expect(walk.axis('lookX')).toBeCloseTo(PAD_LOOK_PX_PER_S * 0.02, 9);
    expect(walk.pressed('sprint')).toBe(true);
    expect(walk.justPressed('sprint')).toBe(true);
    endFrame(raw);
    readPad(raw, pad([0, 0, 0, 0], [10]));
    const held = snapshotActions(raw, DEFAULT_BINDINGS.walk, 0.02);
    expect(held.pressed('sprint')).toBe(true);
    expect(held.justPressed('sprint')).toBe(false);
    // Y만 = freecam 아님, Select 누른 채 Y = freecam.
    endFrame(raw);
    readPad(raw, pad([0, 0, 0, 0], [3]));
    expect(snapshotActions(raw, DEFAULT_BINDINGS.walk).justPressed('freeCam')).toBe(false);
    endFrame(raw);
    readPad(raw, pad([0, 0, 0, 0], [8]));
    endFrame(raw);
    readPad(raw, pad([0, 0, 0, 0], [8, 3]));
    expect(snapshotActions(raw, DEFAULT_BINDINGS.walk).justPressed('freeCam')).toBe(true);
  });

  it('reads triggers as an analog axis (vehicle) and clears everything on disconnect', () => {
    const raw = createRawInput();
    readPad(raw, pad([0, 0, 0, 0], [], { 7: 0.75, 6: 0.25 }));
    expect(snapshotActions(raw, DEFAULT_BINDINGS.vehicle).axis('moveY')).toBeCloseTo(0.5, 12);
    readPad(raw, undefined);
    expect(raw.pad.connected).toBe(false);
    expect(snapshotActions(raw, DEFAULT_BINDINGS.vehicle).axis('moveY')).toBe(0);
  });

  it('adds keyboard and stick for the same axis, clamped to −1…1', () => {
    const raw = createRawInput();
    raw.keysDown.add('KeyW');
    readPad(raw, pad([0, -1, 0, 0]));
    expect(snapshotActions(raw, DEFAULT_BINDINGS.fly).axis('moveY')).toBe(1);
    readPad(raw, pad([0, 0, 0, 0], [5]));
    expect(snapshotActions(raw, DEFAULT_BINDINGS.fly).axis('fly')).toBe(1);
  });
});
