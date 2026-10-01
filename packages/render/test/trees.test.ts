// M05-T04 나무 렌더: 계절 표(07 §8 날짜), LOD 띠 히스테리시스, 블록 조각(셀 로컬·yaw·수종), 풀 채우기(렌더 원점 평행이동·용량 절단).
import { packCellKey } from '@sanpo/core';
import { TREE_SPECIES, writeTrees } from '@sanpo/tile-format';
import { BufferAttribute, BufferGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { TREE_EDGES, treeBandOf, treeBlocksOf } from '../src/internal/trees/blocks.ts';
import { createTreeField } from '../src/internal/trees/field.ts';
import { impostorQuad, makeTreePool, writeTreePool } from '../src/internal/trees/pools.ts';
import { seasonTable } from '../src/internal/trees/season.ts';

const at = (day: number, species: number) => Array.from(seasonTable(day).subarray(species * 4, species * 4 + 4));
const day = (m: number, d: number) => Math.floor((Date.UTC(2026, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000) + 1;

describe('seasonTable', () => {
  it('turns ginkgo yellow from mid November and bare in winter', () => {
    const summer = at(day(7, 15), TREE_SPECIES.ginkgo);
    const autumn = at(day(11, 25), TREE_SPECIES.ginkgo);
    expect(summer[3]).toBe(1);
    expect(autumn[0] as number).toBeGreaterThan((summer[0] as number) * 2); // 노랑 = 빨강 성분 ↑
    expect(at(day(1, 15), TREE_SPECIES.ginkgo)[3]).toBe(0);
  });

  it('blooms cherries pink around early April and keeps evergreens dense', () => {
    const bloom = at(day(4, 2), TREE_SPECIES.cherry);
    expect(bloom[0] as number).toBeGreaterThan(bloom[1] as number);
    expect(bloom[3] as number).toBeGreaterThan(0.8);
    for (const d of [day(1, 10), day(4, 2), day(8, 1), day(11, 20)]) {
      expect(at(d, TREE_SPECIES.camphor)[3]).toBe(1);
      expect(at(d, TREE_SPECIES.pine)[3]).toBe(1);
    }
    expect(at(day(11, 15), TREE_SPECIES.zelkova)[0] as number).toBeGreaterThan(
      at(day(7, 1), TREE_SPECIES.zelkova)[0] as number,
    );
  });
});

describe('treeBandOf', () => {
  it('maps distance to detail/simple/impostor with a 3 m hysteresis', () => {
    expect(treeBandOf(10, TREE_EDGES, -1)).toBe(0);
    expect(treeBandOf(100, TREE_EDGES, -1)).toBe(1);
    expect(treeBandOf(500, TREE_EDGES, -1)).toBe(2);
    expect(treeBandOf(2500, TREE_EDGES, 2)).toBe(-1);
    expect(treeBandOf(46, TREE_EDGES, 0)).toBe(0);
    expect(treeBandOf(43, TREE_EDGES, 1)).toBe(1);
  });
});

const batch = (pts: [number, number, number][]) => {
  const bytes = writeTrees(
    pts.map(([x, z, s], i) => ({ species: s, seed: i * 40, x, y: 10, z, height: 12, crownR: 4 })),
  );
  const n = new DataView(bytes.buffer).getUint32(0, true);
  return { count: n, records: bytes.slice(4).buffer };
};

describe('tree blocks and pools', () => {
  it('splits records into 64 m blocks per species with yaw from the seed', () => {
    const b = treeBlocksOf(
      { x: 256, y: 0, z: 0 },
      batch([
        [10, 10, 1],
        [20, 12, 1],
        [200, 200, 2],
        [5, 5, 99],
      ]),
    );
    expect(b).toHaveLength(2);
    const near = b.find((x) => x.min[0] === 0);
    expect(near?.species.get(1)?.n).toBe(2);
    expect(near?.species.get(1)?.ipos[3]).toBeCloseTo(0, 6);
    expect(near?.species.get(1)?.ipos[7]).toBeCloseTo((40 / 256) * 2 * Math.PI, 6);
    expect(near?.max[1]).toBe(22);
  });

  it('writes instances relative to the render origin and truncates at capacity', () => {
    const base = new BufferGeometry();
    base.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
    base.setAttribute('normal', new BufferAttribute(new Float32Array(9), 3));
    base.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
    const pool = makeTreePool(
      't',
      2,
      [
        { base, material: new MeshStandardNodeMaterial() },
        { base: impostorQuad(), material: new MeshStandardNodeMaterial() },
      ],
      true,
    );
    const blocks = treeBlocksOf(
      { x: 256, y: 0, z: 0 },
      batch([
        [10, 10, 1],
        [20, 12, 1],
        [30, 14, 1],
      ]),
    );
    const s = blocks[0]?.species.get(1);
    if (!s || !blocks[0]) throw new Error('slice');
    expect(writeTreePool(pool, [{ s, b: blocks[0] }], { x: 0, y: 0, z: 0 })).toBe(1);
    expect(pool.geos.map((g) => g.instanceCount)).toEqual([2, 2]);
    expect((pool.ipos.array as Float32Array)[0]).toBeCloseTo(266, 5);
    expect(pool.geos[0]?.getAttribute('_ipos')).toBe(pool.geos[1]?.getAttribute('_ipos'));
  });

  it('remembers cells before assets arrive and reports stats', () => {
    const f = createTreeField();
    f.addCell(packCellKey(0, 0, 0), { x: 0, y: 0, z: 0 }, batch([[10, 10, 1]]));
    expect(f.update({ x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }, false)).toBe(false);
    expect(f.stats()).toMatchObject({ instances: 1, visible: 0, ready: false });
    f.dispose();
  });
});
