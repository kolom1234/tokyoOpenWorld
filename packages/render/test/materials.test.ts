// 머티리얼 라이브러리(M03-T01): 실패 경로·상태, 셀 시드 결정론·범위, 레지스트리 생성(텍스처 머티리얼 + HLOD).
import { createLogger, packCellKey } from '@sanpo/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMaterialLibrary, MATERIAL_GROUPS } from '../src/internal/materials/library.ts';
import { createMaterialRegistry, PRECOMPILE_IDS } from '../src/internal/materials/registry.ts';
import { cellSeedOf } from '../src/internal/scene/cell-node.ts';
import { createEnvUniforms } from '../src/internal/weather/wetness.ts';

const log = createLogger({ level: 'error' });

afterEach(() => vi.unstubAllGlobals());

describe('material library', () => {
  it('starts with placeholders and reports a failed manifest load without throwing away the averages', async () => {
    const lib = createMaterialLibrary('/basis/');
    expect(lib.stats()).toMatchObject({ state: 'none', layers: 0, gpuBytes: 0 });
    vi.stubGlobal('fetch', async () => new Response('nope', { status: 404 }));
    await expect(lib.load('/w/shared/materials/manifest.json', {} as never, log)).rejects.toThrow(/HTTP 404/);
    expect(lib.stats().state).toBe('failed');
    lib.dispose();
  });

  it('rejects manifests with too many layers', async () => {
    const lib = createMaterialLibrary('/basis/');
    vi.stubGlobal('fetch', async () =>
      Response.json({ schema: 1, layerCount: 65, layers: [], groups: {}, textures: {} }),
    );
    await expect(lib.load('/m.json', {} as never, log)).rejects.toThrow(/layers 65/);
    lib.dispose();
  });

  it('knows the pipeline groups (content/materials/library.json)', () => {
    expect(MATERIAL_GROUPS).toContain('asphalt');
    expect(new Set(MATERIAL_GROUPS).size).toBe(MATERIAL_GROUPS.length);
  });
});

describe('registry', () => {
  it('builds textured cell materials and flat HLOD variants for every precompiled id', () => {
    const lib = createMaterialLibrary('/basis/');
    const r = createMaterialRegistry(lib, createEnvUniforms());
    expect(PRECOMPILE_IDS).toEqual(['terrain_ground', 'facade_default', 'road_marking', 'power_wire']);
    for (const id of PRECOMPILE_IDS) {
      expect(r.get(id).name).toBe(id);
      expect(r.getHlod(id).name).toBe(`hlod:${id}`);
      expect(r.get(id)).toBe(r.get(id));
    }
    expect(r.all()).toHaveLength(8); // 셀 4 + HLOD 4
    r.dispose();
    lib.dispose();
  });
});

describe('cellSeedOf', () => {
  it('is deterministic, within 0..4095 and differs between neighbours', () => {
    const seeds = new Set<number>();
    for (let ix = -8; ix < 8; ix++) {
      for (let iz = -8; iz < 8; iz++) {
        const s = cellSeedOf(packCellKey(0, ix, iz));
        expect(s).toBe(cellSeedOf(packCellKey(0, ix, iz)));
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThan(4096);
        seeds.add(s);
      }
    }
    expect(seeds.size).toBeGreaterThan(200);
  });
});
