// drive 모드(09 §2 drive, M08-T01): 게임이 만든 물리 차량(DriveParams.vehicle)을 운전. input 'vehicle': W/RT 가속·S/LT 제동(멈추면 후진)·A/D·L스틱 조향
// (키보드는 속도 감응 램프 — 물리가 다시 속도 감응 각도 제한), Space/A 핸드브레이크, L/D-pad↑ 전조등, Q·E/D-pad←→ 방향지시등(조향을 풀면 자동 끔), V 시점(추적 ↔ 운전석),
// F 하차(멈췄을 때 — 운전석 쪽(우핸들 = 오른쪽)부터 아래 레이로 지면을 찾아 walk exact). 정지 중 입력이 없으면 가볍게 제동(크리프 정지).
import type { AvatarState, CameraState, FrameContext, ModeId } from '@sanpo/core';
import type { PhysicsService, VehicleInput, VehicleState } from '@sanpo/physics';
import type {
  DriveHud,
  DriveParams,
  DriveView,
  ModeOutput,
  TraversalContext,
  TraversalMode,
  TraversalSettings,
} from '../../api.ts';
import { boomLength, createBoomState, requestBoom, resetBoom } from '../camera/boom.ts';
import { type ChaseSettings, chaseBoom, createChaseState, DEFAULT_CHASE, stepChase } from '../camera/chase-rig.ts';
import { type Boom, createBoom } from '../camera/third-person-rig.ts';
import { carGroundGuard } from '../ground-guard.ts';
import { cockpitCamera, createState, type DriveState, handleButtons, requestExit, safety } from './drive-actions.ts';
import { driverInput, gearLabel, RIDE_SPECS, type RideSpec, rampSteer, yawOfCar } from './drive-control.ts';

export { driverInput, entryTarget, rampSteer, yawOfCar } from './drive-control.ts';

const MS_TO_KMH = 3.6;
/** 추적 카메라 붐 풀기 배율(3인칭 4 m/s × 3 — 탈 때 0.5 s 안에 뒤로). */
const CHASE_BOOM_OUT = 3;
export function isDriveParams(p: unknown): p is DriveParams {
  return typeof (p as Partial<DriveParams> | undefined)?.vehicle === 'number';
}

interface Rt {
  readonly settings: Readonly<TraversalSettings>;
  readonly st: DriveState;
  readonly chase: ReturnType<typeof createChaseState>;
  readonly chaseCfg: ChaseSettings;
  readonly boom: ReturnType<typeof createBoomState>;
  readonly boomNow: Boom;
  readonly boomScratch: Boom;
  readonly camera: CameraState;
  readonly output: ModeOutput;
}

function createRt(settings: Readonly<TraversalSettings>, spec: RideSpec): Rt {
  const st = createState(spec);
  const camera: CameraState = {
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    fovDeg: settings.fovDeg,
    near: settings.nearM,
  };
  const avatar: AvatarState = { visible: false, posWF: st.car.pos, yawRad: 0, speedMs: 0, grounded: true, opacity: 1 };
  const output: ModeOutput = {
    camera,
    interest: [
      { posWF: st.car.pos, velWF: st.car.vel, weight: 1, kind: 'player' },
      { posWF: { x: 0, y: 0, z: 0 }, weight: 0.7, kind: 'lookahead' },
    ],
    hud: {},
    player: { posWF: st.car.pos, velWF: st.car.vel, yawRad: 0 },
    avatar,
  };
  return {
    settings,
    st,
    chase: createChaseState(),
    chaseCfg: { ...DEFAULT_CHASE, ...spec.chase },
    boom: createBoomState(),
    boomNow: createBoom(),
    boomScratch: createBoom(),
    camera,
    output,
  };
}

function readCar(st: DriveState, physics: PhysicsService, p: DriveParams): Readonly<VehicleState> | undefined {
  const pose = physics.pose(p.vehicle);
  if (pose) {
    Object.assign(st.car.pos, pose.posWF);
    Object.assign(st.car.quat, pose.quat);
    Object.assign(st.car.vel, pose.linVel);
    st.car.yaw = yawOfCar(pose.quat);
  }
  const vs = physics.vehicleState(p.vehicle);
  st.car.speed = vs?.speedMs ?? 0;
  return vs;
}

/** 추적(붐 부채꼴 — 결과 1프레임 늦음) 또는 운전석 카메라. */
function updateCamera(rt: Rt, frame: FrameContext, ctx: TraversalContext, physics: PhysicsService): void {
  const { st, chase, boom, camera, settings } = rt;
  const k = settings.lookRadPerPx;
  const look = { dx: ctx.input.state.axis('lookX') * k, dy: ctx.input.state.axis('lookY') * k };
  const dt = frame.dtReal;
  camera.fovDeg = settings.fovDeg;
  if (st.view === 'cockpit') {
    cockpitCamera(st, st.params?.driveSide ?? 'right', camera, look, dt);
    return;
  }
  const yaw = chase.yaw + chase.lookYaw;
  const cfg = rt.chaseCfg;
  const want = chaseBoom(st.car.pos, yaw, chase.lookPitch, cfg, rt.boomNow).len;
  const len = boomLength(boom, yaw, chase.lookPitch, want, dt * CHASE_BOOM_OUT);
  const car = { posWF: st.car.pos, yawRad: st.car.yaw, speedMs: st.car.speed };
  stepChase(chase, car, look, len, rt.boomNow, cfg, dt, settings.fovDeg, camera);
  requestBoom(boom, physics, chase.yaw + chase.lookYaw, chase.lookPitch, (y, p) =>
    chaseBoom(st.car.pos, y, p, cfg, rt.boomScratch),
  );
}

function writeHud(
  rt: Rt,
  p: DriveParams,
  vs: Readonly<VehicleState> | undefined,
  input: VehicleInput,
  dt: number,
): void {
  const { st } = rt;
  st.blockedS = Math.max(0, st.blockedS - dt);
  if (st.blockedS === 0 && (st.exit === 'blocked' || st.exit === 'moving')) st.exit = 'ready';
  const hud: DriveHud = {
    vehicle: p.vehicle,
    kind: p.kind,
    view: st.view,
    speedKmh: Math.abs(st.car.speed) * MS_TO_KMH,
    rpm: vs?.rpm ?? 0,
    gear: gearLabel(vs, st.lastGear),
    lights: st.lights,
    indicator: st.indicator,
    braking: input.brake > 0.05 && Math.abs(st.car.speed) > 0.2,
    reversing: input.reverse || (vs?.gear ?? 0) < 0,
    abs: vs?.abs ?? false,
    tcs: vs?.tcs ?? false,
    aeb: st.aeb,
    sidewalk: st.sidewalk,
    exit: st.exit,
    bell: st.bell,
  };
  rt.output.hud = { speedKmh: hud.speedKmh, rpm: hud.rpm, gear: hud.gear, drive: hud, groundLoading: st.loading };
}

/** 한 프레임: 차 포즈 → 버튼 → 조향 램프·운전자 입력(앞 셀 대기) → 하차 → 카메라·HUD·관심점. */
function update(rt: Rt, frame: FrameContext, ctx: TraversalContext): ModeOutput {
  const { st, output } = rt;
  const physics = ctx.physics;
  const p = st.params;
  delete output.next;
  if (!physics || !p) return output;
  const vs = readCar(st, physics, p);
  handleButtons(st, ctx);
  const s = ctx.input.state;
  st.steer = rampSteer(st.steer, s.axis('moveX'), frame.dtReal);
  const input = driverInput(s.axis('moveY'), st.car.speed, st.steer, s.pressed('handbrake'), st.spec.reverse);
  if (s.justPressed('bell')) st.bell++;
  // 앞 셀 콜라이더가 아직 없으면(빠르게 달려 스트리밍을 앞지름) 멈춰 기다린다(08 §4 groundMissing).
  st.loading = carGroundGuard(physics, st.car.pos, st.car.vel);
  if (st.loading) Object.assign(input, { throttle: 0, brake: 1 });
  safety(st, ctx, vs, input);
  physics.setVehicleInput(p.vehicle, input);
  if (s.justPressed('interact')) requestExit(st, physics);
  updateCamera(rt, frame, ctx, physics);
  writeHud(rt, p, vs, input, frame.dtReal);
  output.player = { posWF: st.car.pos, velWF: st.car.vel, yawRad: st.car.yaw };
  const ahead = output.interest[1];
  if (ahead) {
    ahead.posWF.x = st.car.pos.x + st.car.vel.x * 3;
    ahead.posWF.y = st.car.pos.y;
    ahead.posWF.z = st.car.pos.z + st.car.vel.z * 3;
  }
  if (st.next) {
    output.next = st.next;
    st.next = undefined;
  }
  return output;
}

/** drive(세단) 또는 cycle(자전거, M08-T03) — 같은 조작·안전·카메라, 사양(RIDE_SPECS)만 다르다. */
export function createDriveMode(
  settings: Readonly<TraversalSettings>,
  kind: 'sedan' | 'bicycle' = 'sedan',
): TraversalMode & { readonly view: DriveView } {
  const rt = createRt(settings, RIDE_SPECS[kind]);
  const { st } = rt;
  return {
    id: kind === 'bicycle' ? 'cycle' : 'drive',
    requires: ['physics'],
    get view() {
      return st.view;
    },
    enter(ctx: TraversalContext, _from: ModeId, params?: unknown) {
      ctx.input.setContext('vehicle');
      st.physics = ctx.physics;
      st.next = undefined;
      st.exit = 'ready';
      st.exitGen++;
      if (isDriveParams(params)) {
        st.params = { ...params };
        st.view = params.view ?? st.view;
        st.steer = 0;
        rt.chase.init = false;
        resetBoom(rt.boom);
      }
    },
    update: (frame, ctx) => update(rt, frame, ctx),
    exit() {
      st.exitGen++;
      const p = st.params;
      if (p)
        st.physics?.setVehicleInput(p.vehicle, { throttle: 0, brake: 1, steer: 0, handbrake: true, reverse: false });
      st.indicator = 0;
    },
  };
}
