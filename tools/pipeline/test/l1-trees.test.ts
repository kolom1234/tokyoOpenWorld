// L1 원경 나무(M12-T07): 자식 L0 셀 trees.inst → L1 원점 기준으로 합치기(관목 제외), 출처 합집합, 나무 없는 L1 = null.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { packCellKey } from '@sanpo/core';
import { parseTrees, TREE_SPECIES, treeRecordAt, writeTkc, writeTrees } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { l1Trees } from '../src/stages/hlod/l1-trees.ts';

const tree = (species: number, x: number, z: number) => ({ species, seed: 7, x, y: 35, z, height: 9, crownR: 3 });

function writeL0(dir: string, ix: number, iz: number, trees: ReturnType<typeof tree>[]): void {
  const tkc = writeTkc(
    {
      cell: { level: 0, ix, iz },
      buildId: '20261127-0000000-00000000',
      originWF: [ix * 256, 0, iz * 256],
      aabbWF: { min: [ix * 256, 0, iz * 256], max: [ix * 256 + 256, 50, iz * 256 + 256] },
      materials: [],
      stats: { tris: 0, colliderTris: 0, instances: trees.length },
    },
    [{ type: 'trees.inst', sources: ['osm-kanto'], data: new Uint8Array(gzipSync(writeTrees(trees))) }],
  );
  mkdirSync(join(dir, 'L0', String(ix)), { recursive: true });
  writeFileSync(join(dir, 'L0', String(ix), `${iz}.tkc`), tkc);
}

describe('L1 trees (M12-T07)', () => {
  it('merges child L0 trees into L1-local coordinates and drops shrubs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'l1t-'));
    try {
      // L1 (−1, 0) = L0 ix −4..−1, iz 0..3.
      writeL0(dir, -4, 0, [tree(TREE_SPECIES.zelkova, 10, 20), tree(TREE_SPECIES.shrub, 5, 5)]);
      writeL0(dir, -1, 3, [tree(TREE_SPECIES.ginkgo, 100, 200)]);
      writeL0(dir, 0, 0, [tree(TREE_SPECIES.cherry, 1, 1)]); // 다른 L1의 자식 — 무시
      const r = l1Trees(dir, packCellKey(1, -1, 0));
      expect(r?.count).toBe(2);
      expect(r?.sources).toEqual(['osm-kanto']);
      const batch = parseTrees(new Uint8Array(gunzipSync(r?.data as Uint8Array)));
      expect(batch.ok).toBe(true);
      if (!batch.ok) return;
      const recs = Array.from({ length: batch.value.count }, (_, i) => treeRecordAt(batch.value, i));
      // L0 (−4, 0) 원점 = L1 원점 → (10, 20). L0 (−1, 3) 원점 = L1 + (768, 768) → (868, 968).
      expect(recs.map((t) => [t.species, Math.round(t.x), Math.round(t.z)])).toEqual([
        [TREE_SPECIES.zelkova, 10, 20],
        [TREE_SPECIES.ginkgo, 868, 968],
      ]);
      expect(l1Trees(dir, packCellKey(1, 5, 5))).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
