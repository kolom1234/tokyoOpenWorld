// 셀 빌드(지형): 이웃 셀 경계 높이 완전 일치(terrain.height u16·terrain.mesh 정점), 단순화, 결정론. see docs/04-data-pipeline.md §6
import { gunzip, parseHeightfield } from '@sanpo/tile-format';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeGlb } from '../src/lib/gltf.ts';
import type { RoadRecord } from '../src/readers/plateau/types.ts';
import { CELL_SIZE_M, type CellWindow, cellWindow, type DemWindow } from '../src/stages/build/dem-window.ts';
import { cellHeightfield, encodeTerrainHeight } from '../src/stages/build/heightfield.ts';
import { SURF, surfaceGrid } from '../src/stages/build/surface-class.ts';
import {
  buildTerrainGeometry,
  encodeTerrainMesh,
  TERRAIN_SIMPLIFY_ERROR_M,
  type TerrainGeometry,
} from '../src/stages/build/terrain-mesh.ts';
import { rtinTriangulate } from '../src/stages/build/terrain-rtin.ts';
import { edgeVertices } from '../src/stages/validate-seams.ts';
import { syntheticDem } from './build-fixtures.ts';

// 2×2 셀(L0_-1_-1 … L0_0_0) + 여유 1 m.
const DEM: DemWindow = syntheticDem({ minX: -256, minZ: -256, maxX: 256, maxZ: 256 }, 1);
const CELLS = { nw: [-1, -1], ne: [0, -1], sw: [-1, 0] } as const;

/** 셀 경계(x = 0)를 가로지르는 차도 + 북쪽 보도(전체 폴리곤을 모든 셀에 준다 = 이웃 조각 포함과 같다). */
const road = (id: string, fn: RoadRecord['function'], x0: number, z0: number, x1: number, z1: number): RoadRecord => ({
  layer: 'roads',
  id,
  roadId: 'r',
  lod: 2,
  function: fn,
  functionCode: '',
  polygonWF: [[x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1]],
  source: 'test',
});
const ROADS = [
  road('c', 'carriageway', -40.5, -120.5, 60.5, -100.2),
  road('s', 'sidewalk', -40.5, -103.7, 60.5, -99.4),
];
const surfOf = (ix: number, iz: number): Uint8Array => surfaceGrid(ROADS, ix * CELL_SIZE_M, iz * CELL_SIZE_M);

const windows = {} as Record<keyof typeof CELLS, CellWindow>;
const geoms = {} as Record<keyof typeof CELLS, TerrainGeometry>;
const glbs = {} as Record<keyof typeof CELLS, Uint8Array>;
beforeAll(async () => {
  for (const [k, [ix, iz]] of Object.entries(CELLS) as [keyof typeof CELLS, readonly [number, number]][]) {
    windows[k] = cellWindow(DEM, ix, iz);
    geoms[k] = await buildTerrainGeometry(windows[k], surfOf(ix, iz));
    glbs[k] = await encodeTerrainMesh(geoms[k]);
  }
});

describe('terrain.height', () => {
  it('shares base/step and matches neighbours bit-for-bit on shared edges', async () => {
    const nw = cellHeightfield(windows.nw);
    const ne = cellHeightfield(windows.ne);
    const sw = cellHeightfield(windows.sw);
    expect([ne.minH, ne.step]).toEqual([nw.minH, nw.step]);
    const n = nw.size;
    for (let i = 0; i < n; i++) {
      expect(nw.data[i * n + (n - 1)]).toBe(ne.data[i * n]); // 동쪽 열 = 이웃 서쪽 열
      expect(nw.data[(n - 1) * n + i]).toBe(sw.data[i]); // 남쪽 행 = 이웃 북쪽 행
    }
  });

  it('encodes bin+gzip that round-trips', async () => {
    const gz = await encodeTerrainHeight(windows.nw);
    const raw = await gunzip(gz);
    if (!raw.ok) throw new Error(raw.error.message);
    const hf = parseHeightfield(raw.value);
    expect(hf.ok && hf.value.data).toEqual(cellHeightfield(windows.nw).data);
  });
});

/** 삼각형을 격자에 래스터화: 면적 합(xz, 부호), 퇴화 수, 모든 샘플 최대 수직 오차, 덮인 샘플 수. */
function rasterStats(h: Float64Array, n: number, idx: Uint32Array) {
  let [area, degenerate, maxErr] = [0, 0, 0];
  const covered = new Uint8Array(n * n);
  const xy = (v: number): [number, number, number] => [v % n, Math.floor(v / n), h[v] as number];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [xy(idx[t] as number), xy(idx[t + 1] as number), xy(idx[t + 2] as number)];
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (det === 0) degenerate++;
    area -= det / 2; // CCW(위에서) = det < 0
    for (let y = Math.min(a[1], b[1], c[1]); y <= Math.max(a[1], b[1], c[1]); y++) {
      for (let x = Math.min(a[0], b[0], c[0]); x <= Math.max(a[0], b[0], c[0]); x++) {
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / det;
        const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / det;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        covered[y * n + x] = 1;
        maxErr = Math.max(maxErr, Math.abs(l1 * a[2] + l2 * b[2] + (1 - l1 - l2) * c[2] - (h[y * n + x] as number)));
      }
    }
  }
  return { area, degenerate, maxErr, covered: covered.reduce((s, v) => s + v, 0) };
}

describe('rtinTriangulate', () => {
  it('bounds the vertical error at every sample, tiles the square exactly, keeps all border vertices', () => {
    const n = 65;
    const h = new Float64Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++)
        h[y * n + x] = 10 * Math.sin(x / 9) + (x > 40 && y > 20 ? 3 : 0) + ((x * y) % 5) * 0.01;
    }
    const idx = rtinTriangulate(h, n, 0.05);
    const st = rasterStats(h, n, idx);
    expect(st).toMatchObject({ area: (n - 1) * (n - 1), degenerate: 0, covered: n * n });
    expect(st.maxErr).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(idx.length / 3).toBeLessThan((n - 1) * (n - 1) * 2);
    const used = new Set(idx);
    for (let k = 0; k < n; k++)
      for (const v of [k, (n - 1) * n + k, k * n, k * n + n - 1]) expect(used.has(v)).toBe(true);
    expect(() => rtinTriangulate(new Float64Array(100), 10, 0.05)).toThrow(/2\^k/);
  });
});

describe('terrain.mesh', () => {
  it(`stays within ${TERRAIN_SIMPLIFY_ERROR_M} m of every DEM sample of the cell`, () => {
    const n = windows.nw.size;
    const h = new Float64Array(n * n);
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) h[z * n + x] = windows.nw.values[(z + 1) * windows.nw.stride + x + 1] as number;
    const g = geoms.nw;
    const grid = Uint32Array.from(
      g.indices,
      (v) => (g.positions[v * 3 + 2] as number) * n + (g.positions[v * 3] as number),
    );
    const st = rasterStats(h, n, grid);
    expect(st).toMatchObject({ area: CELL_SIZE_M * CELL_SIZE_M, degenerate: 0, covered: n * n });
    expect(st.maxErr).toBeLessThanOrEqual(TERRAIN_SIMPLIFY_ERROR_M + 1e-6);
  });

  it('simplifies but keeps every vertex on a DEM sample', () => {
    const g = geoms.nw;
    const count = g.positions.length / 3;
    expect(count).toBeLessThan(CELL_SIZE_M * CELL_SIZE_M);
    expect(g.indices.length % 3).toBe(0);
    for (let v = 0; v < count; v++) {
      const [x, y, z] = [g.positions[v * 3], g.positions[v * 3 + 1], g.positions[v * 3 + 2]] as number[];
      expect(Number.isInteger(x) && Number.isInteger(z)).toBe(true);
      expect(y).toBe(windows.nw.values[((z as number) + 1) * windows.nw.stride + (x as number) + 1]);
    }
  });

  it('locks all 257 border vertices and matches neighbours exactly after glb round-trip', async () => {
    const [nw, ne, sw] = await Promise.all([decodeGlb(glbs.nw), decodeGlb(glbs.ne), decodeGlb(glbs.sw)]);
    const pos = (d: typeof nw) => d.primitives[0]?.attributes.POSITION?.array as Float32Array;
    const east = edgeVertices(pos(nw), 0, CELL_SIZE_M);
    const west = edgeVertices(pos(ne), 0, 0);
    expect(east.length).toBe(CELL_SIZE_M + 1);
    expect(west).toEqual(east);
    const south = edgeVertices(pos(nw), 2, CELL_SIZE_M);
    const north = edgeVertices(pos(sw), 2, 0);
    expect(south.length).toBe(CELL_SIZE_M + 1);
    expect(north).toEqual(south);
    // 법선도 경계에서 같은 값(여유 샘플 중앙 차분).
    expect(nw.primitives[0]?.attributes.NORMAL?.normalized).toBe(true);
  });

  it('is byte-identical across runs', async () => {
    const again = await encodeTerrainMesh(await buildTerrainGeometry(windows.nw, surfOf(-1, -1)));
    expect(again).toEqual(glbs.nw);
  });
});

describe('_SURF surface classes', () => {
  it('rasterises roads with sidewalk over carriageway, plaza elsewhere', () => {
    const g = surfOf(-1, -1);
    const at = (x: number, z: number): number => g[(z + 256) * 257 + (x + 256)] as number;
    expect([at(-30, -110), at(-30, -101), at(-30, -99), at(-30, -121), at(-41, -110)]).toEqual([
      SURF.asphalt,
      SURF.sidewalk,
      SURF.plaza,
      SURF.plaza,
      SURF.plaza,
    ]);
    expect(at(0, -110)).toBe(SURF.asphalt); // 동쪽 경계 열
  });

  it('refines asphalt edges to 1 m and other class edges to 4 m triangles and matches classes across the seam', () => {
    const g = geoms.nw;
    const cls = (v: number): number => g.surf[v] as number;
    const px = (v: number, k: number): number => g.positions[v * 3 + k] as number;
    for (let t = 0; t < g.indices.length; t += 3) {
      const [a, b, c] = [g.indices[t], g.indices[t + 1], g.indices[t + 2]] as number[] as [number, number, number];
      if (cls(a) === cls(b) && cls(b) === cls(c)) continue;
      const road = [a, b, c].filter((v) => cls(v) === SURF.asphalt).length;
      const limit = road > 0 && road < 3 ? 1 : 4;
      for (const k of [0, 2])
        expect(Math.max(px(a, k), px(b, k), px(c, k)) - Math.min(px(a, k), px(b, k), px(c, k))).toBeLessThanOrEqual(
          limit,
        );
    }
    const edge = (geo: TerrainGeometry, at: number): number[][] => {
      const out: number[][] = [];
      for (let v = 0; v < geo.surf.length; v++)
        if (geo.positions[v * 3] === at) out.push([geo.positions[v * 3 + 2] as number, geo.surf[v] as number]);
      return out.sort((p, q) => (p[0] as number) - (q[0] as number));
    };
    const east = edge(geoms.nw, CELL_SIZE_M);
    expect(east.some(([, s]) => s === SURF.asphalt)).toBe(true);
    expect(edge(geoms.ne, 0)).toEqual(east);
  });
});
