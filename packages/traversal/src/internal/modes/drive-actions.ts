// drive 모드 상태·동작(M08-T01·T02): 상태, 버튼(등화·방향지시등·시점), 운전석 카메라, 하차 자리 찾기, 안전(보도 서행·AEB).
import type { CameraState, Quat, Vec3, Vec3d } from '@sanpo/core';
import { quatFromAxisAngle, quatMultiply, vec3ApplyQuat } from '@sanpo/core';
import type { PhysicsService, VehicleInput, VehicleState } from '@sanpo/physics';
import type { DriveHud, DriveParams, DriveView, ModeOutput, TraversalContext } from '../../api.ts';
import { aebRange, hazardAhead, STOP_MS } from './drive-control.ts';

/** 운전석 눈 위치(차 로컬, 우핸들 기준 x = 오른쪽 +): 좌석 중심 0.37 m, 눈높이 1.30 m(벨트라인 0.86·지붕 1.42 사이), 앞뒤 중심보다 0.15 m 앞. */
const COCKPIT_EYE: readonly [number, number, number] = [0.37, 1.3, -0.15];
/** 하차 후보(차 로컬 x·z): 운전석 쪽 → 반대쪽 → 뒤. */
const EXIT_SIDE_M = 1.7;
const EXIT_BACK_M = 3.6;
/** 하차 지면: 차 바닥 높이 ±이 범위만(턱·옥상·고가 아래 제외). */
const EXIT_DY_M = 0.9;
const BLOCKED_SHOW_S = 2.5;
/** 보도 재질(JCOL tile)·보도 최고 속력(m/s, 10 km/h)·위험물 찾는 반경(m)·정지 중 출발 막는 거리(m)·세단 최대 조향(deg). */
const SIDEWALK_MATERIAL = 7;
const SIDEWALK_MAX_MS = 10 / 3.6;
const HAZARD_RADIUS_M = 40;
const AEB_STANDSTILL_M = 1.2;
const SEDAN_STEER_DEG = 35;

export interface DriveState {
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
  /** AEB 작동 중·보도 위(M08-T02). */
  aeb: boolean;
  sidewalk: boolean;
  /** 마지막 전진 기어(변속 중 표시). */
  lastGear: { gear: number };
  look: { yaw: number; pitch: number; idleS: number };
  car: { pos: Vec3d; quat: Quat; vel: Vec3; yaw: number; speed: number };
}

export function createState(): DriveState {
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
    aeb: false,
    sidewalk: false,
    lastGear: { gear: 1 },
    look: { yaw: 0, pitch: -0.05, idleS: 99 },
    car: { pos: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, speed: 0 },
  };
}

/** 등화 토글·방향지시등(조향 크게 → 풀면 끔)·시점. */
export function handleButtons(st: DriveState, ctx: TraversalContext): void {
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
export function cockpitCamera(
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
export function requestExit(st: DriveState, physics: PhysicsService): void {
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

/**
 * 안전(M08-T02 — 비폭력): 보도 위면 10 km/h 넘게 못 가고, 진행 통로 안 위험물이 멈춰야 하는 거리(정지 거리·TTC 1.5 s) 안이면
 * 스로틀 0·최대 제동(AEB) — 서 있을 때도 1.2 m 안이면 출발 막음. 곡률 = 조향 각 ÷ 휠베이스(세단 2.64 m).
 */
export function safety(
  st: DriveState,
  ctx: TraversalContext,
  vs: Readonly<VehicleState> | undefined,
  input: VehicleInput,
): void {
  st.sidewalk = vs?.wheels.some((w) => w.contactMaterial === SIDEWALK_MATERIAL) ?? false;
  if (st.sidewalk && Math.abs(st.car.speed) > SIDEWALK_MAX_MS) {
    input.throttle = 0;
    input.brake = Math.max(input.brake, 0.5);
  }
  const list = ctx.hazards?.(st.car.pos, HAZARD_RADIUS_M);
  const moving = Math.abs(st.car.speed) >= 0.3;
  const intent = input.throttle > 0 || moving;
  if (!list || !intent) {
    st.aeb = false;
    return;
  }
  const speed = moving ? st.car.speed : input.reverse ? -0.01 : 0.01;
  const steerRad = (st.steer * SEDAN_STEER_DEG * Math.PI) / 180;
  const car = {
    pos: st.car.pos,
    yaw: st.car.yaw,
    speed,
    halfLength: 2.25,
    halfWidth: 0.88,
    curvature: Math.tan(steerRad) / 2.64,
  };
  const d = hazardAhead(car, list);
  st.aeb = d < Math.max(aebRange(st.car.speed), AEB_STANDSTILL_M);
  if (st.aeb) Object.assign(input, { throttle: 0, brake: 1 });
}
