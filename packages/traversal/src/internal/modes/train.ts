// train 모드(09 §2 train, M07-T05): 탑승 중 카메라(AttachedRig) — 서기(문 옆)·좌석·전면 전망(선두 운전실), V 순환, 마우스 시선(칸 기준).
// T = 다음 역까지 빨리감기(페이드 → 시계 점프(도착 8 s 전) → 페이드 인 — 열차는 시각의 순수 함수라 즉시 재배치), F = 문 열린 정차에서 하차,
// 트립 마지막 정차(MVP 경계역 — 시부야·신주쿠) = "미개방 구역" 안내 뒤 자동 하차. 하차 = 승강장 쪽 문 앞(walk exact).
// 차내 보행(서서 걷기)은 walk 모드 그대로(물리 칸 바닥이 실어 나른다 — ADR-0073), 칸 안에서 F = 이 모드로(service 승차 판정).
import {
  type FrameContext,
  type ModeId,
  TRAIN_CAR_TYPES,
  type TrainCarPose,
  type TrainCarTypeInfo,
  type Vec3d,
} from '@sanpo/core';
import type {
  ModeOutput,
  ModePlayer,
  TrainHud,
  TrainParams,
  TrainView,
  TraversalContext,
  TraversalMode,
  TraversalSettings,
  WalkParams,
} from '../../api.ts';
import { attachedCamera, localToWorld, vibration, worldToLocal } from '../camera/attached-rig.ts';

const VIEWS: readonly TrainView[] = ['standing', 'seated', 'frontView'];
/** 빨리감기: 도착 이만큼 전으로(s)·페이드 아웃/유지/인(s). */
const SKIP_BEFORE_S = 8;
const FADE_S = 0.35;
const HOLD_S = 0.5;
/** 경계역 안내 뒤 자동 하차(s). */
const NOTICE_S = 4;
const LOOKAHEAD_S = 4;
const PITCH_LIMIT = (80 * Math.PI) / 180;
const FRONT_YAW_LIMIT = (70 * Math.PI) / 180;

export function isTrainParams(p: unknown): p is TrainParams {
  return typeof (p as Partial<TrainParams> | undefined)?.tripId === 'string';
}

const carType = (pose: TrainCarPose): TrainCarTypeInfo =>
  TRAIN_CAR_TYPES[pose.carType] ?? (TRAIN_CAR_TYPES[0] as TrainCarTypeInfo);

/** 시점 → 칸 로컬 눈 위치(칸 중심 레일 윗면 기준)·기본 시선 yaw. */
export function viewOffset(view: TrainView, t: TrainCarTypeInfo): { offset: [number, number, number]; yaw: number } {
  const doorZ = t.doorsZ[1] ?? 0;
  if (view === 'frontView') return { offset: [-0.45, t.floorM + 1.55, -(t.lengthM / 2 - 1.1)], yaw: 0 };
  if (view === 'seated') {
    const spanZ = ((t.doorsZ[1] ?? 0) + (t.doorsZ[2] ?? 0)) / 2;
    return { offset: [t.widthM / 2 - 0.5, t.floorM + 1.2, spanZ], yaw: Math.PI / 2 };
  }
  return { offset: [0.35, t.floorM + 1.6, doorZ + 0.75], yaw: 0 };
}

/** 칸 안(바닥 위, 벽·끝벽 안)인가 — 승차 판정. */
export function insideCar(pose: TrainCarPose, feet: Readonly<Vec3d>): boolean {
  const t = carType(pose);
  const l = worldToLocal({ posWF: pose.posWF, yawRad: pose.yawRad, pitchRad: pose.pitchRad }, feet);
  return (
    Math.abs(l.x) < t.widthM / 2 - 0.1 &&
    Math.abs(l.z) < t.lengthM / 2 - 0.35 &&
    l.y > t.floorM - 0.4 &&
    l.y < t.floorM + 0.6
  );
}

/** 근처 열차 중 발이 칸 안인 트립·칸(없으면 undefined). */
export function boardingTarget(
  ctx: TraversalContext,
  feet: Readonly<Vec3d>,
): { tripId: string; car: number } | undefined {
  for (const t of ctx.trains?.() ?? [])
    for (let k = 0; k < t.cars; k++) {
      const pose = ctx.trainCar?.(t.tripId, k);
      if (pose && insideCar(pose, feet)) return { tripId: t.tripId, car: k };
    }
  return undefined;
}

interface St {
  tripId: string;
  car: number;
  view: TrainView;
  look: { yawRad: number; pitchRad: number };
  /** 빨리감기 단계: 0 없음, 1 페이드 아웃, 2 유지(점프 뒤), 3 페이드 인. */
  ff: { phase: 0 | 1 | 2 | 3; t: number; target: number };
  notice: number;
  /** F를 한 번 뗀 뒤에만 하차(승차한 그 F가 같은 프레임에 하차로 읽히지 않게 — 실제 GPU에서 발견). */
  armed: boolean;
  last: TrainCarPose | undefined;
  timeS: number;
}

/** 하차 자리: 이 칸의 승강장 쪽(문 쪽) 가장 가까운 문 앞 0.9 m, 승강장 윗면(차 바닥 − 0.05). */
export function alightSpot(pose: TrainCarPose, side: number, nearZ: number): WalkParams {
  const t = carType(pose);
  const s = side === 0 ? 1 : side;
  const z = t.doorsZ.reduce((b, d) => (Math.abs(d - nearZ) < Math.abs(b - nearZ) ? d : b), t.doorsZ[0] ?? 0);
  const p = { posWF: pose.posWF, yawRad: pose.yawRad, pitchRad: 0 };
  const posWF = localToWorld(p, s * (t.widthM / 2 + 0.9), t.floorM - 0.05, z, { x: 0, y: 0, z: 0 });
  return { posWF, yawRad: pose.yawRad + (s > 0 ? -Math.PI / 2 : Math.PI / 2), exact: true };
}

interface Rt {
  st: St;
  settings: Readonly<TraversalSettings>;
  output: ModeOutput;
  player: ModePlayer;
  hud: TrainHud;
}

function createRt(settings: Readonly<TraversalSettings>): Rt {
  const st: St = {
    tripId: '',
    car: 0,
    view: 'standing',
    look: { yawRad: 0, pitchRad: 0 },
    ff: { phase: 0, t: 0, target: 0 },
    notice: 0,
    armed: false,
    last: undefined,
    timeS: 0,
  };
  const player: ModePlayer = { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0 };
  const camera = {
    posWF: { x: 0, y: 0, z: 0 },
    quat: { x: 0, y: 0, z: 0, w: 1 },
    fovDeg: settings.fovDeg,
    near: settings.nearM,
  };
  const hud: TrainHud = {
    tripId: '',
    lineId: '',
    routeId: '',
    heading: '',
    view: 'standing',
    car: 0,
    stoppedAtStationId: null,
    nextStationId: null,
    doorSide: 0,
    arrivalInS: null,
    notice: null,
    skipping: false,
  };
  const output: ModeOutput = {
    camera,
    interest: [
      { posWF: camera.posWF, velWF: player.velWF, weight: 1, kind: 'camera' },
      { posWF: { x: 0, y: 0, z: 0 }, velWF: player.velWF, weight: 0.8, kind: 'lookahead' },
    ],
    hud: { speedKmh: 0, train: hud, fade: 0 },
    player,
  };
  return { st, settings, output, player, hud };
}

/** 빨리감기 진행(페이드·점프). 반환 = 이번 프레임 페이드 0..1. */
function stepSkip(st: St, ctx: TraversalContext, dt: number): number {
  const ff = st.ff;
  if (ff.phase === 0) return 0;
  ff.t += dt;
  if (ff.phase === 1 && ff.t >= FADE_S) {
    ctx.jumpClock?.(ff.target);
    ff.phase = 2;
    ff.t = 0;
  } else if (ff.phase === 2 && ff.t >= HOLD_S) {
    ff.phase = 3;
    ff.t = 0;
  } else if (ff.phase === 3 && ff.t >= FADE_S) ff.phase = 0;
  if (ff.phase === 1) return Math.min(1, ff.t / FADE_S);
  if (ff.phase === 2) return 1;
  return ff.phase === 3 ? Math.max(0, 1 - ff.t / FADE_S) : 0;
}

/** 입력: V 시점 순환, 마우스 시선, T 빨리감기 시작, F 하차 요청. 반환 = 하차 요청. */
function handleInput(rt: Rt, ctx: TraversalContext, frame: FrameContext, nextArrivalMs: number | null): boolean {
  const { st } = rt;
  const s = ctx.input.state;
  if (s.justPressed('toggleView')) setView(rt, VIEWS[(VIEWS.indexOf(st.view) + 1) % VIEWS.length] ?? 'standing');
  const k = rt.settings.lookRadPerPx;
  st.look.yawRad -= s.axis('lookX') * k;
  st.look.pitchRad = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, st.look.pitchRad - s.axis('lookY') * k));
  if (st.view === 'frontView') st.look.yawRad = Math.max(-FRONT_YAW_LIMIT, Math.min(FRONT_YAW_LIMIT, st.look.yawRad));
  if (
    s.justPressed('skip') &&
    st.ff.phase === 0 &&
    nextArrivalMs !== null &&
    nextArrivalMs - SKIP_BEFORE_S * 1000 > frame.gameTimeMs
  )
    st.ff = { phase: 1, t: 0, target: nextArrivalMs - SKIP_BEFORE_S * 1000 };
  if (!st.armed) {
    st.armed = !s.pressed('interact');
    return false;
  }
  return s.justPressed('interact');
}

function setView(rt: Rt, view: TrainView): void {
  rt.st.view = view;
  rt.st.look = { yawRad: 0, pitchRad: 0 };
}

/** 하차 → walk(정확한 승강장 자리). 자세를 모르면 walk 기본 진입. */
function alight(rt: Rt, side: number): void {
  const { st } = rt;
  const pose = st.last;
  if (!pose) {
    rt.output.next = { mode: 'walk' };
    return;
  }
  const z = viewOffset(st.view === 'frontView' ? 'standing' : st.view, carType(pose)).offset[2];
  rt.output.next = { mode: 'walk', params: alightSpot(pose, side, z) };
}

/** 카메라·플레이어·관심점(4 s 앞)을 칸 자세에서. */
function place(rt: Rt, pose: TrainCarPose, frame: FrameContext): void {
  const { st, output, player } = rt;
  const v = viewOffset(st.view, carType(pose));
  const look = { yawRad: v.yaw + st.look.yawRad, pitchRad: st.look.pitchRad };
  st.timeS += frame.dtReal;
  attachedCamera(
    output.camera,
    { posWF: pose.posWF, yawRad: pose.yawRad, pitchRad: pose.pitchRad },
    v.offset,
    look,
    vibration(st.timeS, pose.speedMs),
  );
  const fx = -Math.sin(pose.yawRad);
  const fz = -Math.cos(pose.yawRad);
  Object.assign(player.posWF, { x: output.camera.posWF.x, y: output.camera.posWF.y - 1.6, z: output.camera.posWF.z });
  Object.assign(player.velWF, { x: fx * pose.speedMs, y: 0, z: fz * pose.speedMs });
  player.yawRad = pose.yawRad;
  const ahead = output.interest[1];
  if (ahead)
    Object.assign(ahead.posWF, {
      x: player.posWF.x + fx * pose.speedMs * LOOKAHEAD_S,
      y: player.posWF.y,
      z: player.posWF.z + fz * pose.speedMs * LOOKAHEAD_S,
    });
}

function update(rt: Rt, frame: FrameContext, ctx: TraversalContext): ModeOutput {
  const { st, hud, output } = rt;
  delete output.next;
  const ride = ctx.trainRide?.(st.tripId);
  const pose = ctx.trainCar?.(st.tripId, st.view === 'frontView' ? 0 : st.car);
  if (!ride || !pose) {
    // 트립이 끝났다(운행 종료) — 마지막 자세 옆 승강장으로.
    alight(rt, hud.doorSide);
    return output;
  }
  st.last = pose;
  const wantOff = handleInput(rt, ctx, frame, ride.nextArrivalMs);
  output.hud.fade = stepSkip(st, ctx, frame.dtReal);
  place(rt, pose, frame);
  const stopped = ride.stoppedAtStationId !== null;
  st.notice = stopped && ride.lastStop ? st.notice + frame.dtReal : 0;
  Object.assign(hud, {
    tripId: ride.tripId,
    lineId: ride.lineId,
    routeId: ride.routeId,
    heading: ride.heading,
    view: st.view,
    car: st.car,
    stoppedAtStationId: ride.stoppedAtStationId,
    nextStationId: ride.nextStationId,
    doorSide: ride.doorSide,
    arrivalInS: ride.nextArrivalMs === null ? null : Math.max(0, (ride.nextArrivalMs - frame.gameTimeMs) / 1000),
    notice: st.notice > 0 ? 'mvpEdge' : null,
    skipping: st.ff.phase !== 0,
  });
  output.hud.speedKmh = pose.speedMs * 3.6;
  if (ride.nextStationId) output.hud.nextStationId = ride.nextStationId;
  else delete output.hud.nextStationId;
  const doorsOpen = Math.abs(pose.doors) > 0.9;
  if ((wantOff && stopped && doorsOpen) || st.notice >= NOTICE_S) alight(rt, ride.doorSide);
  return output;
}

export function createTrainMode(settings: Readonly<TraversalSettings>): TraversalMode {
  const rt = createRt(settings);
  return {
    id: 'train',
    requires: ['trains'],
    enter(ctx: TraversalContext, _from: ModeId, params?: unknown) {
      ctx.input.setContext('vehicle');
      if (!isTrainParams(params)) return;
      const t = ctx.trains?.().find((q) => q.tripId === params.tripId);
      rt.st.tripId = params.tripId;
      rt.st.car = Math.max(0, Math.min((t?.cars ?? 1) - 1, params.car ?? Math.floor((t?.cars ?? 1) / 2)));
      setView(rt, params.view ?? 'standing');
      rt.st.ff = { phase: 0, t: 0, target: 0 };
      rt.st.notice = 0;
      rt.st.armed = false;
      rt.output.hud.fade = 0;
    },
    update: (frame, ctx) => update(rt, frame, ctx),
    exit() {
      rt.output.hud.fade = 0;
      delete rt.output.next;
    },
  };
}
