// walk 모드(09 §2 walk): physics 캐릭터(CharacterVirtual, 08 §5) + 1인칭/3인칭(V) 리그. input 'walk': WASD·L스틱 = 카메라 yaw 기준 수평 속도
// (스틱 기울기 = 연속, 최대 = 현재 단계), X = 걸음 단계 순환(1.35/1.8/3.0), Shift·L3 = 달리기 5.0, 휠 = 3인칭 거리.
// 진입: 바디가 기준점 returnToBodyM 안이면 바디로 복귀, 아니면 기준점 아래 지면에 놓는다(비동기 레이 — 그동안 카메라는 기준점에서 대기).
import type { AvatarState, CameraState, FrameContext, ModeId, Vec3, Vec3d } from '@sanpo/core';
import type { BodyHandle, PhysicsService } from '@sanpo/physics';
import type {
  ModeOutput,
  ModePlayer,
  TraversalContext,
  TraversalMode,
  TraversalSettings,
  WalkParams,
  WalkView,
} from '../../api.ts';
import { type BoomState, boomLength, createBoomState, requestBoom, resetBoom, stepToward } from '../camera/boom.ts';
import {
  createFirstPersonState,
  createLookState,
  type FirstPersonState,
  firstPersonCamera,
  followFeet,
  headBob,
  type LookState,
  stepLook,
} from '../camera/first-person-rig.ts';
import { rigQuat } from '../camera/free-rig.ts';
import {
  avatarOpacity,
  type Boom,
  createBoom,
  thirdPersonBoom,
  thirdPersonCamera,
  zoomDistance,
} from '../camera/third-person-rig.ts';
import { groundGuard } from '../ground-guard.ts';
import { findStreetSpot } from '../walk-placement.ts';

const MS_TO_KMH = 3.6;
/** 착지점을 못 찾으면(콜라이더 미적재) 다시 찾을 간격(s). */
const RETRY_S = 0.5;
/** 새로 놓을 때 시선 피치 한도(±20°) — 하늘에서 내려다보던 각도로 시작하지 않게. */
const ARRIVE_PITCH_LIMIT = (20 * Math.PI) / 180;
/** 놓은 뒤 스냅샷 포즈가 이 거리 안으로 오기 전까지는 놓은 자리를 쓴다(옛 스냅샷으로 카메라가 튀지 않게). */
const EXPECT_M = 2;
/** 3인칭 몸 방향: 이 속력 이상 움직일 때만 진행 방향으로. */
const TURN_MIN_MS = 0.1;

export function isWalkParams(p: unknown): p is WalkParams {
  const q = p as Partial<WalkParams> | undefined;
  return typeof q?.posWF?.x === 'number' && typeof q.yawRad === 'number';
}

/** 입력(moveX 오른쪽 +, moveY 앞 +)을 yaw 기준 수평 속도로. 크기 > 1(키보드 대각선)은 1로. */
export function moveVelocity(mx: number, my: number, yawRad: number, speedMs: number): { x: number; z: number } {
  const m = Math.hypot(mx, my);
  const k = (m > 1 ? 1 / m : 1) * speedMs;
  const fx = -Math.sin(yawRad);
  const fz = -Math.cos(yawRad);
  const rx = Math.cos(yawRad);
  const rz = -Math.sin(yawRad);
  return { x: (fx * my + rx * mx) * k, z: (fz * my + rz * mx) * k };
}

interface WalkState {
  physics: PhysicsService | undefined;
  handle: BodyHandle | undefined;
  /** 착지점 탐색 대기 중(레이). */
  placing: boolean;
  /** 다음 재시도까지 남은 시간(s, 0 = 없음). */
  retryInS: number;
  /** 탐색 세대(나가거나 새로 놓으면 옛 결과 무시). */
  gen: number;
  arrive: Vec3d;
  expect: Vec3d | undefined;
  pace: number;
  view: WalkView;
  distanceM: number;
  feet: Vec3d;
  vel: Vec3;
  grounded: boolean;
  /** 에스컬레이터로 운반 중(헤드밥 끔). */
  escalator: boolean;
  bodyYaw: number;
}

const horiz = (a: Readonly<Vec3d>, b: Readonly<Vec3d>): number => Math.hypot(a.x - b.x, a.z - b.z);

export interface WalkMode extends TraversalMode {
  readonly view: WalkView;
}

/** 모드 한 개의 런타임(상태 + 출력 객체 — 참조 고정). */
interface Rt {
  readonly settings: Readonly<TraversalSettings>;
  readonly w: Readonly<TraversalSettings['walk']>;
  readonly look: LookState;
  readonly fp: FirstPersonState;
  readonly st: WalkState;
  readonly camera: CameraState;
  readonly player: ModePlayer;
  readonly output: ModeOutput;
  /** 3인칭 붐 충돌(sphereCast 결과)·목표/현재 시선 붐. */
  readonly boom: BoomState;
  readonly boomNow: Boom;
  readonly boomScratch: Boom;
  /** 3인칭 카메라 시선(스무딩 시선을 프레임당 ≤ 8°로 따라감 — 붐 충돌 부채꼴이 덮는 범위). */
  readonly tp: { yaw: number; pitch: number };
  readonly avatar: AvatarState;
}

function createRt(settings: Readonly<TraversalSettings>): Rt {
  const w = settings.walk;
  const st: WalkState = {
    physics: undefined,
    handle: undefined,
    placing: false,
    retryInS: 0,
    gen: 0,
    arrive: { x: 0, y: 0, z: 0 },
    expect: undefined,
    pace: 0,
    view: w.view,
    distanceM: w.thirdPerson.distanceM,
    feet: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    grounded: false,
    escalator: false,
    bodyYaw: 0,
  };
  const camera: CameraState = {
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    fovDeg: settings.fovDeg,
    near: settings.nearM,
  };
  const player: ModePlayer = { posWF: st.feet, velWF: st.vel, yawRad: 0 };
  const output: ModeOutput = {
    camera,
    interest: [{ posWF: st.feet, velWF: st.vel, weight: 1, kind: 'player' }],
    hud: { speedKmh: 0 },
    player,
  };
  const avatar: AvatarState = { visible: false, posWF: st.feet, yawRad: 0, speedMs: 0, grounded: true, opacity: 1 };
  return {
    settings,
    w,
    look: createLookState(0, 0),
    fp: createFirstPersonState(),
    st,
    camera,
    player,
    output,
    boom: createBoomState(),
    boomNow: createBoom(),
    boomScratch: createBoom(),
    tp: { yaw: 0, pitch: 0 },
    avatar,
  };
}

function settle(rt: Rt, spot: Vec3d): void {
  Object.assign(rt.st.feet, spot);
  rt.st.vel.x = rt.st.vel.y = rt.st.vel.z = 0;
  rt.st.expect = { ...spot };
  rt.fp.feetY = Number.NaN;
  resetBoom(rt.boom);
}

function cancel(st: WalkState): void {
  st.gen++;
  st.placing = false;
  st.retryInS = 0;
}

/** 착지점 탐색 시작(비동기). 결과가 오면 스폰 또는 순간이동, 못 찾으면 RETRY_S 뒤 다시. */
function place(rt: Rt, physics: PhysicsService): void {
  const { st, look } = rt;
  const gen = ++st.gen;
  st.placing = true;
  const done = (spot: Vec3d | undefined): void => {
    if (gen !== st.gen) return;
    st.placing = false;
    if (!spot) {
      st.retryInS = RETRY_S;
      return;
    }
    if (st.handle === undefined) st.handle = physics.spawnCharacter(spot, look.yawRad);
    else physics.teleport(st.handle, spot, look.yawRad);
    settle(rt, spot);
  };
  findStreetSpot(physics, st.arrive).then(done, () => done(undefined));
}

function holdCamera(rt: Rt): void {
  Object.assign(rt.camera.posWF, rt.st.arrive);
  rigQuat(rt.camera.quat, rt.look.smYaw, rt.look.smPitch);
}

function arriveAt(rt: Rt, physics: PhysicsService, p: WalkParams): void {
  const { st } = rt;
  const body = st.handle !== undefined ? physics.pose(st.handle) : undefined;
  if (body && horiz(body.posWF, p.posWF) <= rt.w.returnToBodyM) return;
  Object.assign(st.arrive, p.posWF);
  const pitch = Math.max(-ARRIVE_PITCH_LIMIT, Math.min(ARRIVE_PITCH_LIMIT, p.pitchRad ?? 0));
  Object.assign(rt.look, createLookState(p.yawRad, pitch));
  holdCamera(rt);
  place(rt, physics);
}

/** 이번 프레임 포즈 반영(놓은 직후 옛 스냅샷은 건너뜀). */
function readPose(st: WalkState, physics: PhysicsService, h: BodyHandle): void {
  const pose = physics.pose(h);
  if (!pose) return;
  if (st.expect && horiz(pose.posWF, st.expect) > EXPECT_M) return;
  st.expect = undefined;
  Object.assign(st.feet, pose.posWF);
  Object.assign(st.vel, pose.linVel);
  st.grounded = pose.grounded;
  st.escalator = pose.escalator;
}

/** 입력 → 캐릭터 속도 명령, 포즈 → 카메라(1인칭·3인칭)·HUD·플레이어. */
function drive(rt: Rt, frame: FrameContext, ctx: TraversalContext, physics: PhysicsService, h: BodyHandle): void {
  const { st, w, look } = rt;
  const s = ctx.input.state;
  const speed = s.pressed('sprint') ? w.sprintMs : (w.paceSpeedsMs[st.pace] ?? 1.35);
  const v = moveVelocity(s.axis('moveX'), s.axis('moveY'), look.yawRad, speed);
  if (st.view === 'first') st.bodyYaw = look.yawRad;
  else if (Math.hypot(v.x, v.z) > TURN_MIN_MS) st.bodyYaw = Math.atan2(-v.x, -v.z);
  // 발밑·앞 셀 콜라이더가 없으면 멈추거나(stop) 제자리 고정(hold) — 낙하 방지(08 §4).
  const guard = groundGuard(physics, st.feet, v, st.vel);
  const move = guard.stop ? { x: 0, y: 0, z: 0 } : { x: v.x, y: 0, z: v.z };
  physics.setCharacterInput(h, { moveWF: move, yawRad: st.bodyYaw, ...(guard.hold ? { hold: true } : {}) });
  rt.output.hud.groundLoading = guard.stop;
  readPose(st, physics, h);
  const hSpeed = Math.hypot(st.vel.x, st.vel.z);
  const feetY = followFeet(rt.fp, st.feet.y, st.grounded, frame.dtReal, w.eyeFollowPerS);
  if (st.view === 'first') {
    const bob = headBob(rt.fp, st.grounded && !st.escalator ? hSpeed : 0, frame.dtReal, w);
    firstPersonCamera(rt.camera, st.feet, feetY, look, bob, w);
    rt.avatar.visible = false;
  } else thirdPerson(rt, frame, ctx, physics, feetY);
  rt.output.hud.speedKmh = hSpeed * MS_TO_KMH;
  rt.player.yawRad = st.bodyYaw;
  Object.assign(rt.avatar, { yawRad: st.bodyYaw, speedMs: hSpeed, grounded: st.grounded });
  rt.output.avatar = rt.avatar;
}

/**
 * 3인칭(M04-T05, ADR-0045): 카메라 시선은 스무딩 시선을 프레임당 ≤ 8°로 따라가고, 붐 길이는 지난 프레임 부채꼴 결과로 자른다(당기기 즉시·풀기 4 m/s).
 * 이번 시선 가운데 부채꼴을 다시 요청(다음 프레임용), 붐이 짧으면 아바타 디더 페이드.
 */
function thirdPerson(rt: Rt, frame: FrameContext, ctx: TraversalContext, physics: PhysicsService, feetY: number): void {
  const { st, w, look, tp } = rt;
  tp.yaw = stepToward(tp.yaw, look.smYaw, true);
  tp.pitch = stepToward(tp.pitch, look.smPitch, false);
  const now = thirdPersonBoom(rt.boomNow, st.feet, feetY, tp.yaw, tp.pitch, st.distanceM, w);
  const len = boomLength(rt.boom, tp.yaw, tp.pitch, now.len, frame.dtReal);
  const boomAt = (y: number, p: number) => thirdPersonBoom(rt.boomScratch, st.feet, feetY, y, p, st.distanceM, w);
  requestBoom(rt.boom, physics, tp.yaw, tp.pitch, boomAt);
  thirdPersonCamera(rt.camera, now, len, tp.yaw, tp.pitch, ctx.ground.groundHeightAt(st.feet.x, st.feet.z));
  rt.avatar.visible = true;
  rt.avatar.opacity = avatarOpacity(len);
}

/** 시점·걸음 단계 토글, 시선(스무딩)·3인칭 거리. */
function handleView(rt: Rt, frame: FrameContext, ctx: TraversalContext): void {
  const { st, w } = rt;
  const s = ctx.input.state;
  if (s.justPressed('toggleView')) {
    st.view = st.view === 'first' ? 'third' : 'first';
    resetBoom(rt.boom);
    rt.tp.yaw = rt.look.smYaw;
    rt.tp.pitch = rt.look.smPitch;
  }
  if (s.justPressed('pace')) st.pace = (st.pace + 1) % w.paceSpeedsMs.length;
  const k = rt.settings.lookRadPerPx;
  stepLook(rt.look, -s.axis('lookX') * k, -s.axis('lookY') * k, frame.dtReal, w.lookSmoothingS);
  if (st.view === 'third') st.distanceM = zoomDistance(st.distanceM, s.axis('wheel'), w.thirdPerson);
}

function update(rt: Rt, frame: FrameContext, ctx: TraversalContext): ModeOutput {
  const { st } = rt;
  handleView(rt, frame, ctx);
  const physics = ctx.physics;
  if (!physics) return rt.output;
  if (st.retryInS > 0) {
    st.retryInS -= frame.dtReal;
    if (st.retryInS <= 0) place(rt, physics);
  }
  if (st.handle === undefined || st.placing || st.retryInS > 0) holdCamera(rt);
  else drive(rt, frame, ctx, physics, st.handle);
  return rt.output;
}

export function createWalkMode(settings: Readonly<TraversalSettings>): WalkMode {
  const rt = createRt(settings);
  const { st } = rt;
  return {
    id: 'walk',
    requires: ['physics'],
    get view() {
      return st.view;
    },
    enter(ctx: TraversalContext, _from: ModeId, params?: unknown) {
      ctx.input.setContext('walk');
      const physics = ctx.physics;
      if (!physics) return;
      st.physics = physics;
      if (isWalkParams(params)) arriveAt(rt, physics, params);
      else if (st.handle === undefined)
        arriveAt(rt, physics, { posWF: { ...rt.camera.posWF }, yawRad: rt.look.yawRad });
    },
    update: (frame, ctx) => update(rt, frame, ctx),
    exit() {
      cancel(st);
      if (st.handle !== undefined) st.physics?.setCharacterInput(st.handle, { moveWF: { x: 0, y: 0, z: 0 } });
    },
    teleport(posWF, yawRad) {
      const physics = st.physics;
      if (!physics) return;
      cancel(st);
      Object.assign(rt.look, createLookState(yawRad, rt.look.pitchRad));
      if (st.handle === undefined) st.handle = physics.spawnCharacter(posWF, yawRad);
      else physics.teleport(st.handle, posWF, yawRad);
      settle(rt, { ...posWF });
    },
  };
}
