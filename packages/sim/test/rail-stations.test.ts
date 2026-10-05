// M07-T04 sim: 승강장 다각형 삼각화(오목 포함)·윗면 +Y·옆면 바깥, 홈도어 배치(편성 문 위치 = gate, 사이 판 ≤ 2 m)·열림 연동,
// 칸 물리 레코드(core TRAIN_BODY_STRIDE — 근처 칸·문·안정 id).
import { TRAIN_BODY_STRIDE, TRAIN_CAR_TYPES } from '@sanpo/core';
import type { RailNetwork, TimetableFile } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { createRailRt } from '../src/internal/rail/network.ts';
import { PSD_GATE_M, platformGeometry, psdLayout, triangulate } from '../src/internal/rail/platforms.ts';
import { createRailStations, PSD_PIECE_STRIDE } from '../src/internal/rail/stations.ts';
import { createTrainSim } from '../src/internal/rail/trains.ts';

const area = (xz: readonly number[], tris: readonly number[]): number => {
  let a = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const [p, q, r] = [tris[i], tris[i + 1], tris[i + 2]] as [number, number, number];
    const ax = (xz[q * 2] as number) - (xz[p * 2] as number);
    const az = (xz[q * 2 + 1] as number) - (xz[p * 2 + 1] as number);
    const bx = (xz[r * 2] as number) - (xz[p * 2] as number);
    const bz = (xz[r * 2 + 1] as number) - (xz[p * 2 + 1] as number);
    a += Math.abs(ax * bz - az * bx) / 2;
  }
  return a;
};

/** 북행 직선 1 km(x 0), 정차 a = 500 m(왼쪽 = 서 승강장 x −1.6 … −9). */
function net(): RailNetwork {
  const n = 2001;
  const points = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) points.set([0, 10, -k * 0.5], k * 3);
  return {
    lines: [
      {
        id: 'l',
        name: { ja: 'l', en: 'l' },
        color: '#9acd32',
        kind: 'jr',
        rideable: true,
        maxSpeedKmh: 90,
        gaugeM: 1.067,
        formation: { cars: 11, carLengthM: 20 },
      },
    ],
    tracks: [
      {
        id: 'l-n',
        line: 'l',
        heading: 'n',
        ptOffset: 0,
        ptCount: n,
        lengthM: 1000,
        stepM: 0.5,
        stops: [{ station: 'a', s: 500, side: 'L', platformLengthM: 230, platform: 0 }],
      },
    ],
    stations: [],
    platforms: [{ id: 'p', ringXZ: [-1.6, -380, -9, -380, -9, -620, -1.6, -620, -1.6, -380], topY: 11.1 }],
    points,
    speed: new Float32Array(n).fill(20),
    flags: new Uint8Array(n),
  };
}

describe('platform geometry', () => {
  it('triangulates concave rings with the full area and faces the top up, the sides out', () => {
    const L = [0, 0, 4, 0, 4, 1, 1, 1, 1, 3, 0, 3];
    const t = triangulate(L);
    expect(t).toHaveLength((6 - 2) * 3);
    expect(area(L, t)).toBeCloseTo(4 + 2, 6);
    const g = platformGeometry(net());
    const P = (i: number) => g.positions[i] as number;
    const sub = (b: number, a: number) =>
      [P(b * 3) - P(a * 3), P(b * 3 + 1) - P(a * 3 + 1), P(b * 3 + 2) - P(a * 3 + 2)] as const;
    for (let i = 0; i < g.indices.length; i += 3) {
      const [a, b, c] = [g.indices[i], g.indices[i + 1], g.indices[i + 2]] as [number, number, number];
      const e1 = sub(b, a);
      const e2 = sub(c, a);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]] as const;
      if (i < g.topIndexCount) expect(n[1]).toBeGreaterThan(0);
      else {
        // 옆면 법선은 승강장 중심(x −5.3, z −500)에서 멀어진다.
        const cx = (P(a * 3) + P(b * 3) + P(c * 3)) / 3 + 5.3;
        const cz = (P(a * 3 + 2) + P(b * 3 + 2) + P(c * 3 + 2)) / 3 + 500;
        expect(n[0] * cx + n[2] * cz).toBeGreaterThan(0);
      }
    }
  });
});

describe('platform screen doors', () => {
  it('puts a gate at every door of the stopped formation and panels between', () => {
    const [ps] = psdLayout(net());
    if (!ps) throw new Error('no psd');
    const doors = TRAIN_CAR_TYPES[0]?.doorsZ.length ?? 0;
    expect(ps.gates).toHaveLength(11 * doors);
    expect(ps.side).toBe(1);
    // 선두 칸(앞 = s 증가) 맨 앞 문: s = 500 + 110 − 10 − (−7.35).
    expect(ps.gates.at(-1)?.[0]).toBeCloseTo(500 + 110 - 10 + 7.35 - PSD_GATE_M / 2, 6);
    for (const [a, b] of ps.panels) {
      expect(b - a).toBeLessThanOrEqual(2 + 1e-9);
      for (const [g0, g1] of ps.gates) expect(b <= g0 + 1e-9 || a >= g1 - 1e-9).toBe(true);
    }
    const st = createRailStations(createRailRt(net()));
    // 홈도어 선 = 승강장 쪽(서, x −2.05).
    expect(st.layout.gates[0]).toBeCloseTo(-2.05, 3);
    expect(st.layout.gates.length / PSD_PIECE_STRIDE).toBe(11 * doors);
  });

  it('opens the gates with the train doors and reports nearby car bodies', () => {
    const n = net();
    const rt = createRailRt(n);
    const tt: TimetableFile = {
      schema: 1,
      line: 'l',
      source: 'synthetic',
      approximate: true,
      routes: [{ id: 'l', name: { ja: 'l', en: 'l' }, color: '#9acd32' }],
      calendars: [
        {
          id: 'weekday',
          days: ['weekday'],
          trips: [
            {
              id: 't',
              route: 'l',
              track: 'l-n',
              dir: 'n',
              cars: 11,
              carLengthM: 20,
              from: 500,
              to: 890,
              enterS: 18_000,
              exitS: 19_000,
              stops: [{ station: 'a', s: 500, arrS: 18_000, depS: 18_060 }],
            },
          ],
        },
      ],
    };
    const sim = createTrainSim(rt, [tt]);
    const st = createRailStations(rt);
    const at = (s: number) => Date.UTC(2026, 9, 5, 5 - 9, 0, s); // 05:00 JST 월 = 18000
    sim.update(at(30), { x: 0, y: 0, z: 0 });
    st.update(sim.trains());
    expect(Math.min(...st.gateOpen)).toBe(1);
    sim.update(at(1), { x: 0, y: 0, z: 0 });
    st.update(sim.trains());
    expect(Math.max(...st.gateOpen)).toBe(0);
    const b = sim.bodiesNear({ x: 0, y: 10, z: -500 }, 25);
    expect(b.length / TRAIN_BODY_STRIDE).toBe(3);
    sim.update(at(30), { x: 0, y: 0, z: 0 });
    const b2 = sim.bodiesNear({ x: 0, y: 10, z: -500 }, 25);
    expect(b2[0]).toBe(b[0]);
    expect(b2[8]).toBe(-1);
  });
});
