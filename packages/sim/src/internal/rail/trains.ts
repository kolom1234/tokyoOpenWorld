// 열차(M07-T03, ADR-0072): 시간표(운행 중 트립) × 트립 운동(motion-profile) → 편성 칸 자세 → 인스턴스 버퍼(메인 스레드, 프레임마다 —
// 위치가 시각의 순수 함수라 외삽 없이 정확: 탑승 카메라(M07-T05)·물리(T04)가 같은 값을 본다). 터널 안 칸은 쓰지 않는다.
// 칸 버퍼(stride 8): x, y, z(레일 윗면, WF − anchor), yaw, pitch, 속력 m/s, 노선색 24비트 sRGB(정수 — float32 정확),
// 코드 = 칸 종류(정수: 차형 × 4 + 종류) + 문(소수: (문 + 1) / 2 × 0.999 — 문 = −1 왼쪽 … +1 오른쪽 열림).
import type { SharedInstanceBuffer, TrainInfo, Vec3d } from '@sanpo/core';
import type { RailLineMeta, TimetableFile } from '@sanpo/tile-format';
import { type MotionState, motionAt, type TripMotion, tripMotion } from './motion-profile.ts';
import { type CarPose, carPose, inTunnel, type RailRt } from './network.ts';
import { type ActiveTrip, activeTrips, indexTimetable, type LineTimetable } from './timetable.ts';

export const TRAIN_STRIDE = 8;
/** 칸 종류(render 모델과 같은 번호): 중간·중간(팬터그래프)·앞 운전실·뒤 운전실. */
export const CAR_KIND = { middle: 0, pantograph: 1, cabFront: 2, cabRear: 3 } as const;
/** 차형: 0 = 20 m 통근형(JR), 1 = 16 m 지하철형(긴자선 — 제3궤조, 팬터그래프 없음). */
export const CAR_TYPE = { commuter20: 0, metro16: 1 } as const;
/** 대차 중심 반간격 / 칸 길이(20 m 칸 13.8 m 간격). */
const BOGIE_RATIO = 0.345;
const CAPACITY_CARS = 600;

export interface TrainState {
  tripId: string;
  line: string;
  route: string;
  track: string;
  cars: number;
  carLengthM: number;
  motion: MotionState;
  /** 선두 칸 앞 끝 WF. */
  head: Vec3d;
  headingRad: number;
  stationAt: string | null;
  nextStation: string | null;
}

export interface TrainStats {
  trips: number;
  trains: number;
  cars: number;
  hiddenCars: number;
}

export interface TrainSim {
  /** 게임 시각 → 운행 중 열차·칸 버퍼(anchor = 관측 위치 256 m 격자). */
  update(gameMs: number, observerWF: Readonly<Vec3d>): void;
  readonly buffer: SharedInstanceBuffer;
  trains(): readonly TrainState[];
  trainsNear(posWF: Readonly<Vec3d>, r: number): TrainInfo[];
  stats(): TrainStats;
}

const hexColor = (c: string): number => Number.parseInt(c.replace('#', ''), 16) || 0xffffff;

function carType(l: RailLineMeta | undefined): number {
  return (l?.formation.carLengthM ?? 20) >= 18 ? CAR_TYPE.commuter20 : CAR_TYPE.metro16;
}

/** 편성 k번째 칸(0 = 선두) 종류 — 가공 전차선 노선은 2·5·8번째(…) 칸에 팬터그래프, 제3궤조(긴자선 thirdRail)는 없음. */
export function carKind(k: number, cars: number, overhead: boolean): number {
  if (k === 0) return CAR_KIND.cabFront;
  if (k === cars - 1) return CAR_KIND.cabRear;
  return overhead && k % 3 === 2 ? CAR_KIND.pantograph : CAR_KIND.middle;
}

interface Ctx {
  rt: RailRt;
  lines: LineTimetable[];
  meta: Map<string, RailLineMeta>;
  motions: Map<string, TripMotion>;
  data: Float32Array;
  anchor: Vec3d;
  count: number;
  seq: number;
  list: TrainState[];
  st: TrainStats;
}

const pose: CarPose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };

function writeCars(c: Ctx, a: ActiveTrip, m: MotionState, line: RailLineMeta | undefined): void {
  const tr = c.rt.tracks.get(a.trip.track);
  if (!tr) return;
  const L = a.trip.carLengthM;
  const b = L * BOGIE_RATIO;
  const color = hexColor(line?.color ?? '#ffffff');
  const type = carType(line);
  const overhead = line?.thirdRail !== true;
  const doorCode = ((m.doors + 1) / 2) * 0.999;
  const half = (a.trip.cars * L) / 2;
  for (let k = 0; k < a.trip.cars; k++) {
    const s = m.s + half - (k + 0.5) * L;
    if (inTunnel(c.rt, tr.meta, s)) {
      c.st.hiddenCars++;
      continue;
    }
    if (c.count >= CAPACITY_CARS) return;
    carPose(c.rt, tr.meta, s, b, pose);
    const o = c.count * TRAIN_STRIDE;
    c.data[o] = pose.x - c.anchor.x;
    c.data[o + 1] = pose.y - c.anchor.y;
    c.data[o + 2] = pose.z - c.anchor.z;
    c.data[o + 3] = pose.yaw;
    c.data[o + 4] = pose.pitch;
    c.data[o + 5] = m.v;
    c.data[o + 6] = color;
    c.data[o + 7] = type * 4 + carKind(k, a.trip.cars, overhead) + doorCode;
    c.count++;
    c.st.cars++;
  }
}

function stateOf(c: Ctx, a: ActiveTrip, m: MotionState): TrainState {
  const tr = c.rt.tracks.get(a.trip.track);
  const head = { x: 0, y: 0, z: 0 };
  if (tr) {
    carPose(c.rt, tr.meta, m.s + (a.trip.cars * a.trip.carLengthM) / 2 - 0.5, 0.5, pose);
    Object.assign(head, { x: pose.x, y: pose.y, z: pose.z });
  }
  const stops = a.trip.stops;
  return {
    tripId: a.trip.id,
    line: a.line,
    route: a.trip.route,
    track: a.trip.track,
    cars: a.trip.cars,
    carLengthM: a.trip.carLengthM,
    motion: { ...m },
    head,
    headingRad: pose.yaw,
    stationAt: m.stop >= 0 ? (stops[m.stop]?.station ?? null) : null,
    nextStation: m.next >= 0 ? (stops[m.next]?.station ?? null) : null,
  };
}

/** 한 프레임: 운행 중 트립 → 운동(캐시) → 칸 버퍼·열차 상태. 끝난 트립 캐시는 버린다. */
function step(c: Ctx, active: ActiveTrip[], m: MotionState, gameMs: number, obs: Readonly<Vec3d>, trips: number): void {
  c.anchor = { x: Math.round(obs.x / 256) * 256, y: 0, z: Math.round(obs.z / 256) * 256 };
  c.count = 0;
  c.list = [];
  c.st = { trips, trains: 0, cars: 0, hiddenCars: 0 };
  const seen = new Set<string>();
  for (const a of activeTrips(c.lines, gameMs, active)) {
    const tr = c.rt.tracks.get(a.trip.track);
    if (!tr) continue;
    let mo = c.motions.get(a.trip.id);
    if (!mo || mo.trip !== a.trip) {
      mo = tripMotion(tr, a.trip);
      c.motions.set(a.trip.id, mo);
    }
    seen.add(a.trip.id);
    motionAt(mo, a.t, m);
    writeCars(c, a, m, c.meta.get(a.line));
    c.list.push(stateOf(c, a, m));
  }
  for (const id of c.motions.keys()) if (!seen.has(id)) c.motions.delete(id);
  c.st.trains = c.list.length;
  c.seq++;
}

export function createTrainSim(rt: RailRt, tables: readonly TimetableFile[]): TrainSim {
  const data = new Float32Array(CAPACITY_CARS * TRAIN_STRIDE);
  const c: Ctx = {
    rt,
    lines: tables.map(indexTimetable),
    meta: new Map(rt.net.lines.map((l) => [l.id, l])),
    motions: new Map(),
    data,
    anchor: { x: 0, y: 0, z: 0 },
    count: 0,
    seq: 0,
    list: [],
    st: { trips: 0, trains: 0, cars: 0, hiddenCars: 0 },
  };
  const totalTrips = tables.reduce((n, f) => n + f.calendars.reduce((k, cal) => k + cal.trips.length, 0), 0);
  const active: ActiveTrip[] = [];
  const m: MotionState = { s: 0, v: 0, stop: -1, next: -1, doors: 0 };
  const buffer: SharedInstanceBuffer = {
    data,
    stride: TRAIN_STRIDE,
    anchorWF: () => c.anchor,
    count: () => c.count,
    seq: () => c.seq,
  };
  return {
    buffer,
    update(gameMs, obs) {
      step(c, active, m, gameMs, obs, totalTrips);
    },
    trains: () => c.list,
    trainsNear(p, r) {
      return c.list
        .filter((t) => Math.hypot(t.head.x - p.x, t.head.z - p.z) <= r + t.cars * t.carLengthM)
        .map((t) => ({
          tripId: t.tripId,
          lineId: t.line,
          cars: t.cars,
          carLengthM: t.carLengthM,
          headPosWF: { ...t.head },
          headingRad: t.headingRad,
          speedMs: t.motion.v,
          stoppedAtStationId: t.stationAt,
          doorsOpen: Math.abs(t.motion.doors) > 0.99,
          nextStationId: t.nextStation,
          seats: [],
        }));
    },
    stats: () => ({ ...c.st }),
  };
}
