// M05-T03 소품 배치: 전주(생활도로 한쪽 끝·선 id 시드로 셀 무관 정거장·전선 3가닥), 신호(보행·차량 좌측), 가드 파이프(횡단 틈),
// 자판기(길가 변·바깥 정면), 맨홀(차도), 예산 절단, 결정론, props.inst 왕복.
import { fileURLToPath } from 'node:url';
import { PROP_TYPE, parseProps, writeProps } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { BuildingRecord, RoadRecord } from '../src/readers/plateau/types.ts';
import { type PropCatalog, readCatalog } from '../src/stages/derive/props/context.ts';
import { buildProps, type PropInput } from '../src/stages/derive/props/index.ts';
import { poleStations } from '../src/stages/derive/props/poles.ts';
import { roadIndex } from '../src/stages/derive/roads.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const CATALOG = readCatalog(REPO);

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
const osm = (id: string, geom: OsmRecord['geom'], xz: number[], tags: Record<string, string>): OsmRecord => ({
  layer: 'osm',
  id,
  geom,
  rings: [xz],
  tags,
  source: 'osm-kanto',
});

function input(o: {
  roads: RoadRecord[];
  osm: OsmRecord[];
  buildings?: BuildingRecord[];
  ox?: number;
  catalog?: PropCatalog;
}): PropInput {
  const idx = roadIndex(o.roads);
  const b = o.buildings ?? [];
  return {
    catalog: o.catalog ?? CATALOG,
    cellId: `L0_${(o.ox ?? 0) / 256}_0`,
    ox: o.ox ?? 0,
    oz: 0,
    osm: o.osm,
    buildings: b,
    roads: idx,
    inIntersection: () => false,
    inBuilding: () => false,
    surfaceAt: () => 10,
  };
}

/** type → [x, y, z, yaw, scale][] (WF x = 로컬 + ox). */
function instancesOf(out: ReturnType<typeof buildProps>, type: keyof typeof PROP_TYPE, ox = 0): number[][] {
  const b = out.batches.find((x) => x.typeId === PROP_TYPE[type]);
  const r: number[][] = [];
  for (let i = 0; b && i < b.transforms.length; i += 5) {
    const t = Array.from(b.transforms.subarray(i, i + 5));
    r.push([(t[0] as number) + ox, t[1] as number, t[2] as number, t[3] as number, t[4] as number]);
  }
  return r;
}

describe('utility poles', () => {
  // 폭 6 m 생활도로(보도 없음) z 100–106, 선은 두 셀을 가로지른다.
  const roads = [road('c', 'carriageway', -100, 100, 612, 106)];
  const line = osm('w1', 'line', [-80, 103, 600, 103], { highway: 'residential' });

  it('stand 0.35 m inside one road edge every 30–40 m, identical across runs', () => {
    const a = buildProps(input({ roads, osm: [line] }));
    const b = buildProps(input({ roads, osm: [line] }));
    expect(a.batches).toEqual(b.batches);
    const poles = instancesOf(a, 'utilityPole');
    expect(poles.length).toBeGreaterThanOrEqual(6);
    const z0 = poles[0]?.[2] as number;
    expect(Math.min(Math.abs(z0 - 100.35), Math.abs(z0 - 105.65))).toBeLessThan(0.02);
    for (const p of poles) expect(p[2]).toBeCloseTo(z0, 5);
    const xs = poles.map((p) => p[0] as number).sort((x, y) => x - y);
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(30 - 1e-6);
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeLessThanOrEqual(40 + 1e-6);
    }
    expect(a.colliders.filter((c) => c.kind === 'cylinder')).toHaveLength(poles.length);
  });

  it('stations do not depend on the cell, wires come from the start pole cell (5 per span)', () => {
    const left = buildProps(input({ roads, osm: [line] }));
    const right = buildProps(input({ roads, osm: [line], ox: 256 }));
    const xs = [...instancesOf(left, 'utilityPole'), ...instancesOf(right, 'utilityPole', 256)].map((p) => p[0]);
    const st = poleStations(line, [30, 40])
      .at.map((s) => s.p[0])
      .filter((x) => x >= 0 && x < 512);
    const sorted = xs.sort((a, b) => (a as number) - (b as number));
    expect(sorted).toHaveLength(st.length);
    for (const [i, x] of sorted.entries()) expect(x).toBeCloseTo(st[i] as number, 3);
    // 경간 수 = 전주 수 − 1(두 셀 합), 경간마다 5가닥(통신 2·배전 3) × 8토막 × 4삼각형.
    const spans = left.stats.wireSpans + right.stats.wireSpans;
    const inRange = poleStations(line, [30, 40]).at.filter((s) => s.p[0] >= 0 && s.p[0] < 512).length;
    expect(spans).toBeGreaterThanOrEqual((inRange - 1) * 5);
    expect(left.wires.idx.length / 3).toBe(left.stats.wireSpans * 32);
    const wy = left.wires.pos.filter((_, i) => i % 3 === 1);
    expect(Math.max(...wy)).toBeLessThanOrEqual(10 + 9.6 + 0.02);
    expect(Math.min(...wy)).toBeGreaterThan(10 + 5.6 - 0.45 - 0.02);
  });
});

describe('arterial with a signalised crossing', () => {
  // 동서 간선 차도 z 100–120 + 보도 96–100·120–124, 신호 횡단 x = 128.
  const roads = [
    road('c', 'carriageway', -50, 100, 306, 120),
    road('s1', 'sidewalk', -50, 96, 306, 100),
    road('s2', 'sidewalk', -50, 120, 306, 124),
  ];
  const osmRecs = [
    osm('w2', 'line', [-40, 110, 300, 110], { highway: 'primary' }),
    osm('w3', 'line', [128, 94, 128, 126], { highway: 'footway', footway: 'crossing', crossing: 'traffic_signals' }),
  ];
  const out = buildProps(input({ roads, osm: osmRecs }));

  it('puts pedestrian signals on both sidewalks facing across', () => {
    const ped = instancesOf(out, 'signalPedestrian');
    expect(ped).toHaveLength(2);
    const [n, s] = ped.sort((a, b) => (a[2] as number) - (b[2] as number)) as [number[], number[]];
    expect(n[2]).toBeLessThan(100);
    expect(s[2]).toBeGreaterThan(120);
    expect(Math.cos(n[3] as number)).toBeCloseTo(1, 5); // 남쪽(+Z)을 본다
    expect(Math.cos(s[3] as number)).toBeCloseTo(-1, 5);
  });

  it('puts vehicle signals on the left kerb of each direction (mid-block)', () => {
    const veh = instancesOf(out, 'signalVehicle');
    expect(veh).toHaveLength(2);
    for (const v of veh) {
      const faceX = Math.sin(v[3] as number);
      // +X로 달리는 차(얼굴 −X)는 북쪽(z < 100), −X로 달리는 차는 남쪽(z > 120).
      if (faceX < 0) expect(v[2]).toBeCloseTo(99.2, 1);
      else expect(v[2]).toBeCloseTo(120.8, 1);
    }
  });

  it('runs guard rails along both kerbs with a gap at the crossing', () => {
    const rails = instancesOf(out, 'guardRail');
    expect(rails.length).toBeGreaterThan(80);
    for (const r of rails) {
      expect(Math.min(Math.abs((r[2] as number) - 99.65), Math.abs((r[2] as number) - 120.35))).toBeLessThan(0.02);
      expect(Math.abs((r[0] as number) - 128)).toBeGreaterThanOrEqual(6.5);
    }
  });

  it('puts manholes on the carriageway only', () => {
    const mh = instancesOf(out, 'manhole');
    expect(mh.length).toBeGreaterThanOrEqual(5);
    for (const m of mh) expect(m[2] as number).toBeGreaterThan(100);
    for (const m of mh) expect(m[2] as number).toBeLessThan(120);
    expect(out.colliders.length).toBe(out.stats.instances - mh.length);
  });

  it('trims to the per-cell budget in priority order', () => {
    const small = { ...CATALOG, budget: { maxInstancesPerCell: 5 } };
    const t = buildProps(input({ roads, osm: osmRecs, catalog: small }));
    expect(t.stats.instances).toBe(5);
    expect(t.stats.trimmed).toBe(out.stats.instances - 5);
    expect(instancesOf(t, 'signalPedestrian')).toHaveLength(2);
  });
});

describe('vending machines', () => {
  it('stand in front of street-facing walls, facing out, never on the carriageway', () => {
    const roads = [road('c', 'carriageway', -50, 100, 306, 120), road('s1', 'sidewalk', -50, 96, 306, 100)];
    const ring = [20, 10, 84, 240, 10, 84, 240, 10, 94, 20, 10, 94];
    const b: BuildingRecord = {
      layer: 'buildings',
      gmlId: 'b1',
      buildingId: null,
      lod: 2,
      measuredHeightM: 9,
      storeys: 3,
      storeysBelow: 0,
      usage: '411',
      surfaces: [{ kind: 'ground', ringsWF: [ring] }],
      source: 'plateau-shibuya',
    };
    const out = buildProps(input({ roads, osm: [], buildings: [b] }));
    const vm = instancesOf(out, 'vendingMachine');
    expect(vm.length).toBeGreaterThanOrEqual(2);
    for (const v of vm) {
      expect(v[2]).toBeCloseTo(94.48, 5);
      expect(Math.cos(v[3] as number)).toBeCloseTo(1, 5);
    }
    const office = buildProps(input({ roads, osm: [], buildings: [{ ...b, usage: '401' }] }));
    expect(instancesOf(office, 'vendingMachine')).toHaveLength(0);
  });

  it('keep clear of building corners and walls beside them (no gap narrower than the walker)', () => {
    const roads = [road('c', 'carriageway', -50, 100, 306, 120), road('s1', 'sidewalk', -50, 96, 306, 100)];
    const ring = [20, 10, 84, 240, 10, 84, 240, 10, 94, 20, 10, 94];
    const pillars = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220].map((x, i) => ({
      layer: 'buildings' as const,
      gmlId: `p${i}`,
      buildingId: null,
      lod: 2 as const,
      measuredHeightM: 3,
      storeys: 1,
      storeysBelow: 0,
      usage: '401',
      surfaces: [{ kind: 'ground' as const, ringsWF: [[x, 10, 94, x + 1, 10, 94, x + 1, 10, 95.5, x, 10, 95.5]] }],
      source: 'plateau-shibuya',
    }));
    const b: BuildingRecord = {
      ...pillars[0],
      gmlId: 'b1',
      usage: '411',
      surfaces: [{ kind: 'ground', ringsWF: [ring] }],
    } as BuildingRecord;
    const out = buildProps(input({ roads, osm: [], buildings: [b, ...pillars] }));
    expect(instancesOf(out, 'vendingMachine').length).toBeGreaterThan(0);
    for (const v of instancesOf(out, 'vendingMachine')) {
      expect(v[0] as number).toBeGreaterThanOrEqual(20 + 1.5 - 1e-3);
      expect(v[0] as number).toBeLessThanOrEqual(240 - 1.5 + 1e-3);
      for (const p of pillars) {
        const px = (p.surfaces[0]?.ringsWF[0]?.[0] as number) + 0.5;
        expect(Math.abs((v[0] as number) - px)).toBeGreaterThan(0.5 + 0.55 + 0.6 - 1e-3);
      }
    }
  });
});

describe('props.inst', () => {
  it('round-trips the placement output', () => {
    const roads = [road('c', 'carriageway', -100, 100, 612, 106)];
    const out = buildProps(
      input({ roads, osm: [osm('w1', 'line', [-80, 103, 600, 103], { highway: 'residential' })] }),
    );
    const r = parseProps(writeProps(out.batches));
    expect(r.ok && r.value).toEqual(out.batches);
  });
});

describe('signs (M05-T06)', () => {
  const roads = [road('c', 'carriageway', -50, 100, 306, 120), road('s1', 'sidewalk', -50, 96, 306, 100)];
  // 상업 건물(바닥 10 m, 높이 24 m) 길가 변 z = 94(바깥 = +Z), 평지붕 34 m.
  const ring = [20, 10, 64, 240, 10, 64, 240, 10, 94, 20, 10, 94];
  const roof = [20, 34, 64, 20, 34, 94, 240, 34, 94, 240, 34, 64];
  const shop: BuildingRecord = {
    layer: 'buildings',
    gmlId: 'shop',
    buildingId: null,
    lod: 2,
    measuredHeightM: 24,
    storeys: 7,
    storeysBelow: 0,
    usage: '402',
    surfaces: [
      { kind: 'ground', ringsWF: [ring] },
      { kind: 'roof', ringsWF: [roof] },
    ],
    source: 'plateau-shibuya',
  };

  it('stacks projecting boxes on street walls below the roof, stands A-frames against the wall, and tops some roofs', () => {
    const out = buildProps(input({ roads, osm: [], buildings: [shop] }));
    const proj = instancesOf(out, 'signProjecting');
    expect(proj.length).toBeGreaterThan(10);
    for (const p of proj) {
      expect(p[2]).toBeCloseTo(94.05, 5);
      expect(Math.cos(p[3] as number)).toBeCloseTo(1, 5);
      expect(p[1] as number).toBeGreaterThanOrEqual(13.6);
      expect((p[1] as number) + 2.2).toBeLessThanOrEqual(34 - 1 + 1e-6);
    }
    for (const s of instancesOf(out, 'signStanding')) expect(s[2]).toBeCloseTo(94.33, 5);
    expect(out.stats.signs.projecting).toBe(proj.length);
    const homes = buildProps(input({ roads, osm: [], buildings: [{ ...shop, usage: '411' }] }));
    expect(homes.stats.signs).toEqual({ projecting: 0, standing: 0, rooftop: 0 });
  });

  it('puts rooftop billboards on the roof height with width-encoded scale', () => {
    const always: PropCatalog = {
      ...CATALOG,
      types: { ...CATALOG.types, signRooftop: { place: { usage: ['402'], perFacadeM: 0, minHeightM: 14, p: 1 } } },
    };
    const r = instancesOf(buildProps(input({ roads, osm: [], buildings: [shop], catalog: always })), 'signRooftop');
    expect(r).toHaveLength(1);
    expect(r[0]?.[1]).toBeCloseTo(34, 5);
    expect(r[0]?.[4]).toBeCloseTo(1.4, 5);
  });
});
