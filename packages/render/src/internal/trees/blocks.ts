// 나무 블록·LOD 띠(M05-T04): 셀 trees.inst → 64 m 블록·수종별 조각(셀 로컬 `_ipos` = x, y, z, yaw · `_iext` = 높이, 씨앗, 수종, 0),
// 블록 AABB 3D 거리 → 띠(0 상세 ≤ 30 m, 1 간략 ≤ 60 m, 2 임포스터 ≤ 2 km — 관목 20/50/250 m, 히스테리시스 3 m; 숲 GPU 측정으로 줄임). see ADR-0052
import type { Vec3d } from '@sanpo/core';
import { TREE_SPECIES, type TreeBatch, treeRecordAt } from '@sanpo/tile-format';

const BLOCK_M = 64;
const HYST_M = 3;
export const TREE_EDGES_BY_SPECIES: Readonly<Record<number, readonly number[]>> = {
  [TREE_SPECIES.shrub]: [20, 50, 250],
};
export const TREE_EDGES = [30, 60, 2000];
export const TREE_SPECIES_IDS: readonly number[] = Object.values(TREE_SPECIES);

export interface TreeSlice {
  n: number;
  ipos: Float32Array;
  iext: Float32Array;
  band: number;
}

export interface TreeBlock {
  origin: Vec3d;
  min: [number, number, number];
  max: [number, number, number];
  species: Map<number, TreeSlice>;
}

export function treeBlocksOf(origin: Readonly<Vec3d>, batch: TreeBatch): TreeBlock[] {
  const per = new Map<number, Map<number, number[]>>();
  for (let i = 0; i < batch.count; i++) {
    const r = treeRecordAt(batch, i);
    if (!TREE_SPECIES_IDS.includes(r.species)) continue;
    const b =
      Math.min(3, Math.max(0, Math.floor(r.z / BLOCK_M))) * 4 + Math.min(3, Math.max(0, Math.floor(r.x / BLOCK_M)));
    const m = per.get(b) ?? new Map<number, number[]>();
    const list = m.get(r.species) ?? [];
    list.push(i);
    m.set(r.species, list);
    per.set(b, m);
  }
  const out: TreeBlock[] = [];
  for (const [id, m] of per) {
    const [bx, bz] = [id % 4, Math.floor(id / 4)];
    const blk: TreeBlock = {
      origin: { ...origin },
      min: [bx * BLOCK_M, Infinity, bz * BLOCK_M],
      max: [(bx + 1) * BLOCK_M, -Infinity, (bz + 1) * BLOCK_M],
      species: new Map(),
    };
    for (const [sp, idx] of m) {
      const ipos = new Float32Array(idx.length * 4);
      const iext = new Float32Array(idx.length * 4);
      idx.forEach((i, k) => {
        const r = treeRecordAt(batch, i);
        ipos.set([r.x, r.y, r.z, (r.seed / 256) * 2 * Math.PI], k * 4);
        iext.set([r.height, r.seed / 255, r.species, 0], k * 4);
        blk.min[1] = Math.min(blk.min[1], r.y);
        blk.max[1] = Math.max(blk.max[1], r.y + r.height);
      });
      blk.species.set(sp, { n: idx.length, ipos, iext, band: -1 });
    }
    out.push(blk);
  }
  return out;
}

export function treeDistanceTo(b: TreeBlock, cam: Readonly<Vec3d>): number {
  const d = (lo: number, hi: number, v: number): number => (v < lo ? lo - v : v > hi ? v - hi : 0);
  return Math.hypot(
    d(b.origin.x + b.min[0], b.origin.x + b.max[0], cam.x),
    d(b.origin.y + b.min[1], b.origin.y + b.max[1], cam.y),
    d(b.origin.z + b.min[2], b.origin.z + b.max[2], cam.z),
  );
}

/** 거리 → 띠(0 상세, 1 간략, 2 임포스터, −1 숨김), 현재 띠 옆 경계에서 HYST 안이면 유지. */
export function treeBandOf(dist: number, edges: readonly number[], current: number): number {
  let band = edges.findIndex((e) => dist <= e);
  if (band === -1) band = 3;
  const cur = current === -1 ? 3 : current;
  if (band !== cur) {
    const edge = band > cur ? (edges[cur] as number) : (edges[cur - 1] as number);
    if (Math.abs(dist - edge) < HYST_M) band = cur;
  }
  return band === 3 ? -1 : band;
}
