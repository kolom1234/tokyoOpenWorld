// 원경 지면 분류(M12-T04): OSM 태그 분류, 칠하는 순서(도로 > 선로 > 물 > 녹지), 해면, 16 m 비율 텍스처, 멀티폴리곤.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../src/lib/png.ts';
import type { FarDem } from '../src/stages/hlod/dem-far.ts';
import {
  classifyOsm,
  createLcGrid,
  featuresOf,
  LC,
  paintFeatures,
  paintSea,
  toWeights,
  writeLandcover,
} from '../src/stages/hlod/landcover.ts';

const log = createLogger({ level: 'error' });
const square = (x0: number, z0: number, s: number): number[] => [x0, z0, x0 + s, z0, x0 + s, z0 + s, x0, z0 + s];

describe('landcover classes', () => {
  it('maps OSM tags to classes and skips tunnels', () => {
    expect(classifyOsm({ leisure: 'park' }, 'polygon')).toBe(LC.green);
    expect(classifyOsm({ natural: 'water' }, 'polygon')).toBe(LC.water);
    expect(classifyOsm({ waterway: 'riverbank' }, 'polygon')).toBe(LC.water);
    expect(classifyOsm({ landuse: 'railway' }, 'polygon')).toBe(LC.rail);
    expect(classifyOsm({ highway: 'primary' }, 'line')).toBe(LC.road);
    expect(classifyOsm({ railway: 'rail' }, 'line')).toBe(LC.rail);
    expect(classifyOsm({ highway: 'primary', tunnel: 'yes' }, 'line')).toBeUndefined();
    expect(classifyOsm({ railway: 'rail', location: 'underground' }, 'line')).toBeUndefined();
    expect(classifyOsm({ highway: 'footway' }, 'line')).toBeUndefined();
  });

  it('keeps every polygon of a multipolygon', () => {
    const lonlat = [
      [
        [139.7, 35.66],
        [139.701, 35.66],
        [139.701, 35.661],
        [139.7, 35.66],
      ],
    ];
    const f = featuresOf({ type: 'MultiPolygon', coordinates: [lonlat, lonlat] }, { leisure: 'park' });
    expect(f).toHaveLength(2);
    expect(f[0]?.cls).toBe(LC.green);
  });
});

describe('landcover raster', () => {
  const extent = { minX: 0, maxX: 256, minZ: 0, maxZ: 256 };

  it('paints green → water → rail → road (later wins) and sea from the far DEM', () => {
    const g = createLcGrid(extent);
    expect([g.width, g.height]).toEqual([32, 32]);
    const dem: FarDem = { x0: 0, z0: 0, step: 8, width: 33, height: 33, values: new Float32Array(33 * 33).fill(5) };
    for (let r = 0; r < 33; r++) for (let c = 0; c < 4; c++) dem.values[r * 33 + c] = 0; // 서쪽 0–24 m = 해면
    paintSea(g, dem);
    paintFeatures(g, [
      { geom: 'line', rings: [[0, 128, 256, 128]], cls: LC.road, halfM: 8 },
      { geom: 'polygon', rings: [square(64, 64, 128)], cls: LC.green },
      { geom: 'polygon', rings: [square(96, 96, 32)], cls: LC.water },
    ]);
    const at = (x: number, z: number) => g.cls[Math.floor(z / 8) * g.width + Math.floor(x / 8)];
    expect(at(4, 30)).toBe(LC.water); // 해면
    expect(at(100, 80)).toBe(LC.green);
    expect(at(110, 110)).toBe(LC.water); // 녹지 위 연못
    expect(at(150, 128)).toBe(LC.road); // 공원을 가로지르는 도로가 이긴다
    expect(at(230, 30)).toBe(LC.urban);
  });

  it('averages 2×2 classes into 16 m RGBA weights and writes a lossless PNG', () => {
    const g = createLcGrid(extent);
    g.cls[0] = LC.water;
    g.cls[1] = LC.green;
    g.cls[g.width] = LC.road;
    const w = toWeights(g);
    expect([w.width, w.height]).toEqual([16, 16]);
    expect([...w.rgba.subarray(0, 4)]).toEqual([64, 64, 64, 0]);
    const dir = mkdtempSync(join(tmpdir(), 'lc-'));
    try {
      const meta = writeLandcover(dir, g, ['osm-kanto'], log);
      expect(meta).toMatchObject({ step: 16, width: 16, height: 16, x0: 0, z0: 0 });
      const png = decodePng(readFileSync(join(dir, meta.file)));
      expect(png.channels).toBe(4);
      expect([...png.data]).toEqual([...w.rgba]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
