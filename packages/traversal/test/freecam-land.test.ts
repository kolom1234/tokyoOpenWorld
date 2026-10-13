// freecam G 카메라 아래 내리기(ADR-0083): landing 성공 → walk(exact — 그 자리 바디), 실패 → hud.landing 이유, 컨텍스트 없음 → not-ready, 늦은 결과(모드 나감) 버림.
import { createEventBus, createLogger, type FrameContext, type Vec3d } from '@sanpo/core';
import type { ActionState, ButtonAction, InputContext, InputService } from '@sanpo/input';
import type { BodyHandle, PhysicsService, Pose } from '@sanpo/physics';
import { describe, expect, it } from 'vitest';
import { createTraversal, type LandingResult } from '../src/index.ts';

const log = createLogger({ sink: () => undefined });
const frame = (dt: number): FrameContext => ({
  frameIndex: 0,
  dtReal: dt,
  dtGame: dt,
  gameTimeMs: 0,
  camera: { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 70, near: 0.1 },
  player: { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0, mode: 'freecam' },
});
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(landing?: (p: Readonly<Vec3d>) => Promise<LandingResult>) {
  const hits = new Set<ButtonAction>();
  let context: InputContext = 'fly';
  const state: ActionState = { axis: () => 0, pressed: (a) => hits.has(a), justPressed: (a) => hits.has(a) };
  const input = {
    state,
    get context() {
      return context;
    },
    setContext: (c: InputContext) => {
      context = c;
    },
    systems: () => [],
  } as unknown as InputService;
  let body: Vec3d | undefined;
  const physics = {
    hasCell: () => true,
    raycast: () => Promise.resolve(null),
    sphereCast: () => Promise.resolve(null),
    spawnCharacter: (p: Vec3d) => {
      body = { ...p };
      return 1 as BodyHandle;
    },
    teleport: (_h: BodyHandle, p: Vec3d) => {
      body = { ...p };
    },
    setCharacterInput: () => undefined,
    pose: (): Pose | undefined =>
      body
        ? {
            posWF: body,
            quat: { x: 0, y: 0, z: 0, w: 1 },
            linVel: { x: 0, y: 0, z: 0 },
            grounded: true,
            groundMaterial: 0,
            escalator: false,
          }
        : undefined,
  } as unknown as PhysicsService;
  const asked: Vec3d[] = [];
  const t = createTraversal(
    {
      input,
      bus: createEventBus(log),
      log,
      ground: { groundHeightAt: () => 2 },
      physics,
      ...(landing
        ? {
            landing: (p: Readonly<Vec3d>) => {
              asked.push({ ...p });
              return landing(p);
            },
          }
        : {}),
    },
    { initial: { mode: 'freecam', params: { posWF: { x: 10, y: 40, z: -5 }, yawRad: 1, pitchRad: -0.5 } } },
  );
  const sys = t.systems()[0];
  if (!sys) throw new Error('no system');
  const tick = () => {
    sys.update(frame(1 / 60));
    hits.clear();
  };
  tick();
  return { t, tick, hits, asked, body: () => body };
}

describe('freecam G landing', () => {
  it('ok → walk exactly at the returned spot, facing the camera yaw', async () => {
    const s = setup(() => Promise.resolve({ ok: true, posWF: { x: 11, y: 2.5, z: -6 } }));
    s.hits.add('land');
    s.tick();
    expect(s.asked[0]).toEqual({ x: 10, y: 40, z: -5 });
    expect(s.t.hud.landing?.state).toBe('searching');
    await flush();
    s.tick();
    s.tick();
    expect(s.t.mode).toBe('walk');
    expect(s.body()).toEqual({ x: 11, y: 2.5, z: -6 });
    expect(s.t.player.yawRad).toBeCloseTo(1, 6);
  });
  it('failure → stays in freecam with the reason; a second G retries with a new seq', async () => {
    const s = setup(() => Promise.resolve({ ok: false, reason: 'track' }));
    s.hits.add('land');
    s.tick();
    await flush();
    s.tick();
    expect(s.t.mode).toBe('freecam');
    expect(s.t.hud.landing).toMatchObject({ state: 'failed', reason: 'track' });
    const seq = s.t.hud.landing?.seq ?? 0;
    s.hits.add('land');
    s.tick();
    await flush();
    s.tick();
    expect(s.t.hud.landing?.seq).toBe(seq + 1);
  });
  it('no landing hook → not-ready; result arriving after leaving freecam is dropped', async () => {
    const s = setup();
    s.hits.add('land');
    s.tick();
    expect(s.t.hud.landing).toMatchObject({ state: 'failed', reason: 'not-ready' });
    let resolve: (r: LandingResult) => void = () => undefined;
    const late = setup(() => new Promise<LandingResult>((r) => (resolve = r)));
    late.hits.add('land');
    late.tick();
    late.hits.add('freeCam');
    late.tick();
    expect(late.t.mode).toBe('walk');
    resolve({ ok: true, posWF: { x: 99, y: 0, z: 99 } });
    await flush();
    late.tick();
    expect(late.body()?.x).not.toBe(99);
  });
});
