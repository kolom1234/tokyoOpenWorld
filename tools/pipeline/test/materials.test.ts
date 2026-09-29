// 머티리얼 라이브러리 정의(content/materials/library.json)·lock·그룹·캐시 해시·manifest 검사(M03-T01).
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { groupsOf, parseLibrary, readLibrary, zipNameOf } from '../src/stages/materials/library.ts';
import { materialsHash } from '../src/stages/materials/run.ts';
import { checkMaterials } from '../src/stages/validate-materials.ts';

const ROOT = join(import.meta.dirname, '../../..');
const LIB = join(ROOT, 'content/materials/library.json');
/** render MATERIAL_GROUPS(packages/render/src/internal/materials/library.ts)와 같은 목록 — 셰이더가 이름으로 찾는다. */
const RENDER_GROUPS = [
  'asphalt',
  'sidewalk',
  'concrete',
  'tile',
  'metal',
  'plaster',
  'siding',
  'alc',
  'brick',
  'roof',
  'grass',
  'soil',
  'gravel',
];

describe('library.json', () => {
  const lib = readLibrary(LIB);
  it('covers every render group and pins every asset zip in sources.lock', () => {
    const groups = groupsOf(lib.layers);
    expect(Object.keys(groups).sort()).toEqual([...RENDER_GROUPS].sort());
    const lock = JSON.parse(readFileSync(join(ROOT, 'data/sources.lock.json'), 'utf8')) as {
      sources: { id: string; sha256: unknown; license: string }[];
    };
    const acg = lock.sources.find((s) => s.id === 'ambientcg');
    expect(acg?.license).toBe('CC0-1.0');
    const pinned = acg?.sha256 as Record<string, string>;
    for (const l of lib.layers) expect(pinned[zipNameOf(l.asset)]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records attribution for every asset', () => {
    const attr = JSON.parse(readFileSync(join(ROOT, 'content/ATTRIBUTION.json'), 'utf8')) as {
      entries: { id: string; license: string; url?: string }[];
    };
    for (const a of new Set(lib.layers.map((l) => l.asset))) {
      const e = attr.entries.find((x) => x.id === `ambientcg-${a}`);
      expect(e?.license, a).toBe('CC0-1.0');
      expect(e?.url).toBe(`https://ambientcg.com/view?id=${a}`);
    }
  });

  it('rejects bad definitions and hashes deterministically', () => {
    const base = {
      schema: 1,
      size: 1024,
      detailSize: 512,
      layers: [{ id: 'a', group: 'tile', asset: 'Tiles1', tileM: 1 }],
    };
    expect(() => parseLibrary(JSON.stringify({ ...base, size: 1000 }))).toThrow(/power of two/);
    expect(() => parseLibrary(JSON.stringify({ ...base, layers: [...base.layers, ...base.layers] }))).toThrow(
      /duplicate/,
    );
    expect(() => parseLibrary(JSON.stringify({ ...base, layers: [{ ...base.layers[0], tileM: 0 }] }))).toThrow(/tileM/);
    const l = parseLibrary(JSON.stringify(base));
    expect(materialsHash(l, 'toktx v4.4.2')).toBe(materialsHash(l, 'toktx v4.4.2'));
    expect(materialsHash(l, 'toktx v4.4.2')).not.toBe(materialsHash(l, 'toktx v4.4.3'));
    expect(groupsOf([{ group: 'a' }, { group: 'b' }, { group: 'a' }])).toEqual({ a: [0, 2], b: [1] });
  });
});

describe('checkMaterials', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  const schema = ajv.compile(JSON.parse(readFileSync(join(ROOT, 'schemas/materials.schema.json'), 'utf8')));
  const ktx = Uint8Array.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const make = (patch: (m: Record<string, unknown>) => void = () => {}): string => {
    const dir = mkdtempSync(join(tmpdir(), 'mat-'));
    const mdir = join(dir, 'shared/materials');
    mkdirSync(mdir, { recursive: true });
    const tex = (file: string, size: number) => ({
      file,
      bytes: ktx.length,
      size,
      encode: 'uastc',
      colorSpace: 'linear',
    });
    const m: Record<string, unknown> = {
      schema: 1,
      layerCount: 1,
      textures: {
        albedo: { ...tex('albedo.ktx2', 1024), encode: 'etc1s', colorSpace: 'srgb' },
        normal: tex('normal.ktx2', 512),
        orm: tex('orm.ktx2', 512),
      },
      layers: [
        {
          id: 'a',
          group: 'tile',
          index: 0,
          tileM: 1,
          avgColor: [0.5, 0.5, 0.5],
          avgOrm: [1, 0.8, 0],
          source: 'ambientcg:Tiles1',
        },
      ],
      groups: { tile: [0] },
      hash: '0123456789abcdef',
    };
    patch(m);
    for (const f of ['albedo', 'normal', 'orm']) writeFileSync(join(mdir, `${f}.ktx2`), ktx);
    writeFileSync(join(mdir, 'manifest.json'), JSON.stringify(m));
    return dir;
  };
  it('accepts a consistent manifest and skips builds without materials', () => {
    const errors: string[] = [];
    expect(checkMaterials(make(), schema, errors)).toEqual({ layers: 1, bytes: 3 * ktx.length });
    expect(errors).toEqual([]);
    expect(checkMaterials(mkdtempSync(join(tmpdir(), 'none-')), schema, errors)).toBeNull();
  });
  it('reports schema, size and group mismatches', () => {
    const e1: string[] = [];
    checkMaterials(
      make((m) => {
        m.groups = { tile: [1] };
      }),
      schema,
      e1,
    );
    expect(e1.join()).toMatch(/not in group/);
    const e2: string[] = [];
    checkMaterials(
      make((m) => {
        (m.textures as { orm: { bytes: number } }).orm.bytes = 99;
      }),
      schema,
      e2,
    );
    expect(e2.join()).toMatch(/orm.ktx2 12 B ≠ manifest 99/);
    const e3: string[] = [];
    checkMaterials(
      make((m) => {
        m.schema = 2;
      }),
      schema,
      e3,
    );
    expect(e3.join()).toMatch(/materials manifest/);
  });
});
