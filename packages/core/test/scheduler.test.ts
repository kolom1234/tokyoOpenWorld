// 스케줄러: phase 순서·provider·dt 클램프·예외 격리·remove/dispose. see docs/01-architecture.md §5
import { describe, expect, it } from 'vitest';
import {
  createScheduler,
  type FrameContext,
  type FrameSource,
  type GameSystem,
  MAX_DT_REAL_S,
  quatIdentity,
  vec3,
} from '../src/index.ts';
import { recordingLogger } from './helpers.ts';

function source(timeScale = 1): FrameSource {
  return {
    camera: () => ({ posWF: vec3(1, 2, 3), quat: quatIdentity(), fovDeg: 60, near: 0.1 }),
    player: () => ({ posWF: vec3(), velWF: vec3(), yawRad: 0, mode: 'walk' }),
    gameTimeMs: () => 1_700_000_000_000,
    timeScale: () => timeScale,
  };
}

function sys(id: string, phase: number, calls: string[], extra: Partial<GameSystem> = {}): GameSystem {
  return { id, phase, update: () => calls.push(id), dispose: () => calls.push(`dispose:${id}`), ...extra };
}

function setup(timeScale = 1) {
  const { log, records } = recordingLogger();
  let now = 0;
  const s = createScheduler({ log, clock: () => now });
  s.setFrameSource(source(timeScale));
  return { s, records, advance: (ms: number) => (now += ms) };
}

describe('Scheduler', () => {
  it('runs systems in ascending phase, ties in registration order', () => {
    const { s } = setup();
    const calls: string[] = [];
    s.add(sys('render', 80, calls));
    s.add(sys('input', 0, calls));
    s.add(sys('traversal', 20, calls));
    s.add(sys('traversal2', 20, calls));
    s.add(sys('clock', 10, calls));
    s.tick(0);
    expect(calls).toEqual(['input', 'clock', 'traversal', 'traversal2', 'render']);
  });

  it('accepts SystemProvider with multiple phases', () => {
    const { s } = setup();
    const calls: string[] = [];
    s.add({ systems: () => [sys('renderPrep', 70, calls), sys('render', 80, calls)] });
    s.add(sys('streaming', 50, calls));
    s.add(sys('ui', 90, calls));
    s.tick(0);
    expect(calls).toEqual(['streaming', 'renderPrep', 'render', 'ui']);
  });

  it('rejects duplicate ids and ticking without a frame source', () => {
    const { log } = recordingLogger();
    const s = createScheduler({ log, clock: () => 0 });
    s.add(sys('a', 0, []));
    expect(() => s.add(sys('a', 10, []))).toThrow(/duplicate/);
    expect(() => s.tick(0)).toThrow(/setFrameSource/);
  });

  it('builds FrameContext: first dt=0, clamps dtReal to [0, 0.1], applies timeScale', () => {
    const { s } = setup(60);
    const frames: FrameContext[] = [];
    s.add({ id: 'probe', phase: 0, update: (f) => frames.push(f), dispose: () => {} });
    s.tick(1000);
    s.tick(1016);
    s.tick(6016); // 5 s 정지(탭 전환)
    s.tick(6000); // 시계 역행
    expect(frames.map((f) => f.frameIndex)).toEqual([0, 1, 2, 3]);
    expect(frames.map((f) => f.dtReal)).toEqual([0, 0.016, MAX_DT_REAL_S, 0]);
    expect(frames[1]?.dtGame).toBeCloseTo(0.016 * 60, 10);
    expect(frames[0]?.gameTimeMs).toBe(1_700_000_000_000);
    expect(frames[0]?.camera.posWF).toEqual({ x: 1, y: 2, z: 3 });
    expect(frames[0]?.player.mode).toBe('walk');
  });

  it('isolates a throwing system and keeps the frame going', () => {
    const { s, records } = setup();
    const calls: string[] = [];
    s.add(sys('a', 0, calls));
    s.add(
      sys('boom', 10, calls, {
        update: () => {
          throw new Error('x');
        },
      }),
    );
    s.add(sys('c', 20, calls));
    s.tick(0);
    expect(calls).toEqual(['a', 'c']);
    expect(records.some((r) => r.level === 'error' && String(r.args[0]).includes('boom'))).toBe(true);
  });

  it('remove() disposes and takes effect; add during tick applies next frame, remove immediately', () => {
    const { s } = setup();
    const calls: string[] = [];
    let added = false;
    s.add(
      sys('adder', 0, calls, {
        update: () => {
          calls.push('adder');
          if (!added) {
            added = true;
            s.add(sys('late', 5, calls));
            s.remove('victim');
          }
        },
      }),
    );
    s.add(sys('victim', 10, calls));
    s.tick(0);
    // late는 다음 프레임부터, victim은 dispose 후 즉시 제외(같은 프레임에서도 update 안 됨).
    expect(calls).toEqual(['adder', 'dispose:victim']);
    calls.length = 0;
    s.tick(16);
    expect(calls).toEqual(['adder', 'late']);
    s.remove('missing'); // no-op
  });

  it('init() awaits systems in phase order', async () => {
    const { s } = setup();
    const order: string[] = [];
    const mk = (id: string, phase: number): GameSystem => ({
      id,
      phase,
      init: async () => {
        await Promise.resolve();
        order.push(id);
      },
      update: () => {},
      dispose: () => {},
    });
    s.add(mk('b', 20));
    s.add(mk('a', 10));
    s.add(sys('noInit', 0, []));
    await s.init();
    expect(order).toEqual(['a', 'b']);
  });

  it('warns (throttled) when a system exceeds the 4 ms budget', () => {
    const { s, records, advance } = setup();
    s.add({ id: 'slow', phase: 0, update: () => advance(5), dispose: () => {} });
    for (let i = 0; i < 10; i++) s.tick(i * 16);
    const warns = records.filter((r) => r.level === 'warn');
    expect(warns).toHaveLength(1);
    expect(String(warns[0]?.args[0])).toMatch(/slow/);
  });
});
