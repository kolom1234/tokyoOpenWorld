// M07-T03 수락(sim): 시각 점프 뒤 열차 위치 = 연속 진행 결과(±0.1 m), 역간 소요 = 시간표 ±5 s, 문(도착 +3 s ~ 출발 −5 s, 승강장 쪽),
// 칸 배치(간격·종류·팬터그래프), 터널 칸 숨김. 선로 = 직선 + 반경 300 m 곡선(합성).
import { RAIL_ACCEL, tripLegs } from '@sanpo/core';
import {
  RAIL_FLAG,
  type RailNetwork,
  type TimetableFile,
  type TimetableStop,
  type TimetableTrip,
} from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { motionAt, tripMotion } from '../src/internal/rail/motion-profile.ts';
import { createRailRt, type TrackRt } from '../src/internal/rail/network.ts';
import { CAR_KIND, createTrainSim, TRAIN_STRIDE } from '../src/internal/rail/trains.ts';

const STEP = 0.5;
const jst = (h: number, mi = 0, s = 0) => Date.UTC(2026, 9, 5, h - 9, mi, s); // 2026-10-05 월(평일)

/** 북쪽 직선 1.5 km → 반경 300 m 좌회전 90° → 서쪽 직선 1 km. 제한 = 직선 25·곡선 15 m/s. */
function network(kind: 'jr' | 'metro' = 'jr', tunnelFrom = Number.POSITIVE_INFINITY): RailNetwork {
  const thirdRail = kind === 'metro';
  const pts: number[] = [];
  const lim: number[] = [];
  for (let s = 0; s <= 1500; s += STEP) {
    pts.push(0, 10, -s);
    lim.push(25);
  }
  const R = 300;
  for (let a = STEP / R; a <= Math.PI / 2; a += STEP / R) {
    pts.push(-R + R * Math.cos(a), 10, -1500 - R * Math.sin(a));
    lim.push(15);
  }
  const n0 = pts.length / 3;
  const [ex, ez] = [pts[(n0 - 1) * 3] as number, pts[(n0 - 1) * 3 + 2] as number];
  for (let s = STEP; s <= 1000; s += STEP) {
    pts.push(ex - s, 10, ez);
    lim.push(25);
  }
  const n = pts.length / 3;
  const len = (n - 1) * STEP;
  const flags = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (k * STEP >= tunnelFrom) flags[k] = RAIL_FLAG.tunnel;
  return {
    lines: [
      {
        id: 'l',
        name: { ja: 'l', en: 'l' },
        color: '#9acd32',
        kind,
        rideable: true,
        maxSpeedKmh: 90,
        gaugeM: 1.067,
        formation: { cars: 11, carLengthM: 20 },
        thirdRail,
      },
    ],
    tracks: [
      {
        id: 'l-outer',
        line: 'l',
        heading: 'outer',
        ptOffset: 0,
        ptCount: n,
        lengthM: len,
        stepM: STEP,
        stops: [
          { station: 'a', s: 600, side: 'L', platformLengthM: 220 },
          { station: 'b', s: 2400, side: 'R', platformLengthM: 220 },
        ],
      },
    ],
    stations: [],
    points: Float32Array.from(pts),
    speed: Float32Array.from(lim),
    flags,
  };
}

/** 컴파일러와 같은 규칙으로 트립 하나(정차 40 s). */
function trip(net: RailNetwork, id: string, enterS: number, cars = 11): TimetableTrip {
  const t = net.tracks[0] as RailNetwork['tracks'][number];
  const half = (cars * 20) / 2;
  const [from, to] = [half, t.lengthM - half];
  const legs = tripLegs(net.speed, STEP, from, to, [600, 2400]);
  const a0 = enterS + (legs[0]?.duration as number);
  const d0 = a0 + 40;
  const a1 = d0 + (legs[1]?.duration as number);
  const d1 = a1 + 40;
  return {
    id,
    route: 'l',
    track: 'l-outer',
    dir: 'outer',
    cars,
    carLengthM: 20,
    from,
    to,
    enterS,
    exitS: d1 + (legs[2]?.duration as number),
    stops: [
      { station: 'a', s: 600, arrS: a0, depS: d0 },
      { station: 'b', s: 2400, arrS: a1, depS: d1 },
    ],
  };
}

const file = (trips: TimetableTrip[]): TimetableFile => ({
  schema: 1,
  line: 'l',
  source: 'synthetic',
  approximate: true,
  routes: [{ id: 'l', name: { ja: 'l', en: 'l' }, color: '#9acd32' }],
  calendars: [{ id: 'weekday', days: ['weekday'], trips }],
});

const ORIGIN = { x: 0, y: 0, z: 0 };
type V3 = [number, number, number];
const head = (d: Float32Array): V3 => [d[0] as number, d[1] as number, d[2] as number];

describe('train motion', () => {
  const net = network();
  const T0 = 5 * 3600 + 30 * 60;
  const tt = file([trip(net, 't1', T0)]);

  it('jumping straight to a time gives the same car positions as running continuously (±0.1 m)', () => {
    const cont = createTrainSim(createRailRt(net), [tt]);
    const jump = createTrainSim(createRailRt(net), [tt]);
    let prev: V3 | undefined;
    for (let f = 0; f <= 60 * 330; f++) {
      const ms = jst(5, 30) + (f * 1000) / 60;
      cont.update(ms, ORIGIN);
      if (cont.buffer.count() === 0) break; // 트립 끝
      const p = head(cont.buffer.data);
      // 연속: 한 프레임 이동 ≤ 25 m/s × 1/60 s(+ 곡선 대차 보정 여유).
      if (prev) expect(Math.hypot(p[0] - prev[0], p[2] - prev[2])).toBeLessThan(25 / 60 + 0.02);
      prev = p;
      if (f % 997 === 0) {
        jump.update(ms, ORIGIN);
        expect(jump.buffer.count()).toBe(cont.buffer.count());
        const q = head(jump.buffer.data);
        expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('runs between stations in the timetable time (±5 s) and opens doors on the platform side', () => {
    const t = tt.calendars[0]?.trips[0] as TimetableTrip;
    const [s0, s1] = t.stops as [TimetableStop, TimetableStop];
    const mo = tripMotion(createRailRt(net).tracks.get('l-outer') as TrackRt, t);
    const m = { s: 0, v: 0, stop: -1, next: -1, doors: 0 };
    let arrivedB = Number.NaN;
    for (let x = s0.depS; x < t.exitS; x += 0.1) {
      motionAt(mo, x, m);
      if (m.stop === 1) {
        arrivedB = x;
        break;
      }
    }
    expect(Math.abs(arrivedB - s0.depS - (s1.arrS - s0.depS))).toBeLessThanOrEqual(5);
    expect(Math.abs(arrivedB - s1.arrS)).toBeLessThan(0.2);
    // 문: 도착 +3 s 전 닫힘, 한가운데 활짝(왼쪽 = −1 / 오른쪽 = +1), 출발 −5 s 뒤 닫힘, 주행 중 0.
    const a = s0;
    expect(motionAt(mo, a.arrS + 2, m).doors).toBe(0);
    expect(motionAt(mo, (a.arrS + a.depS) / 2, m).doors).toBe(-1);
    expect(motionAt(mo, a.depS - 4, m).doors).toBe(0);
    expect(motionAt(mo, (s1.arrS + s1.depS) / 2, m).doors).toBe(1);
    expect(motionAt(mo, a.depS + 10, m).doors).toBe(0);
    expect(motionAt(mo, a.depS + 10, m).v).toBeCloseTo(RAIL_ACCEL * 10, 0);
  });
});

describe('train cars', () => {
  it('lays out the formation: cab ends, pantographs on overhead lines, spacing ≈ car length', () => {
    const net = network();
    const sim = createTrainSim(createRailRt(net), [file([trip(net, 't1', 5 * 3600)])]);
    sim.update(jst(5, 0, 30), ORIGIN);
    const d = sim.buffer.data;
    expect(sim.buffer.count()).toBe(11);
    const kinds = Array.from({ length: 11 }, (_, k) => Math.floor(d[k * TRAIN_STRIDE + 7] as number) % 4);
    expect(kinds[0]).toBe(CAR_KIND.cabFront);
    expect(kinds[10]).toBe(CAR_KIND.cabRear);
    expect(kinds.filter((k) => k === CAR_KIND.pantograph).length).toBeGreaterThan(0);
    expect(d[6]).toBe(0x9acd32);
    for (let k = 1; k < 11; k++) {
      const o = k * TRAIN_STRIDE;
      const gap = Math.hypot(
        (d[o] as number) - (d[o - TRAIN_STRIDE] as number),
        (d[o + 2] as number) - (d[o + 2 - TRAIN_STRIDE] as number),
      );
      expect(gap).toBeGreaterThan(19.5);
      expect(gap).toBeLessThan(20.05);
    }
    const metro = network('metro');
    const sm = createTrainSim(createRailRt(metro), [file([trip(metro, 't1', 5 * 3600)])]);
    sm.update(jst(5, 0, 30), ORIGIN);
    const md = sm.buffer.data;
    for (let k = 0; k < 11; k++)
      expect(Math.floor(md[k * TRAIN_STRIDE + 7] as number) % 4).not.toBe(CAR_KIND.pantograph);
  });

  it('hides cars inside tunnels and reports trains near a point', () => {
    const net = network('jr', 1000);
    const sim = createTrainSim(createRailRt(net), [file([trip(net, 't1', 5 * 3600)])]);
    // 정차 a(600 m) — 편성 490–710 m: 터널(1000 m~) 밖 11칸.
    sim.update(jst(5, 0, 50), ORIGIN);
    expect(sim.buffer.count()).toBe(11);
    const near = sim.trainsNear({ x: 0, y: 0, z: -600 }, 50);
    expect(near).toHaveLength(1);
    expect(near[0]?.stoppedAtStationId).toBe('a');
    // 정차 b(2400 m, 터널 안) — 칸 없음, 열차는 있다.
    sim.update(jst(5, 3, 30), ORIGIN);
    expect(sim.stats().trains).toBe(1);
    expect(sim.buffer.count()).toBe(0);
    expect(sim.stats().hiddenCars).toBeGreaterThan(0);
  });
});
