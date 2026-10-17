// drive 모드(M08-T01) + 가짜 physics: 운전자 입력(가속·제동·정지 후 후진·크리프 정지), 키보드 조향 램프, V 시점(추적 뒤 5.5 m ↔ 우핸들 운전석),
// 방향지시등 자동 끔, F 하차(달리는 중 = moving, 멈추면 운전석 쪽 지면에 walk exact), HUD 계기판.
import { createEventBus, createLogger, type FrameContext, type Vec3d } from '@sanpo/core';
import type { ActionState, AxisAction, ButtonAction, InputContext, InputService } from '@sanpo/input';
import type { BodyHandle, PhysicsService, Pose, RayHit, VehicleInput, VehicleState } from '@sanpo/physics';
import { describe, expect, it } from 'vitest';
import { createTraversal, type DriveParams } from '../src/index.ts';
import { driverInput, rampSteer } from '../src/internal/modes/drive.ts';

function fakeInput() {
  let context: InputContext = 'fly';
  const axes: Partial<Record<AxisAction, number>> = {};
  const hits = new Set<ButtonAction>();
  const state: ActionState = {
    axis: (a) => axes[a] ?? 0,
    pressed: (a) => hits.has(a),
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
  return { input, axes, hits };
}

/** 가짜 물리: 차는 원점(yaw 0 — 전방 −Z)·속력 car.speed. 아래 레이 = 지면 y 0(TERRAIN). 캐릭터 생성 기록. */
function fakePhysics() {
  const car = { speed: 0, gear: 1 };
  const inputs: VehicleInput[] = [];
  const rays: Vec3d[] = [];
  const pose: Pose = {
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    linVel: { x: 0, y: 0, z: 0 },
    grounded: true,
    groundMaterial: 1,
    escalator: false,
  };
  const physics = {
    pose: () => ({ ...pose, linVel: { x: 0, y: 0, z: -car.speed } }),
    vehicleState: (): VehicleState => ({
      speedMs: car.speed,
      rpm: 1500,
      gear: car.gear,
      throttle: 0,
      abs: false,
      tcs: false,
      shifting: false,
      wheels: [],
    }),
    setVehicleInput: (_h: BodyHandle, i: VehicleInput) => void inputs.push({ ...i }),
    raycast(o: Vec3d): Promise<RayHit | null> {
      rays.push({ ...o });
      return Promise.resolve({
        posWF: { x: o.x, y: 0, z: o.z },
        normal: { x: 0, y: 1, z: 0 },
        distance: 2.2,
        layer: 1,
        material: 1,
      });
    },
    sphereCast: () => Promise.resolve(null),
    spawnCharacter: () => 7 as BodyHandle,
    teleport: () => undefined,
    setCharacterInput: () => undefined,
    despawn: () => undefined,
    hasCell: () => true,
  } as unknown as PhysicsService;
  return { physics, car, inputs, rays };
}

const log = createLogger({ level: 'warn' });
const frame = (i: number): FrameContext =>
  ({ frameIndex: i, dtReal: 1 / 60, dtGame: 1 / 60, gameTimeMs: 0 }) as FrameContext;

function setup() {
  const inp = fakeInput();
  const ph = fakePhysics();
  const t = createTraversal({
    input: inp.input,
    bus: createEventBus(log),
    log,
    ground: { groundHeightAt: () => 0 },
    physics: ph.physics,
  });
  const params: DriveParams = { vehicle: 3 as BodyHandle, kind: 'sedan' };
  expect(t.request('drive', params)).toBe(true);
  const sys = t.systems()[0];
  if (!sys) throw new Error('no system');
  let n = 0;
  const step = async (k = 1) => {
    for (let i = 0; i < k; i++) {
      sys.update(frame(n++));
      await Promise.resolve();
    }
    inp.hits.clear();
  };
  return { t, inp, ph, step };
}

describe('drive mode (M08-T01)', () => {
  it('driver input: W throttles, S brakes while moving and reverses when stopped, idle holds', () => {
    expect(driverInput(1, 0, 0, false)).toMatchObject({ throttle: 1, brake: 0, reverse: false });
    expect(driverInput(-1, 10, 0, false)).toMatchObject({ throttle: 0, brake: 1, reverse: false });
    expect(driverInput(-0.5, 0.1, 0, false)).toMatchObject({ throttle: 0.5, brake: 0, reverse: true });
    expect(driverInput(1, -3, 0, false)).toMatchObject({ throttle: 0, brake: 1 });
    expect(driverInput(0, 0.1, 0, false).brake).toBeGreaterThan(0);
    expect(driverInput(0, 10, 0, false).brake).toBe(0);
  });

  it('keyboard steering ramps in (≈0.45 s to full) and returns faster', () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s = rampSteer(s, 1, 1 / 60);
    expect(s).toBeCloseTo((6 / 60) * 2.2, 5);
    for (let i = 0; i < 60; i++) s = rampSteer(s, 1, 1 / 60);
    expect(s).toBe(1);
    for (let i = 0; i < 15; i++) s = rampSteer(s, 0, 1 / 60);
    expect(s).toBe(0);
  });

  it('vehicle context, chase camera behind the car, V = right-hand cockpit, HUD gauges', async () => {
    const { t, inp, ph, step } = setup();
    expect(inp.input.context).toBe('vehicle');
    inp.axes.moveY = 1;
    await step(60);
    expect(ph.inputs.at(-1)?.throttle).toBe(1);
    // 추적: 차(원점, 전방 −Z) 뒤(+Z)·위.
    expect(t.camera.posWF.z).toBeGreaterThan(4);
    expect(t.camera.posWF.y).toBeGreaterThan(1.2);
    expect(t.hud.drive).toMatchObject({ gear: '1', view: 'chase', lights: false });
    inp.hits.add('toggleView');
    inp.hits.add('lights');
    await step();
    expect(t.hud.drive?.view).toBe('cockpit');
    expect(t.hud.drive?.lights).toBe(true);
    // 우핸들: 눈이 오른쪽(+X) 0.37 m, 높이 1.30 m.
    expect(t.camera.posWF.x).toBeCloseTo(0.37, 2);
    expect(t.camera.posWF.y).toBeCloseTo(1.3, 2);
    expect(t.player.mode).toBe('drive');
  });

  it('indicator turns off after the turn is completed', async () => {
    const { t, inp, step } = setup();
    inp.hits.add('indicatorRight');
    await step();
    expect(t.hud.drive?.indicator).toBe(1);
    inp.axes.moveX = 1;
    await step(40);
    expect(t.hud.drive?.indicator).toBe(1);
    inp.axes.moveX = 0;
    await step(30);
    expect(t.hud.drive?.indicator).toBe(0);
  });

  it('F while moving = "moving"; stopped = walk exact on the driver (right) side', async () => {
    const { t, inp, ph, step } = setup();
    ph.car.speed = 8;
    inp.hits.add('interact');
    await step();
    expect(t.hud.drive?.exit).toBe('moving');
    expect(t.mode).toBe('drive');
    ph.car.speed = 0;
    inp.hits.add('interact');
    await step(4);
    expect(ph.rays[0]?.x).toBeCloseTo(1.7, 5);
    expect(t.mode).toBe('walk');
  });
});
