// M07-T05 train 모드: 칸에 붙은 카메라(서기·좌석·전면 전망 — 칸 로컬 오프셋·진동 범위), V 순환, T 빨리감기(페이드 → 시계 점프 = 도착 8 s 전),
// 문 열린 정차에서 F = 승강장 쪽 하차(walk exact), 마지막 정차(경계역) = 안내 4 s 뒤 자동 하차, 칸 안 판정(승차).
import {
  createEventBus,
  createLogger,
  type FrameContext,
  TRAIN_CAR_TYPES,
  type TrainCarPose,
  type TrainInfo,
  type TrainRideInfo,
} from '@sanpo/core';
import type { ActionState, ButtonAction, InputService } from '@sanpo/input';
import { describe, expect, it } from 'vitest';
import type { TraversalContext, WalkParams } from '../src/api.ts';
import { attachedCamera, worldToLocal } from '../src/internal/camera/attached-rig.ts';
import { boardingTarget, createTrainMode, viewOffset } from '../src/internal/modes/train.ts';
import { DEFAULT_TRAVERSAL_SETTINGS } from '../src/internal/settings.ts';

const CAR = TRAIN_CAR_TYPES[0] as (typeof TRAIN_CAR_TYPES)[number];
const log = createLogger({ sink: () => undefined });

function scene() {
  const hits = new Set<ButtonAction>();
  const state: ActionState = { axis: () => 0, pressed: (a) => hits.has(a), justPressed: (a) => hits.has(a) };
  const input = { state, setContext: () => undefined } as unknown as InputService;
  const clock = { ms: 1_000_000 };
  /** 북행 10 m/s 직진(yaw 0), 시각 1,060,000에 정차(문 왼쪽 열림 1,060,000–1,090,000). */
  const ride: TrainRideInfo = {
    tripId: 't',
    lineId: 'l',
    routeId: 'r',
    heading: 'outer',
    cars: 11,
    speedMs: 10,
    stoppedAtStationId: null,
    nextStationId: 'b',
    nextArrivalMs: 1_060_000,
    departureMs: null,
    doorSide: -1,
    lastStop: false,
  };
  const pose = (): TrainCarPose => ({
    posWF: { x: 100, y: 20, z: -500 - (clock.ms - 1_000_000) / 100 },
    yawRad: 0,
    pitchRad: 0,
    carType: 0,
    kind: 0,
    doors: ride.stoppedAtStationId ? -1 : 0,
    speedMs: ride.stoppedAtStationId ? 0 : 10,
  });
  const info: TrainInfo = {
    tripId: 't',
    lineId: 'l',
    cars: 11,
    carLengthM: 20,
    headPosWF: { x: 100, y: 20, z: -600 },
    headingRad: 0,
    speedMs: 10,
    stoppedAtStationId: null,
    doorsOpen: false,
    nextStationId: 'b',
    seats: [],
  };
  const ctx: TraversalContext = {
    input,
    bus: createEventBus(log),
    log,
    ground: { groundHeightAt: () => undefined },
    trains: () => [info],
    trainCar: (id, k) => (id === 't' && k >= 0 && k < 11 ? pose() : undefined),
    trainRide: (id) => (id === 't' ? ride : undefined),
    jumpClock: (ms) => {
      clock.ms = ms;
    },
  };
  const frame = (): FrameContext =>
    ({ frameIndex: 0, dtReal: 1 / 60, dtGame: 1 / 60, gameTimeMs: clock.ms }) as unknown as FrameContext;
  return { hits, clock, ride, pose, ctx, frame };
}

describe('attached rig', () => {
  it('places the camera at the car-local offset with the car yaw and pitch', () => {
    const cam = { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 70, near: 0.1 };
    const parent = { posWF: { x: 10, y: 5, z: 20 }, yawRad: Math.PI / 2, pitchRad: 0 };
    attachedCamera(cam, parent, [0, 1.6, -9], { yawRad: 0, pitchRad: 0 }, { dx: 0, dy: 0 });
    // yaw 90°: 로컬 −Z(앞) = WF −X.
    expect(cam.posWF.x).toBeCloseTo(1, 9);
    expect(cam.posWF.y).toBeCloseTo(6.6, 9);
    expect(cam.posWF.z).toBeCloseTo(20, 9);
    expect(worldToLocal(parent, cam.posWF).z).toBeCloseTo(-9, 9);
  });
});

describe('train mode', () => {
  it('rides with the car in each view, cycles with V and reports the next station', () => {
    const s = scene();
    const m = createTrainMode(DEFAULT_TRAVERSAL_SETTINGS);
    m.enter(s.ctx, 'walk', { tripId: 't', car: 5, view: 'frontView' });
    const o = m.update(s.frame(), s.ctx);
    const front = viewOffset('frontView', CAR).offset;
    const l = worldToLocal({ posWF: s.pose().posWF, yawRad: 0, pitchRad: 0 }, o.camera.posWF);
    expect(l.z).toBeCloseTo(front[2], 2);
    expect(l.y).toBeCloseTo(front[1], 2);
    expect(o.hud.train?.nextStationId).toBe('b');
    expect(o.hud.train?.arrivalInS).toBeCloseTo(60, 3);
    expect(o.interest[1]?.posWF.z).toBeLessThan(o.camera.posWF.z - 30); // 4 s 앞(북)
    s.hits.add('toggleView');
    expect(m.update(s.frame(), s.ctx).hud.train?.view).toBe('standing');
    s.hits.delete('toggleView');
    s.clock.ms += 1000;
    const p2 = m.update(s.frame(), s.ctx).camera.posWF.z;
    expect(p2).toBeCloseTo(s.pose().posWF.z + viewOffset('standing', CAR).offset[2], 1);
  });

  it('skips to 8 s before the next arrival behind a fade', () => {
    const s = scene();
    const m = createTrainMode(DEFAULT_TRAVERSAL_SETTINGS);
    m.enter(s.ctx, 'walk', { tripId: 't' });
    s.hits.add('skip');
    m.update(s.frame(), s.ctx);
    s.hits.delete('skip');
    let maxFade = 0;
    for (let k = 0; k < 120; k++) maxFade = Math.max(maxFade, m.update(s.frame(), s.ctx).hud.fade ?? 0);
    expect(maxFade).toBe(1);
    expect(s.clock.ms).toBe(1_060_000 - 8000);
    expect(m.update(s.frame(), s.ctx).hud.fade).toBe(0);
  });

  it('alights on the platform side with F at an open-door stop and automatically at the last stop', () => {
    const s = scene();
    const m = createTrainMode(DEFAULT_TRAVERSAL_SETTINGS);
    m.enter(s.ctx, 'walk', { tripId: 't', car: 3 });
    Object.assign(s.ride, { stoppedAtStationId: 'b', speedMs: 0 });
    s.hits.add('interact');
    const o = m.update(s.frame(), s.ctx);
    expect(o.next?.mode).toBe('walk');
    const w = o.next?.params as WalkParams;
    expect(w.exact).toBe(true);
    const l = worldToLocal({ posWF: s.pose().posWF, yawRad: 0, pitchRad: 0 }, w.posWF);
    expect(l.x).toBeCloseTo(-(CAR.widthM / 2 + 0.9), 6); // 왼쪽 문 앞
    expect(l.y).toBeCloseTo(CAR.floorM - 0.05, 6);
    s.hits.delete('interact');
    const m2 = createTrainMode(DEFAULT_TRAVERSAL_SETTINGS);
    m2.enter(s.ctx, 'walk', { tripId: 't' });
    Object.assign(s.ride, { lastStop: true });
    let next: unknown;
    let notice = false;
    for (let k = 0; k < 60 * 5 && !next; k++) {
      const q = m2.update(s.frame(), s.ctx);
      notice ||= q.hud.train?.notice === 'mvpEdge';
      next = q.next;
    }
    expect(notice).toBe(true);
    expect((next as { mode: string }).mode).toBe('walk');
  });

  it('detects a passenger standing inside a car (boarding)', () => {
    const s = scene();
    const c = s.pose().posWF;
    expect(boardingTarget(s.ctx, { x: c.x + 0.5, y: c.y + CAR.floorM, z: c.z + 3 })).toEqual({ tripId: 't', car: 0 });
    expect(boardingTarget(s.ctx, { x: c.x + 3, y: c.y + 1.1, z: c.z })).toBeUndefined();
  });
});
