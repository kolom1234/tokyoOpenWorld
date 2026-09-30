// createTraversal(freecam만, physics 없음): 시작 포즈·입력 컨텍스트·이동·teleport·모드 거부. see docs/modules/traversal.md
import { createEventBus, createLogger, type FrameContext } from '@sanpo/core';
import type { ActionState, AxisAction, ButtonAction, InputContext, InputService } from '@sanpo/input';
import { describe, expect, it } from 'vitest';
import { createTraversal, type TraversalMode } from '../src/index.ts';

function fakeInput(axes: Partial<Record<AxisAction, number>> = {}, hits: ButtonAction[] = []) {
  let context: InputContext = 'walk';
  const state: ActionState = {
    axis: (a) => axes[a] ?? 0,
    pressed: (a) => hits.includes(a),
    justPressed: (a) => hits.includes(a),
  };
  const input: InputService = {
    state,
    get context() {
      return context;
    },
    pointerLocked: false,
    gamepadConnected: false,
    setContext: (c) => {
      context = c;
    },
    rebind: () => undefined,
    bindings: () => ({ walk: {}, vehicle: {}, fly: {}, ui: {} }),
    dispose: () => undefined,
    systems: () => [],
  };
  return { input, hits };
}

const log = createLogger({ sink: () => undefined });
const frame = (dt: number): FrameContext => ({
  frameIndex: 0,
  dtReal: dt,
  dtGame: dt,
  gameTimeMs: 0,
  camera: { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 70, near: 0.1 },
  player: { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0, mode: 'freecam' },
});

describe('createTraversal (freecam only, no physics)', () => {
  it('starts in freecam at the requested pose and switches input to the fly context', () => {
    const { input } = fakeInput();
    const t = createTraversal(
      { input, bus: createEventBus(log), log, ground: { groundHeightAt: () => undefined } },
      { initial: { mode: 'freecam', params: { posWF: { x: -60, y: 75, z: -15 }, yawRad: 1, pitchRad: 0.2 } } },
    );
    expect(t.mode).toBe('freecam');
    expect(input.context).toBe('fly');
    t.systems()[0]?.update(frame(0));
    expect(t.camera.posWF).toEqual({ x: -60, y: 75, z: -15 });
    expect(t.player.posWF).toEqual({ x: -60, y: 75, z: -15 });
    expect(t.player.yawRad).toBeCloseTo(1, 12);
    expect(t.camera.fovDeg).toBe(70);
    expect(t.systems()[0]?.phase).toBe(20);
  });

  it('moves forward with W and reports speed in km/h; teleport keeps pitch and zeroes velocity', async () => {
    const { input } = fakeInput({ moveY: 1 });
    const t = createTraversal({ input, bus: createEventBus(log), log, ground: { groundHeightAt: () => 0 } });
    const sys = t.systems()[0];
    for (let i = 0; i < 60; i++) sys?.update(frame(1 / 60));
    expect(t.camera.posWF.z).toBeLessThan(-5);
    expect(t.hud.speedKmh).toBeGreaterThan(30);
    await t.teleport({ x: 4096, y: 80, z: 0 }, 0);
    expect(t.camera.posWF.x).toBe(0); // 카메라 출력은 다음 update에서 확정
    sys?.update(frame(0));
    expect(t.camera.posWF.x).toBe(4096);
  });

  it('rejects modes that need physics and keeps freecam on C (no previous mode)', () => {
    const { input, hits } = fakeInput();
    const bus = createEventBus(log);
    const changes: string[] = [];
    bus.on('mode/changed', (e) => changes.push(`${e.from}->${e.to}`));
    const t = createTraversal({ input, bus, log, ground: { groundHeightAt: () => undefined } });
    const drive: TraversalMode = {
      id: 'drive',
      requires: ['physics'],
      enter: () => undefined,
      exit: () => undefined,
      update: () => {
        throw new Error('unreachable');
      },
    };
    t.register(drive);
    expect(t.request('walk')).toBe(false);
    expect(t.request('drive')).toBe(false);
    expect(t.request('train')).toBe(false);
    hits.push('freeCam');
    t.systems()[0]?.update(frame(0.016));
    expect(t.mode).toBe('freecam');
    expect(changes).toEqual([]);
    expect(() => t.register(drive)).toThrow(/already registered/);
  });
});
