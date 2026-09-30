// 셀 빌드(건물·조립·검증): buildings.mesh 속성·양자화 오차·외향 법선, 영역 빌드 → validate 무오류, 2회 빌드 바이트 동일. see docs/04-data-pipeline.md §4.4, §4.6
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLogger, packCellKey } from '@sanpo/core';
import { gunzip, readTkc } from '@sanpo/tile-format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeGlb } from '../src/lib/gltf.ts';
import { writeNdjsonGz } from '../src/lib/ndjson-gz.ts';
import { buildArea } from '../src/stages/build/assemble.ts';
import { buildBuildings } from '../src/stages/build/buildings-mesh.ts';
import { validateBuild } from '../src/stages/validate.ts';
import { boxBuilding, syntheticDem } from './build-fixtures.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const BUILD_ID = '20260928-abcdef0-12345678';
const AREA = { id: 'test-area', l0: { minIx: -1, maxIx: 0, minIz: -1, maxIz: 0 } };
const CELLS = [packCellKey(0, -1, -1), packCellKey(0, 0, -1), packCellKey(0, -1, 0), packCellKey(0, 0, 0)];
const log = createLogger({ level: 'warn' }).child('test');

describe('buildings.mesh', () => {
  it('writes _BLDG/_FACADE/UV, dequantizes within 5 mm, keeps outward normals, sorts meta by gmlId', async () => {
    const recs = [boxBuilding('b-2', 10, 20, 30, 15, 35, 60), boxBuilding('b-1', 100, 50, 12, 12, 36, 9.8)];
    const r = await buildBuildings(recs, [0, 0, 0]);
    expect(r.meta.map((m) => m.gmlId)).toEqual(['b-1', 'b-2']);
    expect(r.meta[0]).toEqual({ gmlId: 'b-1', usage: '401', height: 9.8 });
    expect(r.tris).toBe(2 * 5 * 2); // 건물 2 × (벽 4 + 지붕 1) × 삼각형 2, ground 제외
    const d = await decodeGlb(r.glb as Uint8Array);
    const p = d.primitives[0];
    expect(p?.materialId).toBe('facade_default');
    expect(Object.keys(p?.attributes ?? {}).sort()).toEqual([
      'NORMAL',
      'POSITION',
      'TEXCOORD_0',
      'TEXCOORD_1',
      '_BLDG',
      '_FACADE',
    ]);
    const uv = p?.attributes.TEXCOORD_0?.array as Float32Array;
    const uv1 = p?.attributes.TEXCOORD_1?.array as Float32Array;
    const q = p?.attributes.POSITION?.array as Uint16Array;
    const bl = p?.attributes._BLDG?.array as Uint16Array;
    const fac = p?.attributes._FACADE?.array as Uint8Array;
    const nrm = p?.attributes.NORMAL?.array as Int8Array;
    type Box = [bx: number, bz: number, w: number, d: number, y0: number, h: number];
    const boxes: Box[] = [
      [100, 50, 12, 12, 36, 9.8],
      [10, 20, 30, 15, 35, 60],
    ];
    const at = (a: ArrayLike<number>, i: number): number => a[i] ?? Number.NaN;
    for (let v = 0; v < bl.length; v++) {
      const pt = [0, 1, 2].map((k) => at(q, v * 3 + k) * at(d.scale, k) + at(d.translation, k));
      const [bx, bz, w, dd, y0, h] = boxes[at(bl, v)] as Box;
      const lo = [bx, y0, bz];
      const hi = [bx + w, y0 + h, bz + dd];
      for (let k = 0; k < 3; k++) {
        expect(at(pt, k)).toBeGreaterThan(at(lo, k) - 0.005);
        expect(at(pt, k)).toBeLessThan(at(hi, k) + 0.005);
      }
      expect(at(fac, v * 4 + 1)).toBe(Math.round(h / 3.5)); // floors
      expect(at(fac, v * 4)).toBe(0); // usage 401 → office
      // 벽: v = 건물 바닥부터 높이(0..h), u = 면 시작점부터(0..면 폭), TEXCOORD_1 = (면 폭, 높이).
      expect(at(uv1, v * 2 + 1)).toBeCloseTo(h, 3);
      if (Math.abs(at(nrm, v * 3 + 1)) < 64) {
        expect(at(uv, v * 2 + 1)).toBeGreaterThan(-0.01);
        expect(at(uv, v * 2 + 1)).toBeLessThan(h + 0.01);
        expect(at(uv, v * 2)).toBeGreaterThan(-0.01);
        expect(at(uv, v * 2)).toBeLessThan(at(uv1, v * 2) + 0.01);
        expect([w, dd].some((len) => Math.abs(at(uv1, v * 2) - len) < 1e-3)).toBe(true);
      }
      // 외향: 법선이 박스 중심에서 멀어지는 방향.
      const dot = [0, 1, 2].reduce((a, k) => a + (at(pt, k) - (at(lo, k) + at(hi, k)) / 2) * at(nrm, v * 3 + k), 0);
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('returns no glb for a cell without buildings', async () => {
    const r = await buildBuildings([], [0, 0, 0]);
    expect(r.glb).toBeNull();
    expect(r.meta).toEqual([]);
  });
});

describe('area build + validate', () => {
  let root: string;
  const dem = syntheticDem({ minX: -256, minZ: -256, maxX: 256, maxZ: 256 }, 1);
  const outDir = (n: string): string => join(root, n, BUILD_ID);
  const build = (n: string) =>
    buildArea({
      area: AREA,
      cells: CELLS,
      buildId: BUILD_ID,
      normalizedDir: join(root, 'normalized'),
      outDir: outDir(n),
      plateauSources: ['plateau-shibuya'],
      log,
      dem,
    });

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'sanpo-build-'));
    const rec = (id: string, x: number, z: number) =>
      JSON.stringify({ ...boxBuilding(id, x, z, 20, 20, 36, 40), source: 'plateau-shibuya' });
    writeNdjsonGz(join(root, 'normalized/buildings/L0_0_0.ndjson.gz'), [rec('a', 40, 40), rec('b', 240, 100)]);
    writeNdjsonGz(join(root, 'normalized/buildings/L0_-1_-1.ndjson.gz'), [rec('c', -100, -100)]);
    await build('a');
    await build('b');
  }, 120_000); // 셀 8개 빌드(지형 성형 거리 탐색 포함 — 병렬 vitest에서 10 s 넘음)
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('passes validate (schemas, hashes, budgets, seams)', async () => {
    const r = await validateBuild(outDir('a'), join(REPO, 'schemas'), new Set(['gsi-dem', 'plateau-shibuya']));
    expect(r.errors).toEqual([]);
    expect(r.cells.map((c) => c.id)).toEqual(['L0_-1_-1', 'L0_0_-1', 'L0_-1_0', 'L0_0_0']);
    expect(r.seams).toEqual({ pairs: 4, heightSamples: 4 * 257, meshVertices: 4 * 257 });
    expect(r.cells.find((c) => c.id === 'L0_0_0')?.buildings).toBe(2);
    expect(r.cells.find((c) => c.id === 'L0_0_-1')?.sections['buildings.mesh']).toBeUndefined();
  });

  it('reports schema and lock violations', async () => {
    const r = await validateBuild(outDir('a'), join(REPO, 'schemas'), new Set(['gsi-dem']));
    expect(r.errors.some((e) => e.includes('plateau-shibuya not in lock'))).toBe(true);
  });

  it('writes byte-identical output on a second build', () => {
    const files = (d: string): string[] =>
      readdirSync(d, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => join(e.parentPath, e.name).slice(d.length))
        .sort();
    const fa = files(outDir('a'));
    expect(fa).toEqual(files(outDir('b')));
    expect(fa.length).toBe(4 + 2);
    for (const f of fa)
      expect(readFileSync(join(outDir('b'), f)).equals(readFileSync(join(outDir('a'), f)))).toBe(true);
  });

  it('stores meta.json with the schema key order', async () => {
    const tkc = readTkc(new Uint8Array(readFileSync(join(outDir('a'), 'L0/0/0.tkc'))));
    if (!tkc.ok) throw new Error(tkc.error.message);
    const raw = await gunzip(tkc.value.section('meta.json') as Uint8Array);
    const text = raw.ok ? new TextDecoder().decode(raw.value) : '';
    expect(text.startsWith('{"buildings":[{"gmlId":"a","usage":"401","height":40}')).toBe(true);
    expect(tkc.value.header.materials).toEqual(['facade_default', 'terrain_ground']);
  });
});
