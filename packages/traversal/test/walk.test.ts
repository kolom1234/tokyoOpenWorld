// walk 모드(M04-T03) + 가짜 physics: C로 freecam → walk(하늘 레이로 지붕 아닌 지면에 착지), 걸음 단계·달리기·대각선, 1인칭 눈높이, V 3인칭, C 복귀(바디 유지).
import { createEventBus, createLogger, type FrameContext, type Vec3, type Vec3d } from '@sanpo/core';
import type { ActionState, AxisAction, ButtonAction, InputContext, InputService } from '@sanpo/input';
import type { BodyHandle, CharacterInput, PhysicsService, Pose, RayHit } from '@sanpo/physics';
import { describe, expect, it } from 'vitest';
import { createTraversal } from '../src/index.ts';
import { moveVelocity } from '../src/internal/modes/walk.ts';
import { spotCandidates, TERRAIN_LAYER } from '../src/internal/walk-placement.ts';

function fakeInput() {
  let context: InputContext = 'fly';
  const axes: Partial<Record<AxisAction, number>> = {};
  const held = new Set<ButtonAction>();
  const hits = new Set<ButtonAction>();
  const state: ActionState = {
    axis: (a) => axes[a] ?? 0,
    pressed: (a) => held.has(a) || hits.has(a),
    justPressed: (a) => hits.has(a),
  };
  const input = {
    state,
    get context() {
      return context;
    },
    pointerLocked: false,
    gamepadConnected: false,
    setContext: (c: InputContext) => {
      context = c;
    },
    rebind: () => undefined,
    bindings: () => ({ walk: {}, vehicle: {}, fly: {}, ui: {} }),
    dispose: () => undefined,
    systems: () => [],
  } as InputService;
  return { input, axes, held, hits };
}

/** 가짜 물리: 중심(원점 x < 5)은 지붕(STATIC_WORLD, y 30), 나머지는 지면(TERRAIN, y 2). 캐릭터는 명령 속도로 즉시 이동. */
function fakePhysics() {
  const rays: Vec3d[] = [];
  const inputs: CharacterInput[] = [];
  let body: { pos: Vec3d; vel: Vec3 } | undefined;
  let spawned = 0;
  const physics = {
    raycast(o: Vec3d): Promise<RayHit | null> {
      rays.push({ ...o });
      const roof = Math.hypot(o.x, o.z) < 5;
      return Promise.resolve({
        posWF: { x: o.x, y: roof ? 30 : 2, z: o.z },
        normal: { x: 0, y: 1, z: 0 },
        distance: 0,
        layer: roof ? 0 : TERRAIN_LAYER,
        material: 0,
      });
    },
    spawnCharacter(p: Vec3d): BodyHandle {
      spawned++;
      body = { pos: { ...p }, vel: { x: 0, y: 0, z: 0 } };
      return 1 as BodyHandle;
    },
    teleport(_h: BodyHandle, p: Vec3d) {
      if (body) body.pos = { ...p };
    },
    setCharacterInput(_h: BodyHandle, i: CharacterInput) {
      inputs.push(i);
      if (body) body.vel = { ...i.moveWF };
    },
    pose(): Pose | undefined {
      return body
        ? {
            posWF: body.pos,
            quat: { x: 0, y: 0, z: 0, w: 1 },
            linVel: body.vel,
            grounded: true,
            groundMaterial: 0,
            escalator: false,
          }
        : undefined;
    },
  } as unknown as PhysicsService;
  const step = (dt: number) => {
    if (!body) return;
    body.pos.x += body.vel.x * dt;
    body.pos.z += body.vel.z * dt;
  };
  return { physics, rays, inputs, step, spawned: () => spawned, body: () => body };
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
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup() {
  const inp = fakeInput();
  const phys = fakePhysics();
  const bus = createEventBus(log);
  const changes: string[] = [];
  bus.on('mode/changed', (e) => changes.push(`${e.from}->${e.to}`));
  const t = createTraversal(
    { input: inp.input, bus, log, ground: { groundHeightAt: () => 2 }, physics: phys.physics },
    // 설정: 헤드밥·시선 스무딩 끔(수치 확인).
    {
      initial: { mode: 'freecam', params: { posWF: { x: 0, y: 80, z: 0 }, yawRad: 0, pitchRad: -1 } },
      settings: { walk: { headBob: false, lookSmoothingS: 0 } },
    },
  );
  const sys = t.systems()[0];
  if (!sys) throw new Error('no system');
  const tick = (dt = 1 / 60) => {
    sys.update(frame(dt));
    phys.step(dt);
    inp.hits.clear();
  };
  tick(); // freecam 첫 출력(카메라 = 시작 포즈)
  return { t, sys, tick, changes, ...inp, ...phys };
}

describe('walk mode', () => {
  it('moveVelocity: yaw-relative, diagonal clamped to 1', () => {
    const v = moveVelocity(0, 1, 0, 1.35);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(-1.35, 12);
    const d = moveVelocity(1, 1, Math.PI / 2, 2);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(2, 12);
    expect(moveVelocity(0.5, 0, 0, 1.8).x).toBeCloseTo(0.9, 12);
    expect(spotCandidates({ x: 0, y: 0, z: 0 })).toHaveLength(33);
  });

  it('C from freecam lands on the nearest terrain spot (not the roof), then walks with pace steps and sprint', async () => {
    const s = await setup();
    s.hits.add('freeCam');
    s.tick();
    expect(s.t.mode).toBe('walk');
    expect(s.input.context).toBe('walk');
    expect(s.changes).toEqual(['freecam->walk']);
    // 레이 대기 중: 카메라는 freecam 자리.
    expect(s.t.camera.posWF.y).toBe(80);
    await flush();
    s.tick();
    // 중심은 지붕 → 첫 링(6 m) 지면.
    expect(s.spawned()).toBe(1);
    expect(Math.hypot(s.t.player.posWF.x, s.t.player.posWF.z)).toBeCloseTo(6, 6);
    expect(s.t.player.posWF.y).toBeCloseTo(2.02, 6);
    expect(s.t.camera.posWF.y).toBeCloseTo(2.02 + 1.6, 6);
    // 도착 피치는 ±20°로 제한.
    s.axes.moveY = 1;
    s.tick();
    expect(s.inputs.at(-1)?.moveWF.z).toBeCloseTo(-1.35, 9);
    for (const want of [1.8, 3.0, 1.35]) {
      s.hits.add('pace');
      s.tick();
      expect(Math.hypot(s.inputs.at(-1)?.moveWF.x ?? 0, s.inputs.at(-1)?.moveWF.z ?? 0)).toBeCloseTo(want, 9);
    }
    s.held.add('sprint');
    s.tick();
    expect(s.inputs.at(-1)?.moveWF.z).toBeCloseTo(-5, 9);
    s.held.delete('sprint');
    s.tick();
    expect(s.t.hud.speedKmh).toBeCloseTo(1.35 * 3.6, 6);
    expect(s.t.player.velWF.z).toBeCloseTo(-1.35, 9);
  });

  it('V toggles a third-person camera behind the shoulder; C returns to freecam at the camera and back to the body', async () => {
    const s = await setup();
    s.hits.add('freeCam');
    s.tick();
    await flush();
    s.tick();
    const feet = { ...s.t.player.posWF };
    expect(s.t.view).toBe('first');
    s.hits.add('toggleView');
    s.tick();
    expect(s.t.view).toBe('third');
    // yaw = 0(북 −Z)·피치 −20° → 카메라는 발 뒤(+Z)·위, 오른쪽 어깨(+X 0.4).
    expect(s.t.camera.posWF.z).toBeGreaterThan(feet.z + 3);
    expect(s.t.camera.posWF.x).toBeCloseTo(feet.x + 0.4, 6);
    expect(s.t.camera.posWF.y).toBeGreaterThan(feet.y + 1.55);
    s.hits.add('freeCam');
    s.tick();
    expect(s.t.mode).toBe('freecam');
    expect(s.input.context).toBe('fly');
    const cam = { ...s.t.camera.posWF };
    s.tick();
    expect(s.t.camera.posWF.z).toBeCloseTo(cam.z, 6);
    // 바디는 150 m 안 → 복귀(새 레이·스폰 없음).
    const rays = s.rays.length;
    s.hits.add('freeCam');
    s.tick();
    expect(s.t.mode).toBe('walk');
    expect(s.rays.length).toBe(rays);
    expect(s.t.player.posWF.x).toBeCloseTo(feet.x, 9);
    expect(s.spawned()).toBe(1);
  });

  it('far from the body, C from freecam re-places the character under the camera', async () => {
    const s = await setup();
    s.hits.add('freeCam');
    s.tick();
    await flush();
    s.tick();
    s.hits.add('freeCam');
    s.tick();
    s.t.request('freecam', { posWF: { x: 500, y: 60, z: 500 }, yawRad: 0, pitchRad: 0 });
    s.tick();
    s.hits.add('freeCam');
    s.tick();
    await flush();
    s.tick();
    expect(s.spawned()).toBe(1);
    expect(s.t.player.posWF.x).toBeCloseTo(500, 6);
    expect(s.t.player.posWF.z).toBeCloseTo(500, 6);
  });
});
