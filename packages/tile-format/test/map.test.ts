// M10-T03 지도 형식: MVT 인코드·디코드 왕복(점·선·면·속성), PMTiles 쓰기 → 우리 리더·공식 pmtiles 리더 모두 같은 타일, 힐버트 id = 공식 구현, 잎 디렉터리.
import { PMTiles, zxyToTileId as refTileId } from 'pmtiles';
import { describe, expect, it } from 'vitest';
import { decodeMvt, encodeMvt, readPmtiles, writePmtiles, zxyToTileId } from '../src/index.ts';

const layer = {
  name: 'road',
  extent: 4096,
  features: [
    { type: 2 as const, geometry: [[0, 0, 100, 50, 300, -20]], properties: { class: 'major', w: 2.5, oneway: true } },
    { type: 3 as const, geometry: [[10, 10, 50, 10, 50, 50, 10, 50]], properties: { class: 'park' } },
    {
      type: 1 as const,
      geometry: [
        [2048, 1024],
        [10, 20],
      ],
      properties: { name: '渋谷', rank: -3 },
      id: 7,
    },
  ],
};

describe('mvt', () => {
  it('round-trips geometry, properties and ids', () => {
    const [l] = decodeMvt(encodeMvt([layer]));
    expect(l?.name).toBe('road');
    expect(l?.extent).toBe(4096);
    expect(l?.features[0]).toEqual(layer.features[0]);
    expect(l?.features[1]).toEqual(layer.features[1]);
    expect(l?.features[2]?.geometry).toEqual([[2048, 1024, 10, 20]]);
    expect(l?.features[2]?.properties).toEqual({ name: '渋谷', rank: -3 });
    expect(l?.features[2]?.id).toBe(7);
  });
  it('skips empty layers and degenerate parts', () => {
    expect(decodeMvt(encodeMvt([{ name: 'x', extent: 4096, features: [] }]))).toEqual([]);
    const [l] = decodeMvt(
      encodeMvt([
        {
          name: 'y',
          extent: 4096,
          features: [
            {
              type: 2,
              geometry: [
                [1, 1],
                [0, 0, 5, 5],
              ],
              properties: {},
            },
          ],
        },
      ]),
    );
    expect(l?.features[0]?.geometry).toEqual([[0, 0, 5, 5]]);
  });
});

function tilesAt(z: number, n: number) {
  const out = [];
  for (let x = 0; x < n; x++)
    for (let y = 0; y < n; y++) out.push({ z, x, y, data: encodeMvt([{ ...layer, name: `t${z}-${x}-${y}` }]) });
  return out;
}

const meta = {
  header: {
    minZoom: 13,
    maxZoom: 16,
    bounds: { west: 139.68, south: 35.64, east: 139.72, north: 35.7 },
    center: { lon: 139.7, lat: 35.66, zoom: 15 },
  },
  metadata: { name: 'test', vector_layers: [{ id: 'road' }] },
};

describe('pmtiles', () => {
  it('hilbert tile ids match the reference implementation', () => {
    for (const [z, x, y] of [
      [0, 0, 0],
      [1, 1, 0],
      [5, 17, 9],
      [16, 58210, 25808],
      [17, 116420, 51617],
    ] as const)
      expect(zxyToTileId(z, x, y)).toBe(refTileId(z, x, y));
  });
  it('writes an archive both our reader and the official reader decode', async () => {
    const tiles = [...tilesAt(15, 3), ...tilesAt(16, 4)];
    const bytes = await writePmtiles(tiles, meta);
    const a = await readPmtiles(bytes);
    expect(a.header).toMatchObject({
      minZoom: 13,
      maxZoom: 16,
      tileType: 'mvt',
      tileCompression: 'gzip',
      tiles: tiles.length,
    });
    expect(a.header.center.lon).toBeCloseTo(139.7, 6);
    expect(a.metadata.name).toBe('test');
    const mine = await a.tile(16, 2, 3);
    expect(decodeMvt(mine as Uint8Array)[0]?.name).toBe('t16-2-3');
    expect(await a.tile(16, 9, 9)).toBeUndefined();
    const src = {
      getKey: () => 'mem',
      getBytes: async (o: number, l: number) => ({ data: bytes.slice(o, o + l).buffer }),
    };
    const ref = new PMTiles(src);
    const h = await ref.getHeader();
    expect(h.numAddressedTiles).toBe(tiles.length);
    const t = await ref.getZxy(15, 1, 2);
    expect(decodeMvt(new Uint8Array(t?.data as ArrayBuffer))[0]?.name).toBe('t15-1-2');
  });
  it('spills large directories into leaf directories', async () => {
    const tiles = [];
    for (let i = 0; i < 9000; i++)
      tiles.push({ z: 17, x: 116000 + (i % 100), y: 51000 + Math.floor(i / 100), data: new Uint8Array([i & 255]) });
    const a = await readPmtiles(await writePmtiles(tiles, meta));
    expect(Array.from((await a.tile(17, 116042, 51077)) ?? [])).toEqual([(77 * 100 + 42) & 255]);
  });
});
