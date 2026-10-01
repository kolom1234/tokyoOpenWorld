// M05-T05 랜드마크 오버라이드: 높이 띠 자르기, 셸 = PLATEAU 면 그대로(오차 0)·renderSkip, 벽 화면(평행·0.5 m 안), 도리이·동상 치수, 명세 검사.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBuildings } from '../src/stages/build/buildings-mesh.ts';
import { figureDog, figureTorii } from '../src/stages/build/overrides/figures.ts';
import { LStream } from '../src/stages/build/overrides/geom.ts';
import { LMAT, overrideCell, overrideSetOf, readOverrides } from '../src/stages/build/overrides/index.ts';
import { clipRingY } from '../src/stages/build/overrides/shell.ts';
import type { LandmarkSpec } from '../src/stages/build/overrides/spec.ts';
import { boxBuilding } from './build-fixtures.ts';

const REPO = join(import.meta.dirname, '../../..');
const flatGround = () => 10;

const spec = (over: Partial<LandmarkSpec>): LandmarkSpec => ({
  id: 'test',
  order: 1,
  name: { ja: 't', en: 't' },
  replace: [],
  shell: [],
  parts: [],
  reference: [],
  ...over,
});

const yRange = (s: { pos: number[] }) => {
  const ys = s.pos.filter((_, i) => i % 3 === 1);
  return [Math.min(...ys), Math.max(...ys)];
};

describe('clipRingY', () => {
  it('cuts a wall quad into the requested height band', () => {
    const wall = [0, 0, 0, 10, 0, 0, 10, 30, 0, 0, 30, 0];
    const mid = clipRingY(wall, 12, 20) as number[];
    expect(Math.min(...mid.filter((_, i) => i % 3 === 1))).toBe(12);
    expect(Math.max(...mid.filter((_, i) => i % 3 === 1))).toBe(20);
    expect(clipRingY(wall, 40, 50)).toBeNull();
  });
});

describe('overrideCell', () => {
  const b = boxBuilding('bldg_a', 20, 30, 40, 50, 10, 100);
  const set = overrideSetOf([
    spec({
      replace: ['bldg_a'],
      shell: [
        {
          gml: 'bldg_a',
          cuts: [12],
          rules: [
            { kinds: ['wall'], y: [0, 12], mat: 'clear_glass' },
            { kinds: ['wall'], mat: 'fin_curtain' },
            { mat: 'deck' },
          ],
        },
      ],
      parts: [
        { type: 'screen', gml: 'bldg_a', from: [25, 80.2], to: [45, 79.9], span: [20, 32], seed: 3, mat: 'screen' },
      ],
    }),
  ]);

  it('re-emits the PLATEAU shell with banded materials and skips it in buildings.mesh', async () => {
    const o = await overrideCell(set, [b], [0, 0, 0], flatGround);
    expect([...o.renderSkip]).toEqual(['bldg_a']);
    expect(o.glb).not.toBeNull();
    expect(o.checks).toHaveLength(1);
    // 화면(금속 함 0.3 m + 화면 면 5 mm)만큼 경계가 커진다 — 허용 0.5 m 안.
    expect(o.checks[0]?.dxz).toBeCloseTo(0.305, 5);
    expect(o.checks[0]?.dy).toBe(0);
    const bld = await buildBuildings([b], [0, 0, 0], o.renderSkip);
    expect(bld.glb).toBeNull();
    expect(bld.collision.idx.length).toBeGreaterThan(0);
    expect(bld.meta.map((m) => m.gmlId)).toEqual(['bldg_a']);
  });

  it('places wall screens parallel to the nearest wall, facing outward', async () => {
    const o = await overrideCell(set, [b], [0, 0, 0], flatGround);
    expect(o.tris).toBeGreaterThan(12 + 10);
    expect(o.landmarks).toEqual(['test']);
  });

  it('fails the build when a part breaks the height tolerance', async () => {
    const tall = overrideSetOf([
      spec({
        replace: ['bldg_a'],
        parts: [
          { type: 'screen', gml: 'bldg_a', from: [25, 80], to: [45, 80], span: [90, 103], seed: 0, mat: 'screen' },
        ],
      }),
    ]);
    await expect(overrideCell(tall, [b], [0, 0, 0], flatGround)).rejects.toThrow(/tolerance/);
  });

  it('checks screens on buildings that are not replaced against their PLATEAU bounds', async () => {
    const vision = overrideSetOf([
      spec({
        id: 'vision',
        parts: [
          { type: 'screen', gml: 'bldg_a', from: [25, 80], to: [45, 80], span: [20, 32], seed: 1, mat: 'screen' },
        ],
      }),
    ]);
    const o = await overrideCell(vision, [b], [0, 0, 0], flatGround);
    expect(o.renderSkip.size).toBe(0);
    expect(o.checks).toEqual([{ landmark: 'vision', gml: 'bldg_a', dxz: expect.closeTo(0.305, 5), dy: 0 }]);
  });

  it('hangs a tent roof over an LOD1 footprint and checks it against measuredHeight', async () => {
    const gym = { ...boxBuilding('bldg_gym', 20, 30, 120, 60, 10, 17), lod: 1 as const, measuredHeightM: 30 };
    const tent = (mast: number) =>
      overrideSetOf([
        spec({
          replace: ['bldg_gym'],
          shell: [{ gml: 'bldg_gym', skip: true, rules: [] }],
          parts: [
            {
              type: 'tent',
              gml: 'bldg_gym',
              spine: [40, 60, 120, 60],
              eave: 6,
              ridge: 29,
              sag: 4,
              mast,
              mastD: 3,
              mat: 'steel_dark',
            },
          ],
        }),
      ]);
    const ok = await overrideCell(tent(30.4), [gym], [0, 0, 0], flatGround);
    expect(ok.renderSkip.has('bldg_gym')).toBe(true);
    expect(ok.checks[0]?.dy).toBeCloseTo(0.4, 5);
    expect(ok.checks[0]?.dxz).toBeLessThan(0.5);
    await expect(overrideCell(tent(32), [gym], [0, 0, 0], flatGround)).rejects.toThrow(/tolerance/);
  });

  it('emits free parts in the cell that owns their anchor', async () => {
    const mast = overrideSetOf([
      spec({ id: 'mast', parts: [{ type: 'cyl', at: [30, 40], r: 1, h: 5, mat: 'steel_dark', collide: true }] }),
    ]);
    const here = await overrideCell(mast, [], [0, 0, 0], flatGround);
    const there = await overrideCell(mast, [], [256, 0, 0], flatGround);
    expect(here.landmarks).toEqual(['mast']);
    expect(here.collider.idx.length).toBeGreaterThan(0);
    expect(yRange(here.collider)).toEqual([10, 15]);
    expect(there.glb).toBeNull();
  });
});

describe('figures', () => {
  it('builds a myojin torii with the given height, span and kasagi length', () => {
    const s = new LStream();
    const torii = {
      type: 'torii',
      a: [-8.5, 0],
      b: [8.5, 0],
      height: 12,
      span: 9.1,
      pillarD: 1.2,
      mat: 'wood',
    } as const;
    figureTorii(s, [0, 0, 0], { ...torii, a: [...torii.a], b: [...torii.b] }, LMAT.wood);
    const [y0, y1] = yRange(s);
    expect(y0).toBe(0);
    expect(y1).toBeGreaterThan(11.6);
    expect(y1).toBeLessThan(12.4);
    const xs = s.pos.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(17, 0);
  });

  it('seats the dog on a granite pedestal at the requested height', () => {
    const s = new LStream();
    figureDog(s, [0, 0, 0], 0, 0.95, LMAT.bronze);
    const [, y1] = yRange(s);
    expect(y1).toBeGreaterThan(1.47 + 0.8);
    expect(y1).toBeLessThan(1.47 + 1.05);
    expect(new Set(s.mat)).toEqual(new Set([LMAT.stone, LMAT.bronze]));
  });
});

describe('content/overrides', () => {
  it('loads landmark specs in list order with unique replaced buildings', () => {
    const set = readOverrides(REPO);
    expect(set.landmarks.length).toBeGreaterThan(0);
    expect(set.landmarks.map((l) => l.order)).toEqual([...set.landmarks.map((l) => l.order)].sort((a, b) => a - b));
    for (const lm of set.landmarks) expect(lm.reference.length).toBeGreaterThan(0);
  });

  it('rejects a building replaced by two landmarks', () => {
    expect(() =>
      overrideSetOf([spec({ id: 'a', replace: ['x'] }), spec({ id: 'b', order: 2, replace: ['x'] })]),
    ).toThrow(/replaced twice/);
  });
});
