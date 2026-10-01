// M05-T04 나무 배치·식생 지면: 태그·도로 이름 수종, OSM 나무 차도 밖으로, 규칙 가로수(넓은 보도·횡단 틈), 숲 격자(면 안·셀 무관·결정론),
// 줄기 콜라이더, 예산 절단, `_SURF` 녹지 덧칠(plaza만).
import { TREE_SPECIES } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { RoadRecord } from '../src/readers/plateau/types.ts';
import { SURF } from '../src/stages/build/surface-class.ts';
import { roadIndex } from '../src/stages/derive/roads.ts';
import { buildTrees, type TreeInput } from '../src/stages/derive/trees/index.ts';
import { speciesFromTags, streetSpecies } from '../src/stages/derive/trees/species.ts';
import { paintVegetation } from '../src/stages/derive/vegetation.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const road = (id: string, fn: RoadRecord['function'], x0: number, z0: number, x1: number, z1: number): RoadRecord => ({
  layer: 'roads',
  id,
  roadId: 'r',
  lod: 3,
  function: fn,
  functionCode: fn === 'sidewalk' ? 'TrafficArea:2000' : 'TrafficArea:1000',
  polygonWF: [[x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0]],
  source: 'plateau-shibuya',
});
const osm = (id: string, geom: OsmRecord['geom'], rings: number[][], tags: Record<string, string>): OsmRecord => ({
  layer: 'osm',
  id,
  geom,
  rings,
  tags,
  source: 'osm-kanto',
});

function input(roads: RoadRecord[], recs: OsmRecord[], ox = 0, budget?: number): TreeInput {
  return {
    cellId: `L0_${ox / 256}_0`,
    ox,
    oz: 0,
    osm: recs,
    roads: roadIndex(roads),
    surfaceAt: () => 10,
    inIntersection: () => false,
    inBuilding: () => false,
    avoid: [],
    ...(budget !== undefined ? { budget } : {}),
  };
}

describe('species', () => {
  it('reads genus/species/name tags and maps named streets', () => {
    expect(speciesFromTags({ genus: 'Ginkgo' })).toBe('ginkgo');
    expect(speciesFromTags({ species: 'Zelkova serrata' })).toBe('zelkova');
    expect(speciesFromTags({ name: '桜' })).toBe('cherry');
    expect(speciesFromTags({ species: 'Cinnamomum camphora' })).toBe('camphor');
    expect(speciesFromTags({ leaf_type: 'needleleaved' })).toBe('pine');
    expect(speciesFromTags({ natural: 'tree' })).toBeUndefined();
    expect(streetSpecies('表参道', 'w1')).toBe('zelkova');
    expect(streetSpecies(undefined, 'w42')).toBe(streetSpecies(undefined, 'w42'));
  });
});

describe('street trees', () => {
  // 동서 간선 z 100–120 + 보도 96–100(4 m)·120–122(2 m — 좁음).
  const roads = [
    road('c', 'carriageway', -50, 100, 306, 120),
    road('s1', 'sidewalk', -50, 96, 306, 100),
    road('s2', 'sidewalk', -50, 120, 306, 122),
  ];
  const artery = osm('w9', 'line', [[-40, 110, 300, 110]], { highway: 'primary', name: '表参道' });

  it('moves a mapped tree off the carriageway and keeps its tagged species', () => {
    const t = buildTrees(input(roads, [osm('n1', 'point', [[30, 101]], { natural: 'tree', genus: 'Ginkgo' })]));
    expect(t.stats.osm).toBe(1);
    const r = t.records[0];
    expect(r?.species).toBe(TREE_SPECIES.ginkgo);
    expect(r?.z as number).toBeLessThanOrEqual(100.0001);
    expect(t.colliders).toHaveLength(1);
  });

  it('keeps mapped trees on LOD1 whole-width road polygons when clear of the centerline', () => {
    const lod1 = [road('c', 'carriageway', -50, 90, 306, 130)];
    const centre = osm('w9', 'line', [[-40, 110, 300, 110]], { highway: 'secondary' });
    const t = buildTrees(
      input(lod1, [
        centre,
        osm('n1', 'point', [[30, 94]], { natural: 'tree' }),
        osm('n2', 'point', [[40, 111]], { natural: 'tree' }),
      ]),
    );
    expect(t.records.map((r) => [r.x, r.z])).toEqual([[30, 94]]);
  });

  it('lines wide sidewalks of arterials every 10 m (named street species), skipping crossings and narrow sidewalks', () => {
    const crossing = osm('w3', 'line', [[128, 94, 128, 126]], {
      highway: 'footway',
      footway: 'crossing',
      crossing: 'marked',
    });
    const t = buildTrees(input(roads, [artery, crossing]));
    expect(t.stats.street).toBeGreaterThan(15);
    for (const r of t.records) {
      expect(r.species).toBe(TREE_SPECIES.zelkova);
      expect(r.z).toBeCloseTo(99, 1); // 4 m 보도만(2 m 보도 생략), 차도 끝 + 1 m
      expect(Math.abs(r.x - 128)).toBeGreaterThan(2 + 4 - 1e-6);
    }
    const xs = t.records.map((r) => r.x).sort((a, b) => a - b);
    for (let k = 1; k < xs.length; k++)
      expect((xs[k] as number) - (xs[k - 1] as number)).toBeGreaterThanOrEqual(10 - 1e-3);
  });
});

describe('green fill', () => {
  const forest = osm('a1', 'polygon', [[100, 20, 400, 20, 400, 120, 100, 120]], { landuse: 'forest' });

  it('fills forest polygons on a world lattice, identically from either cell', () => {
    const left = buildTrees(input([], [forest], 0));
    const right = buildTrees(input([], [forest], 256));
    const all = [...left.records.map((r) => [r.x, r.z]), ...right.records.map((r) => [r.x + 256, r.z])];
    expect(all.length).toBeGreaterThan(400);
    expect(all.length).toBeLessThan(700);
    for (const [x, z] of all) {
      expect(x as number).toBeGreaterThan(100);
      expect(x as number).toBeLessThan(400);
      expect(z as number).toBeGreaterThan(20);
      expect(z as number).toBeLessThan(120);
    }
    expect(buildTrees(input([], [forest], 0)).records).toEqual(left.records);
    expect(left.colliders.every((c) => c.kind === 'cylinder')).toBe(true);
  });

  it('keeps OSM paths (sando) clear of fill trees, using the width tag', () => {
    const sando = osm('w9', 'line', [[100, 70, 250, 70]], { highway: 'pedestrian', width: '10' });
    const t = buildTrees(input([], [forest, sando], 0));
    expect(t.records.length).toBeGreaterThan(200);
    for (const r of t.records) if (r.x > 101 && r.x < 249) expect(Math.abs(r.z - 70)).toBeGreaterThanOrEqual(6);
  });

  it('trims to the per-cell budget after mapped and street trees', () => {
    const t = buildTrees(input([], [forest, osm('n1', 'point', [[50, 50]], { natural: 'tree' })], 0, 10));
    expect(t.stats.trees).toBe(10);
    expect(t.stats.osm).toBe(1);
    expect(t.stats.trimmed).toBeGreaterThan(0);
  });
});

describe('vegetation surface', () => {
  it('paints green areas (forest included) as grass over plaza samples only', () => {
    const n = 8;
    const surf = new Uint8Array(n * n).fill(SURF.plaza);
    surf[0] = SURF.asphalt;
    const park = osm('p', 'polygon', [[-1, -1, 9, -1, 9, 9, -1, 9]], { leisure: 'park' });
    const wood = osm('w', 'polygon', [[3.5, 3.5, 6.5, 3.5, 6.5, 6.5, 3.5, 6.5]], { natural: 'wood' });
    const out = paintVegetation(surf, [wood, park], 0, 0, { x0: 0, z0: 0, n });
    expect(out[0]).toBe(SURF.asphalt);
    expect(out[1]).toBe(SURF.grass);
    expect(out[5 * n + 5]).toBe(SURF.grass);
    expect(surf[1]).toBe(SURF.plaza);
  });
});
