// M05-T03 소품 렌더: 절차 모델(전 종류·LOD 단조 감소·바깥 감기), LOD 띠 히스테리시스, 전역 풀(드로우콜 ≤ 종류 × 3)·원점 평행이동·용량 증가.
import { packCellKey } from '@sanpo/core';
import { PROP_TYPE, type PropBatch } from '@sanpo/tile-format';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { bandOf } from '../src/internal/props/blocks.ts';
import { buildMergedPropGeometry, buildPropGeometry, PROP_TYPE_IDS } from '../src/internal/props/models.ts';
import { createPropField, PROP_POOL_CAPACITY } from '../src/internal/props/pools.ts';

function tris(typeId: number, lod: 0 | 1 | 2): number {
  const g = buildPropGeometry(typeId, lod);
  return (g?.index?.count ?? 0) / 3;
}

describe('prop models', () => {
  it('exist for every PROP_TYPE with fewer triangles per LOD', () => {
    expect(PROP_TYPE_IDS.slice().sort((a, b) => a - b)).toEqual(Object.values(PROP_TYPE).sort((a, b) => a - b));
    for (const t of PROP_TYPE_IDS) {
      expect(tris(t, 0)).toBeGreaterThan(0);
      expect(tris(t, 0)).toBeGreaterThanOrEqual(tris(t, 1));
      expect(tris(t, 1)).toBeGreaterThanOrEqual(tris(t, 2));
      expect(tris(t, 0)).toBeLessThan(1000);
    }
    expect(buildPropGeometry(999, 0)).toBeUndefined();
  });

  it('winds every triangle counter-clockwise around its vertex normal', () => {
    for (const t of PROP_TYPE_IDS) {
      const g = buildPropGeometry(t, 0);
      const p = g?.getAttribute('position');
      const n = g?.getAttribute('normal');
      const idx = g?.index;
      if (!p || !n || !idx) throw new Error('geometry');
      for (let k = 0; k < idx.count; k += 3) {
        const [a, b, c] = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
        const e1 = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)];
        const e2 = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
        const cr = [
          (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
          (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
          (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
        ];
        const dot = (cr[0] as number) * n.getX(a) + (cr[1] as number) * n.getY(a) + (cr[2] as number) * n.getZ(a);
        expect(dot, `type ${t} tri ${k / 3}`).toBeGreaterThan(-1e-9);
      }
    }
  });
});

describe('bandOf', () => {
  it('maps distance to LOD bands with a 2 m hysteresis', () => {
    expect(bandOf(10, 150, -1)).toBe(0);
    expect(bandOf(100, 150, -1)).toBe(1);
    expect(bandOf(149, 300, -1)).toBe(1);
    expect(bandOf(200, 300, -1)).toBe(2);
    expect(bandOf(400, 300, 2)).toBe(-1);
    // 경계(40 m) 근처: 현재 띠 유지.
    expect(bandOf(41, 150, 0)).toBe(0);
    expect(bandOf(39, 150, 1)).toBe(1);
    expect(bandOf(43, 150, 0)).toBe(1);
  });
});

describe('merged LOD geometry', () => {
  it('holds every type once with a per-vertex _ptype', () => {
    for (const lod of [0, 1, 2] as const) {
      const g = buildMergedPropGeometry(lod);
      const t = g.getAttribute('_ptype');
      const seen = new Set<number>();
      for (let i = 0; i < t.count; i++) seen.add(t.getX(i));
      expect([...seen].sort((a, b) => a - b)).toEqual(PROP_TYPE_IDS.slice().sort((a, b) => a - b));
      const sum = PROP_TYPE_IDS.reduce((n, id) => n + tris(id, lod), 0);
      expect((g.index?.count ?? 0) / 3).toBe(sum);
      // 인스턴스마다 전 종류 정점을 셰이더가 돈다 → LOD0 합 정점 수 상한(GPU 정점 예산).
      expect(t.count).toBeLessThan(lod === 0 ? 8000 : 4000);
    }
  });
});

const batch = (typeId: number, pts: number[][]): PropBatch => ({
  typeId,
  transforms: Float32Array.from(pts.flatMap(([x, z]) => [x as number, 5, z as number, 0, 1])),
});

type Pool = {
  name: string;
  count: number;
  instanceMatrix: { array: Float32Array; count: number };
  geometry: { getAttribute(n: string): { array: Float32Array } };
};

describe('prop field', () => {
  const material = new MeshStandardNodeMaterial();

  it('uses one pool per LOD (3 draws), tags instances by type and translates by cell origin − render origin', () => {
    const f = createPropField(material);
    const key = packCellKey(0, 1, 0);
    f.addCell(key, { x: 256, y: 0, z: 0 }, [
      batch(PROP_TYPE.utilityPole, [
        [10, 10],
        [200, 200],
      ]),
      batch(PROP_TYPE.bench, [[12, 12]]),
    ]);
    expect(f.update({ x: 266, y: 6, z: 10 }, { x: 256, y: 0, z: 0 }, false)).toBe(true);
    expect(f.stats()).toMatchObject({ instances: 3, visible: 3, pools: 2, dropped: 0 });
    const pools = f.root.children as unknown as Pool[];
    expect(pools.map((m) => m.name)).toEqual(['props/lod0', 'props/lod1', 'props/lod2']);
    // 가까운 전주·벤치 = LOD0, 먼 전주(≈ 190 m 블록) = LOD2.
    const [near, , far] = pools as [Pool, Pool, Pool];
    expect(near.count).toBe(2);
    const types = [...near.geometry.getAttribute('_itype').array.subarray(0, 2)].sort((a, b) => a - b);
    expect(types).toEqual([PROP_TYPE.utilityPole, PROP_TYPE.bench].sort((a, b) => a - b));
    const i = near.geometry.getAttribute('_itype').array[0] === PROP_TYPE.utilityPole ? 0 : 1;
    expect(near.instanceMatrix.array[i * 16 + 12]).toBeCloseTo(10, 5);
    expect(far.count).toBe(1);
    expect(far.geometry.getAttribute('_itype').array[0]).toBe(PROP_TYPE.utilityPole);
    // 원점 재설정(force): 렌더 좌표 = 셀 원점 − 새 원점 + 로컬.
    f.update({ x: 266, y: 6, z: 10 }, { x: 0, y: 0, z: 0 }, true);
    expect(near.instanceMatrix.array[i * 16 + 12]).toBeCloseTo(266, 5);
    // 제자리: 재작성 없음.
    expect(f.update({ x: 266.2, y: 6, z: 10 }, { x: 0, y: 0, z: 0 }, false)).toBe(false);
    f.removeCell(key);
    f.update({ x: 266, y: 6, z: 10 }, { x: 0, y: 0, z: 0 }, false);
    expect(f.stats()).toMatchObject({ instances: 0, visible: 0, pools: 0 });
    f.dispose();
  });

  it('keeps fixed capacities (no pool re-creation), counts overflow and ignores unknown types', () => {
    const f = createPropField(material);
    const before = f.root.children.slice();
    const n = PROP_POOL_CAPACITY[0] + 50;
    const pts = Array.from({ length: n }, (_, i) => [(i % 64) * 0.9, Math.floor(i / 64) * 0.9]);
    f.addCell(packCellKey(0, 0, 0), { x: 0, y: 0, z: 0 }, [batch(PROP_TYPE.bollard, pts), batch(999, [[1, 1]])]);
    f.update({ x: 30, y: 2, z: 20 }, { x: 0, y: 0, z: 0 }, false);
    const s = f.stats();
    expect(s.instances).toBe(n);
    expect(s.visible + s.dropped).toBe(n);
    expect(f.root.children).toEqual(before);
    f.dispose();
  });
});
