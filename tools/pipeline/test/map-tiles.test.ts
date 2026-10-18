// M10-T03 지도 타일: 자르기(면·선)·단순화·방향, 타일러(줌별 포함·레이어·좌표 범위), PMTiles 왕복(디코드한 피처가 원래 레이어).
import { decodeMvt, readPmtiles, writePmtiles } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { clipLine, clipRing, orient, quantize, ringArea, simplifyLine } from '../src/stages/map/clip.ts';
import type { MapFeature } from '../src/stages/map/collect.ts';
import { buildTiles, EXTENT, lonLatToMerc } from '../src/stages/map/tiles.ts';

describe('map clip', () => {
  it('clips a polygon to the box and keeps orientation rules', () => {
    const r = clipRing([-10, -10, 50, -10, 50, 50, -10, 50], 0, 40);
    expect(r.length).toBe(8);
    expect(Math.abs(ringArea(r))).toBeCloseTo(1600, 6);
    expect(clipRing([100, 100, 110, 100, 110, 110], 0, 40)).toEqual([]);
    const cw = orient([0, 0, 0, 10, 10, 10, 10, 0], true);
    expect(ringArea(cw)).toBeGreaterThan(0);
    expect(ringArea(orient(cw, false))).toBeLessThan(0);
  });
  it('splits lines that leave and re-enter the box', () => {
    expect(clipLine([-5, 5, 5, 5, 15, 5, 15, 15, 5, 15], 0, 10)).toEqual([[0, 5, 5, 5, 10, 5]]);
    expect(clipLine([-5, 5, 15, 5, 15, 8, -5, 8], 0, 10)).toEqual([
      [0, 5, 10, 5],
      [10, 8, 0, 8],
    ]);
  });
  it('simplifies and quantizes', () => {
    expect(simplifyLine([0, 0, 5, 0.4, 10, 0], 1)).toEqual([0, 0, 10, 0]);
    expect(quantize([0.2, 0.2, 0.4, 0.4, 3.6, 1])).toEqual([0, 0, 4, 1]);
  });
});

describe('map tiler', () => {
  const sq = (x: number, z: number, s: number) => [x, z, x + s, z, x + s, z + s, x, z + s];
  const feats: MapFeature[] = [
    { layer: 'building', geom: 'polygon', parts: [sq(0, 0, 20)], props: {}, minZoom: 16, area: 400 },
    { layer: 'road', geom: 'line', parts: [[-300, 10, 300, 10]], props: { class: 'major' }, minZoom: 13 },
    {
      layer: 'station',
      geom: 'point',
      parts: [[5, 5]],
      props: { id: 'shibuya', name_ja: '渋谷', name_en: 'Shibuya', name_ko: '시부야' },
      minZoom: 13,
    },
  ];
  it('puts features only from their min zoom, inside the extent', async () => {
    const { tiles, stats } = buildTiles(feats);
    expect(stats.byZoom[13]).toBeGreaterThan(0);
    const z16 = tiles.filter((t) => t.z === 16).flatMap((t) => decodeMvt(t.data));
    expect(z16.some((l) => l.name === 'building')).toBe(true);
    const z13 = tiles.filter((t) => t.z === 13).flatMap((t) => decodeMvt(t.data));
    expect(z13.some((l) => l.name === 'building')).toBe(false);
    const st = z13.find((l) => l.name === 'station')?.features[0];
    expect(st?.properties.name_ko).toBe('시부야');
    const [x, y] = (st?.geometry[0] ?? [-1, 99999]) as [number, number];
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(EXTENT);
    const a = await readPmtiles(
      await writePmtiles(tiles, {
        header: {
          minZoom: 13,
          maxZoom: 16,
          bounds: { west: 0, south: 0, east: 1, north: 1 },
          center: { lon: 0, lat: 0, zoom: 15 },
        },
        metadata: {},
      }),
    );
    const t0 = tiles[0];
    expect(t0 && (await a.tile(t0.z, t0.x, t0.y))?.length).toBe(t0?.data.length);
  });
  it('mercator matches the textbook formula', () => {
    const [x, y] = lonLatToMerc(139.7, 35.66);
    expect(x).toBeCloseTo((139.7 + 180) / 360, 12);
    expect(y).toBeCloseTo(0.5 - Math.log(Math.tan(Math.PI / 4 + (35.66 * Math.PI) / 360)) / (2 * Math.PI), 9);
  });
});
