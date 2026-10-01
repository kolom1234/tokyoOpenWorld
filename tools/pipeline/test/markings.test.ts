// M05-T02 노면 표시: 데칼 띠 감기(위에서 CCW)·차도 위만·셀 소유, 일본식 횡단보도 막대 간격, 차선 규칙(좌측통행·중앙선 색), 「止まれ」 획 폰트.
import { describe, expect, it } from 'vitest';
import type { RoadRecord } from '../src/readers/plateau/types.ts';
import { DECAL_LIFT_M, emptyDecals, type MarkCtx, PAINT, stripe } from '../src/stages/derive/markings/common.ts';
import {
  addCrosswalk,
  BAR_M,
  crosswalkWidth,
  GAP_M,
  isMarkedCrossing,
} from '../src/stages/derive/markings/crosswalk.ts';
import { buildMarkings } from '../src/stages/derive/markings/index.ts';
import { laneLines } from '../src/stages/derive/markings/lanes.ts';
import { GLYPHS } from '../src/stages/derive/markings/text.ts';
import { roadIndex } from '../src/stages/derive/roads.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const road = (
  id: string,
  fn: RoadRecord['function'],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  code?: string,
): RoadRecord => ({
  layer: 'roads',
  id,
  roadId: 'r',
  lod: 3,
  function: fn,
  functionCode: code ?? (fn === 'sidewalk' ? 'TrafficArea:2000' : 'TrafficArea:1000'),
  polygonWF: [[x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0]],
  source: 'plateau-shibuya',
});
const osm = (id: string, geom: OsmRecord['geom'], xz: number[], tags: Record<string, string>): OsmRecord => ({
  layer: 'osm',
  id,
  geom,
  rings: [xz],
  tags,
  source: 'osm-kanto',
});

/** 셀 L0_0_0(0–256): 동서 차도 z 100–120, 남북 보도 x 0–256 z 96–100·120–124. 지형 평지 y = 10. */
function ctx(): MarkCtx {
  const roads = [
    road('c', 'carriageway', 0, 100, 256, 120),
    road('s1', 'sidewalk', 0, 96, 256, 100),
    road('s2', 'sidewalk', 0, 120, 256, 124),
  ];
  return {
    out: emptyDecals(),
    ox: 0,
    oz: 0,
    terrainAt: () => 10,
    roads: roadIndex(roads),
    inIntersection: () => false,
  };
}

function upward(c: MarkCtx): boolean {
  const p = c.out.pos;
  for (let t = 0; t < c.out.idx.length; t += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => (c.out.idx[t + k] as number) * 3) as [number, number, number];
    const y =
      ((p[b + 2] as number) - (p[a + 2] as number)) * ((p[d] as number) - (p[a] as number)) -
      ((p[b] as number) - (p[a] as number)) * ((p[d + 2] as number) - (p[a + 2] as number));
    if (y <= 0) return false;
  }
  return true;
}

describe('road markings', () => {
  it('stripes face up (CCW from above) in every direction, sit 2 cm above the terrain and skip sidewalks', () => {
    for (const [a, b] of [
      [
        [10, 110],
        [30, 110],
      ],
      [
        [30, 110],
        [10, 110],
      ],
      [
        [20, 101],
        [20, 119],
      ],
      [
        [20, 119],
        [20, 101],
      ],
    ] as const) {
      const c = ctx();
      expect(stripe(c, [...a], [...b], 0.5, PAINT.white)).toBeGreaterThan(0);
      expect(upward(c)).toBe(true);
      expect(c.out.pos[1]).toBeCloseTo(10 + DECAL_LIFT_M, 9);
    }
    const c = ctx();
    expect(stripe(c, [10, 97], [30, 97], 0.5, PAINT.white)).toBe(0); // 보도 위
  });

  it('draws Japanese ladder crosswalks: 0.45 m bars every 0.9 m on the carriageway only, 6 m wide at signals', () => {
    const cross = osm('w1', 'line', [50, 90, 50, 130], {
      highway: 'footway',
      footway: 'crossing',
      crossing: 'traffic_signals',
    });
    expect(isMarkedCrossing(cross)).toBe(true);
    expect(isMarkedCrossing(osm('w2', 'line', [0, 0, 1, 1], { footway: 'crossing', crossing: 'unmarked' }))).toBe(
      false,
    );
    expect(crosswalkWidth(cross)).toBe(6);
    const c = ctx();
    const bars = addCrosswalk(c, cross);
    expect(bars).toBe(Math.floor((20 - BAR_M) / (BAR_M + GAP_M)) + 1); // 차도 20 m 폭
    const xs = c.out.pos.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 6);
    expect(upward(c)).toBe(true);
  });

  it('lays lanes for left-hand traffic: centre line yellow on ≥ 4 lanes, dashed separators, one-way all dashed', () => {
    const four = laneLines(osm('w', 'line', [], { highway: 'tertiary', lanes: '4' }));
    expect(four.lines.map((l) => [l.k, l.paint, l.dashed])).toEqual([
      [1, PAINT.white, true],
      [2, PAINT.yellow, false],
      [3, PAINT.white, true],
    ]);
    expect(laneLines(osm('w', 'line', [], { highway: 'tertiary', lanes: '2' })).lines).toEqual([
      { k: 1, paint: PAINT.white, dashed: false },
    ]);
    expect(
      laneLines(osm('w', 'line', [], { highway: 'tertiary', lanes: '3', oneway: 'yes' })).lines.every((l) => l.dashed),
    ).toBe(true);
  });

  it('builds a cell: crosswalk + signal stop lines + stop sign text, all owned by the cell', () => {
    const roads = [road('c', 'carriageway', 0, 100, 256, 120), road('s1', 'sidewalk', 0, 96, 256, 100)];
    const r = buildMarkings({
      osm: [
        osm('w1', 'line', [50, 90, 50, 130], { highway: 'footway', footway: 'crossing', crossing: 'traffic_signals' }),
        osm('w2', 'line', [0, 110, 256, 110], { highway: 'tertiary', lanes: '6' }),
        osm('n1', 'point', [150, 110], { highway: 'stop' }),
      ],
      roads,
      ox: 0,
      oz: 0,
      terrainAt: () => 10,
    });
    expect(r.stats.crosswalkBars).toBeGreaterThan(10);
    expect(r.stats.stopLines).toBe(2);
    expect(r.stats.stopSigns).toBe(1);
    expect(r.stats.lanePieces).toBeGreaterThan(100);
    expect(Object.keys(GLYPHS)).toEqual(['止', 'ま', 'れ']);
  });
});
