// 신호 사이트(M06-T02): 1020 조각을 id로 묶은 중심·주축(셀마다 보는 조각 집합이 같으면 같은 ID), 그룹(차량 A/B·보행 A/B), 계획 사이트 반경, 코드 비트.
import { describe, expect, it } from 'vitest';
import type { RoadRecord } from '../src/readers/plateau/types.ts';
import {
  axisGap,
  decodeSignal,
  junctionsOf,
  roadAxes,
  signalCode,
  siteFinder,
} from '../src/stages/derive/props/signal-sites.ts';

const piece = (id: string, x0: number, z0: number, x1: number, z1: number): RoadRecord => ({
  layer: 'roads',
  id,
  roadId: 'r',
  lod: 3,
  function: 'carriageway',
  functionCode: 'TrafficArea:1020',
  polygonWF: [[x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1]],
  source: 't',
});

describe('signal sites', () => {
  it('merges clipped pieces of one junction into one centre and a stable id', () => {
    // 셀 경계(x = 256)에서 잘린 같은 교차로(가로로 긴 30 × 20 m).
    const j = junctionsOf([piece('J1', 240, 100, 256, 120), piece('J1', 256, 100, 270, 120)]);
    expect(j).toHaveLength(1);
    expect(j[0]?.cx).toBeCloseTo(255, 6);
    expect(j[0]?.cz).toBeCloseTo(110, 6);
    expect(axisGap(j[0]?.axis ?? 1, 0)).toBeLessThan(0.01); // 장축 = x(OSM 선이 없을 때의 대체 축)
    const find = siteFinder(j, []);
    const a = find([250, 104], { center: [0, 0], axis: 0 });
    const b = find([262, 118], { center: [0, 0], axis: 0 });
    expect(a.id).toBe(b.id);
  });

  it('assigns vehicle/pedestrian groups by axis and packs plan + group into a 24-bit code', () => {
    const find = siteFinder([{ cx: 0, cz: 0, axis: 0 }], [{ centerWF: [2, 2], radiusM: 10, plan: 1 }]);
    const s = find([5, 5], { center: [0, 0], axis: 0 });
    expect(s.plan).toBe(1);
    const vA = decodeSignal(signalCode(s, 'vehicle', -1, 0.1)); // 동서로 오는 차를 봄
    const vB = decodeSignal(signalCode(s, 'vehicle', 0, 1));
    const pA = decodeSignal(signalCode(s, 'pedestrian', 1, 0)); // 동서로 걷는 보행(∥ A)
    const pB = decodeSignal(signalCode(s, 'pedestrian', 0.2, -1));
    expect([vA.group, vB.group, pA.group, pB.group]).toEqual([0, 1, 2, 3]);
    expect(vA.plan).toBe(1);
    expect(signalCode(s, 'pedestrian', 0, 1)).toBeLessThan(2 ** 24);
    // 연동 칸: 기본 계획은 주축 위치 ÷ 12 m/s(2 s 칸), 사이트 계획은 0.
    expect(vA.slot).toBe(0);
    const std = siteFinder([{ cx: 240, cz: 0, axis: 0 }], [])([240, 0], { center: [0, 0], axis: 0 });
    expect(decodeSignal(signalCode(std, 'vehicle', 1, 0)).slot).toBe(((120 - 20) % 120) / 2);
  });

  it('splits a skewed junction by the two nearest road directions (not a single ±45° axis)', () => {
    // 50°·−20° 두 길(70° 사이) — 단일 축이면 55°와 −21°가 한 그룹이 될 수 있었다.
    const line = (deg: number, len: number) => {
      const r = (deg * Math.PI) / 180;
      return [-Math.cos(r) * len, -Math.sin(r) * len, Math.cos(r) * len, Math.sin(r) * len];
    };
    const axes = roadAxes([
      [(50 * Math.PI) / 180, 60],
      [(-20 * Math.PI) / 180, 40],
    ]);
    expect(axes).toBeDefined();
    const find = siteFinder([{ cx: 0, cz: 0, axis: 0 }], [], [line(50, 30), line(-20, 30), line(-20, 10)]);
    const s = find([3, 3], { center: [0, 0], axis: 0 });
    const g = (deg: number) =>
      decodeSignal(signalCode(s, 'vehicle', Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180))).group;
    expect(g(55)).toBe(g(46));
    expect(g(55)).toBe(g(46 + 180));
    expect(g(-21)).not.toBe(g(55));
    expect(g(159)).toBe(g(-21));
    // 보행: 50° 길을 건너는(보행 방향 140°) 사람은 −20° 차량과 같이 녹색.
    const ped = decodeSignal(
      signalCode(s, 'pedestrian', Math.cos((140 * Math.PI) / 180), Math.sin((140 * Math.PI) / 180)),
    ).group;
    expect(ped - 2).toBe(g(-20));
  });

  it('falls back to a 4 m-snapped crossing centre without a junction nearby', () => {
    const find = siteFinder([{ cx: 1000, cz: 1000, axis: 0 }], []);
    const s = find([10.9, 21.2], { center: [10.9, 21.2], axis: Math.PI / 2 });
    expect([s.cx, s.cz]).toEqual([12, 20]);
    expect(s.plan).toBe(0);
  });
});
