// drive 모드(09 §2 drive, M08-T01): 게임이 만든 물리 차량(DriveParams.vehicle)을 운전. input 'vehicle': W/RT 가속·S/LT 제동(멈추면 후진)·A/D·L스틱 조향
// (키보드는 속도 감응 램프 — 물리가 다시 속도 감응 각도 제한), Space/A 핸드브레이크, L/D-pad↑ 전조등, Q·E/D-pad←→ 방향지시등(조향을 풀면 자동 끔), V 시점(추적 ↔ 운전석),
// F 하차(멈췄을 때 — 운전석 쪽(우핸들 = 오른쪽)부터 아래 레이로 지면을 찾아 walk exact). 정지 중 입력이 없으면 가볍게 제동(크리프 정지).
import type { AvatarState, CameraState, FrameContext, ModeId, Quat, Vec3, Vec3d } from '@sanpo/core';
import { quatFromAxisAngle, quatMultiply, vec3ApplyQuat } from '@sanpo/core';
import type { PhysicsService, VehicleInput, VehicleState } from '@sanpo/physics';
import type {
  DriveHud,
  DriveParams,
  DriveView,
  EnterableVehicle,
  ModeOutput,
  TraversalContext,
  TraversalMode,
  TraversalSettings,
} from '../../api.ts';
import { boomLength, createBoomState, requestBoom, resetBoom } from '../camera/boom.ts';
import { chaseBoom, createChaseState, DEFAULT_CHASE, stepChase } from '../camera/chase-rig.ts';
import { type Boom, createBoom } from '../camera/third-person-rig.ts';
import { carGroundGuard } from '../ground-guard.ts';
import { driverInput, gearLabel, rampSteer, STOP_MS, yawOfCar } from './drive-control.ts';

export { driverInput, entryTarget, rampSteer, yawOfCar } from './drive-control.ts';

const MS_TO_KMH = 3.6;
/** 운전석 눈 위치(차 로컬, 우핸들 기준 x = 오른쪽 +): 좌석 중심 0.37 m, 눈높이 1.30 m(벨트라인 0.86·지붕 1.42 사이), 앞뒤 중심보다 0.15 m 앞. */
const COCKPIT_EYE: readonly [number, number, number] = [0.37, 1.3, -0.15];
/** 하차 후보(차 로컬 x·z): 운전석 쪽 → 반대쪽 → 뒤. */
const EXIT_SIDE_M = 1.7;
const EXIT_BACK_M = 3.6;
/** 하차 지면: 차 바닥 높이 ±이 범위만(턱·옥상·고가 아래 제외). */
const EXIT_DY_M = 0.9;
const BLOCKED_SHOW_S = 2.5;
/** 추적 카메라 붐 풀기 배율(3인칭 4 m/s × 3 — 탈 때 0.5 s 안에 뒤로). */
const CHASE_BOOM_OUT = 3;

export function isDriveParams(p: unknown): p is DriveParams {
  return typeof (p as Partial<DriveParams> | undefined)?.vehicle === 'number';
}

interface DriveState {
  physics: PhysicsService | undefined;
  params: DriveParams | undefined;
  view: DriveView;
  steer: number;
  lights: boolean;
  indicator: -1 | 0 | 1;
  /** 방향지시등을 켠 뒤 조향을 크게 꺾었나(풀면 자동 끔). */
  turned: boolean;
  exit: DriveHud['exit'];
  blockedS: number;
  exitGen: number;
  next: ModeOutput['next'];
  /** 앞 셀 콜라이더 대기(제동 중). */
  loading: boolean;
  look: { yaw: number; pitch: number; idleS: number };
  car: { pos: Vec3d; quat: Quat; vel: Vec3; yaw: number; speed: number };
}

function createState(): DriveState {
  return {
    physics: undefined,
    params: undefined,
    view: 'chase',
    steer: 0,
    lights: false,
    indicator: 0,
    turned: false,
    exit: 'ready',
    blockedS: 0,
    exitGen: 0,
    next: undefined,
    loading: false,
    look: { yaw: 0, pitch: -0.05, idleS: 99 },
    car: { pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 0 },
  };
}

/** 등화 토글·방향지시등(조향 크게 → 풀면 끔)·시점. */
function handleButtons(st: DriveState, ctx: TraversalContext): void {
  const s = ctx.input.state;
  if (s.justPressed('lights')) st.lights = !st.lights;
  if (s.justPressed('indicatorLeft')) st.indicator = st.indicator === -1 ? 0 : -1;
  if (s.justPressed('indicatorRight')) st.indicator = st.indicator === 1 ? 0 : 1;
  if (st.indicator === 0) st.turned = false;
  else if (Math.sign(st.steer) === st.indicator && Math.abs(st.steer) > 0.5) st.turned = true;
  else if (st.turned && Math.abs(st.steer) < 0.1) {
    st.indicator = 0;
    st.turned = false;
  }
  if (s.justPressed('toggleView')) st.view = st.view === 'chase' ? 'cockpit' : 'chase';
}

const qa: Quat = { x: 0, y: 0, z: 0, w: 1 };
const scratchV: Vec3d = { x: 0, y: 0, z: 0 };

/** 운전석(우핸들) 1인칭: 차 자세 · 눈 위치 · 시선(마우스 — 2 s 뒤 앞으로 복귀). */
function cockpitCamera(
  st: DriveState,
  side: 'right' | 'left',
  out: CameraState,
  look: { dx: number; dy: number },
  dt: number,
) {
  const L = st.look;
  if (look.dx !== 0 || look.dy !== 0) L.idleS = 0;
  else L.idleS += dt;
  L.yaw = Math.max(-2.4, Math.min(2.4, L.yaw - look.dx));
  L.pitch = Math.max(-1, Math.min(0.8, L.pitch - look.dy));
  if (L.idleS > 2) {
    const k = 1 - Math.exp(-3 * dt);
    L.yaw -= L.yaw * k;
    L.pitch += (-0.05 - L.pitch) * k;
  }
  const x = side === 'right' ? COCKPIT_EYE[0] : -COCKPIT_EYE[0];
  vec3ApplyQuat(scratchV, { x, y: COCKPIT_EYE[1], z: COCKPIT_EYE[2] }, st.car.quat);
  out.posWF.x = st.car.pos.x + scratchV.x;
  out.posWF.y = st.car.pos.y + scratchV.y;
  out.posWF.z = st.car.pos.z + scratchV.z;
  quatFromAxisAngle(qa, { x: 0, y: 1, z: 0 }, L.yaw);
  quatMultiply(out.quat, st.car.quat, qa);
  quatFromAxisAngle(qa, { x: 1, y: 0, z: 0 }, L.pitch);
  quatMultiply(out.quat, out.quat, qa);
}

/** F 하차: 멈췄으면 후보 자리(운전석 쪽 → 반대쪽 → 뒤)마다 위에서 아래로 레이 — 차 바닥 ±0.9 m 지면이면 walk exact. */
function requestExit(st: DriveState, physics: PhysicsService): void {
  if (Math.abs(st.car.speed) > STOP_MS) {
    st.exit = 'moving';
    st.blockedS = BLOCKED_SHOW_S;
    return;
  }
  if (st.exit === 'searching') return;
  st.exit = 'searching';
  const gen = ++st.exitGen;
  const side = st.params?.driveSide === 'left' ? -1 : 1;
  const cands: [number, number][] = [
    [side * EXIT_SIDE_M, 0],
    [-side * EXIT_SIDE_M, 0],
    [0, EXIT_BACK_M],
  ];
  const car = { ...st.car.pos };
  const q = { ...st.car.quat };
  const yaw = st.car.yaw;
  const tryAt = async (i: number): Promise<void> => {
    const c = cands[i];
    if (!c || gen !== st.exitGen) {
      if (gen === st.exitGen) {
        st.exit = 'blocked';
        st.blockedS = BLOCKED_SHOW_S;
      }
      return;
    }
    const off = vec3ApplyQuat({ x: 0, y: 0, z: 0 }, { x: c[0], y: 0, z: c[1] }, q);
    const o = { x: car.x + off.x, y: car.y + 2.2, z: car.z + off.z };
    const hit = await physics.raycast(o, { x: 0, y: -1, z: 0 }, 2.2 + EXIT_DY_M);
    if (gen !== st.exitGen) return;
    // 차체(VEHICLE 4)·위쪽 장애물에 막히면 다음 후보.
    if (hit && hit.layer !== 4 && Math.abs(hit.posWF.y - car.y) <= EXIT_DY_M && hit.normal.y > 0.8) {
      st.next = { mode: 'walk', params: { posWF: { ...hit.posWF }, yawRad: yaw, exact: true } };
      return;
    }
    await tryAt(i + 1);
  };
  void tryAt(0);
}

interface Rt {
  readonly settings: Readonly<TraversalSettings>;
  readonly st: DriveState;
  readonly chase: ReturnType<typeof createChaseState>;
  readonly boom: ReturnType<typeof createBoomState>;
  readonly boomNow: Boom;
  readonly boomScratch: Boom;
  readonly camera: CameraState;
  readonly output: ModeOutput;
}

function createRt(settings: Readonly<TraversalSettings>): Rt {
  const st = createState();
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
  const want = chaseBoom(st.car.pos, yaw, chase.lookPitch, DEFAULT_CHASE, rt.boomNow).len;
  const len = boomLength(boom, yaw, chase.lookPitch, want, dt * CHASE_BOOM_OUT);
  const car = { posWF: st.car.pos, yawRad: st.car.yaw, speedMs: st.car.speed };
  stepChase(chase, car, look, len, rt.boomNow, DEFAULT_CHASE, dt, settings.fovDeg, camera);
  requestBoom(boom, physics, chase.yaw + chase.lookYaw, chase.lookPitch, (y, p) =>
    chaseBoom(st.car.pos, y, p, DEFAULT_CHASE, rt.boomScratch),
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
    gear: gearLabel(vs),
    lights: st.lights,
    indicator: st.indicator,
    braking: input.brake > 0.05 && Math.abs(st.car.speed) > 0.2,
    reversing: input.reverse || (vs?.gear ?? 0) < 0,
    abs: vs?.abs ?? false,
    tcs: vs?.tcs ?? false,
    exit: st.exit,
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
  const input = driverInput(s.axis('moveY'), st.car.speed, st.steer, s.pressed('handbrake'));
  // 앞 셀 콜라이더가 아직 없으면(빠르게 달려 스트리밍을 앞지름) 멈춰 기다린다(08 §4 groundMissing).
  st.loading = carGroundGuard(physics, st.car.pos, st.car.vel);
  if (st.loading) Object.assign(input, { throttle: 0, brake: 1 });
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

export function createDriveMode(settings: Readonly<TraversalSettings>): TraversalMode & { readonly view: DriveView } {
  const rt = createRt(settings);
  const { st } = rt;
  return {
    id: 'drive',
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
