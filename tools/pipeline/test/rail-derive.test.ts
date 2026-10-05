// M07-T01 철도 파생: 선로 사슬(끝점 공유)·좌측통행 방향, 0.5 m 표본·터널/교량 높이 보간, 곡률 제한속도, 승강장 정차 위치·문 쪽, 셀 선로 메시(제3궤조 = 가선 없음, T03).

import { RAIL_FLAG, type RailNetwork } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { LStream } from '../src/stages/build/overrides/geom.ts';
import { emitRail } from '../src/stages/build/overrides/rail.ts';
import { stationPoints, trackStops } from '../src/stages/derive/rail/platforms.ts';
import { LATERAL_ACCEL, speedLimits } from '../src/stages/derive/rail/speed-limits.ts';
import { RAIL_TOP_M, railHeights, trackSamples } from '../src/stages/derive/rail/splines.ts';
import { buildTracks, VERTEX_FLAG } from '../src/stages/derive/rail/tracks.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const way = (id: string, xz: number[], tags: Record<string, string>): OsmRecord => ({
  layer: 'osm',
  id,
  geom: 'line',
  rings: [xz],
  tags: { railway: 'rail', ...tags },
  source: 'osm-kanto',
});

/** 남북 복선(서 x = −2, 동 x = +2), 각 선로 두 조각 + 측선 하나. */
const ways = [
  way('w1', [-2, 0, -2, -400], { name: '山手線' }),
  way('w2', [-2, -400, -2, -900], { name: '山手線', bridge: 'yes' }),
  way('w3', [2, -900, 2, -500], { name: '山手線' }),
  way('w4', [2, -500, 2, 0], { name: '山手線' }),
  way('w5', [6, -100, 6, -800], { name: '山手線', service: 'siding' }),
];

describe('rail tracks', () => {
  it('chains ways by shared ends and assigns left-hand running (northbound = west track)', () => {
    const t = buildTracks(ways, 'yamanote', ['山手線']);
    expect(t).toHaveLength(2);
    const north = t.find((q) => q.heading === 'north');
    const south = t.find((q) => q.heading === 'south');
    // 북행 = 서쪽(x −2), 점 순서 = 진행 방향(z 감소).
    expect(north?.pts[0]).toEqual([-2, 0]);
    expect(north?.pts.at(-1)).toEqual([-2, -900]);
    expect(south?.pts[0]).toEqual([2, -900]);
    expect(north?.ways).toEqual(['w1', 'w2']);
    // 교량 way 꼭짓점(접합점 포함) 플래그.
    expect(north?.flags.map((f) => (f & VERTEX_FLAG.bridge) !== 0)).toEqual([false, true, true]);
  });
});

describe('rail samples', () => {
  it('interpolates ground through bridge/tunnel runs and lifts the rail above the ground', () => {
    // 교량 아래 지면이 10 m 낮다(도로) — 상판 높이는 양끝 지면 보간.
    const g = [5, 5, 5, -5, -5, -5, 5, 5, 5].map((v) => v as number | undefined);
    const f = [0, 0, 0, 2, 2, 2, 0, 0, 0];
    const h = railHeights(g, f, 20);
    for (const v of h) expect(v).toBeGreaterThan(4);
    const s = trackSamples(
      [
        [0, 0],
        [0, -100],
      ],
      [0, 0],
      () => 10,
    );
    expect(s.xyz.length / 3).toBe(201);
    expect(s.lengthM).toBeCloseTo(100, 3);
    expect(s.xyz[1]).toBeCloseTo(10 + RAIL_TOP_M, 5);
  });

  it('limits speed on curves to √(0.8·R) and keeps the line maximum on straights', () => {
    // 반경 200 m 반원(표본 0.5 m) + 직선.
    const pts: number[] = [];
    for (let a = 0; a <= Math.PI; a += 0.5 / 200) pts.push(200 * Math.cos(a), 0, -200 * Math.sin(a));
    for (let k = 1; k <= 400; k++) pts.push(-200, 0, k * 0.5);
    const v = speedLimits(Float32Array.from(pts), 0.5, 25);
    expect(v[300] as number).toBeCloseTo(Math.sqrt(LATERAL_ACCEL * 200), 0);
    expect(v[v.length - 1] as number).toBe(25);
  });
});

describe('platform stops', () => {
  it('stops at the platform centre with the door side towards the platform', () => {
    const smp = trackSamples(
      [
        [0, 0],
        [0, -600],
      ],
      [0, 0],
      () => 0,
    );
    // 선로(북행) 서쪽(진행 방향 왼쪽) 승강장 z −250 … −470, 가장자리 x −1.7.
    const platform: OsmRecord = {
      layer: 'osm',
      id: 'p1',
      geom: 'polygon',
      rings: [[-1.7, -250, -9, -250, -9, -470, -1.7, -470, -1.7, -250]],
      tags: { railway: 'platform' },
      source: 'osm-kanto',
    };
    const station: OsmRecord = {
      layer: 'osm',
      id: 'n1',
      geom: 'point',
      rings: [[-20, -360]],
      tags: { railway: 'station', name: '原宿' },
      source: 'osm-kanto',
    };
    const st = stationPoints([station], [{ id: 'harajuku', osmNames: ['原宿'] }]);
    const stops = trackStops(smp.xyz, 0.5, [platform, station], st, ['harajuku']);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.station).toBe('harajuku');
    expect(stops[0]?.side).toBe('L');
    expect(stops[0]?.s as number).toBeCloseTo(360, 0);
    expect(Math.abs((stops[0]?.s as number) - (stops[0]?.centroidS as number))).toBeLessThan(2);
  });
});

describe('rail mesh', () => {
  it('emits ballast, sleepers, rails and masts for samples inside the cell, none in tunnels', () => {
    const n = 601;
    const points = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) points.set([100, 10, 300 - k * 0.5], k * 3);
    const flags = new Uint8Array(n);
    flags.fill(RAIL_FLAG.tunnel, 400);
    const net: RailNetwork = {
      lines: [
        {
          id: 'l',
          name: { ja: 'l', en: 'l' },
          color: '#fff',
          kind: 'jr',
          rideable: true,
          maxSpeedKmh: 90,
          gaugeM: 1.067,
          formation: { cars: 1, carLengthM: 20 },
        },
      ],
      tracks: [{ id: 't', line: 'l', heading: 'n', ptOffset: 0, ptCount: n, lengthM: 300, stepM: 0.5, stops: [] }],
      stations: [],
      points,
      speed: new Float32Array(n).fill(20),
      flags,
    };
    const out = new LStream();
    const st = emitRail(out, net, 0, 0);
    // 셀(z 0–256) 안이면서 터널 전(k < 400 → z > 100): z 100–256.
    expect(st.tracks).toBe(1);
    expect(st.meters).toBeGreaterThan(150);
    expect(st.meters).toBeLessThan(160);
    expect(st.tris).toBeGreaterThan(1000);
    const zs = out.pos.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeGreaterThan(99);
    // 가선(레일 위 5.2 m)·가선주 있음 → 제3궤조 노선은 없음(긴자선).
    const top = (o: LStream) => Math.max(...o.pos.filter((_, i) => i % 3 === 1));
    expect(top(out)).toBeGreaterThan(14);
    const third = new LStream();
    emitRail(third, { ...net, lines: net.lines.map((l) => ({ ...l, thirdRail: true })) }, 0, 0);
    expect(top(third)).toBeLessThan(11);
    expect(third.tris).toBeGreaterThan(1000);
  });
});
