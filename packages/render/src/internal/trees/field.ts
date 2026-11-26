// 나무 필드(M05-T04): 셀 추가·제거·카메라 → 블록 LOD 띠(blocks.ts) → 풀 채우기(pools.ts). 풀 = 수종 × LOD0/1 × {수피, 잎} + 임포스터 1개(전 수종).
// 에셋(trees.glb·잎·임포스터 아틀라스)은 첫 표시 뒤 attach — 그 전엔 셀 조각만 기억한다(풀 없음). see ADR-0052
import { type CellKey, packCellKey, unpackCellKey, type Vec3d } from '@sanpo/core';
import type { TreeBatch } from '@sanpo/tile-format';
import { Group, type Material } from 'three/webgpu';
import type { TreeAssets } from './assets.ts';
import {
  TREE_EDGES,
  TREE_EDGES_BY_SPECIES,
  TREE_SPECIES_IDS,
  type TreeBlock,
  type TreeSlice,
  treeBandOf,
  treeBlocksOf,
  treeDistanceTo,
} from './blocks.ts';
import { impostorQuad, makeTreePool, type TreePool, writeTreePool } from './pools.ts';

/** 풀 용량(인스턴스): 수종별 상세·간략, 임포스터(전 수종). */
export const TREE_POOL_CAPACITY = { detail: 512, simple: 4096, impostor: 65536 } as const;

export interface TreeFieldStats {
  instances: number;
  visible: number;
  /** 인스턴스가 있는 메시 수 = 나무 드로우콜(그림자 제외). */
  pools: number;
  dropped: number;
  ready: boolean;
}

export interface TreeMaterials {
  bark: Material;
  leaf: Material;
  impostor: Material;
}

/** 풀 키: `${species}:${lod}`(lod 0·1), 임포스터 = 'imp'. */
const keyOf = (species: number, band: number): string => (band === 2 ? 'imp' : `${species}:${band}`);

export interface TreeField {
  readonly root: Group;
  attach(assets: TreeAssets, materials: TreeMaterials): void;
  addCell(key: CellKey, originWF: Readonly<Vec3d>, batch: TreeBatch | undefined): void;
  removeCell(key: CellKey): void;
  update(cameraWF: Readonly<Vec3d>, renderOriginWF: Readonly<Vec3d>, force: boolean): boolean;
  /** 선컴파일: 풀마다 인스턴스 1개 → 복원 함수(에셋 attach 뒤에만 의미). */
  primeForCompile(): () => void;
  stats(): TreeFieldStats;
  dispose(): void;
}

class TreeFieldImpl implements TreeField {
  readonly root = new Group();
  private readonly cells = new Map<CellKey, TreeBlock[]>();
  private readonly pools = new Map<string, TreePool>();
  private readonly dirty = new Set<string>();
  private readonly dropped = new Map<string, number>();
  private lastCam: Vec3d | undefined;

  constructor() {
    this.root.name = 'trees';
  }

  attach(assets: TreeAssets, m: TreeMaterials): void {
    for (const sp of TREE_SPECIES_IDS)
      for (const lod of [0, 1] as const) {
        const bark = assets.parts.get(`${sp}:${lod}:bark`);
        const leaf = assets.parts.get(`${sp}:${lod}:leaf`);
        if (!bark || !leaf) continue;
        const cap = lod === 0 ? TREE_POOL_CAPACITY.detail : TREE_POOL_CAPACITY.simple;
        const p = makeTreePool(
          `trees/${sp}/lod${lod}`,
          cap,
          [
            { base: bark, material: m.bark },
            { base: leaf, material: m.leaf },
          ],
          // 그림자 = 상세 LOD만(간략·임포스터까지 4단 그림자에 그리면 숲에서 수 ms — 측정).
          lod === 0,
        );
        this.pools.set(keyOf(sp, lod), p);
        this.root.add(...p.meshes);
      }
    const imp = makeTreePool(
      'trees/impostor',
      TREE_POOL_CAPACITY.impostor,
      [{ base: impostorQuad(), material: m.impostor }],
      false,
    );
    this.pools.set('imp', imp);
    this.root.add(...imp.meshes);
    for (const k of this.pools.keys()) this.dirty.add(k);
  }

  /** 그릴 블록: L0 셀 블록 전부 + L1(원경) 블록 중 그 자리 L0 셀 나무가 없는 것(M12-T07 — 겹쳐 두 번 그리지 않게). */
  private *active(): Generator<TreeBlock> {
    for (const blocks of this.cells.values())
      for (const b of blocks) if (!b.l0 || !this.cells.has(packCellKey(0, b.l0.ix, b.l0.iz))) yield b;
  }

  private fill(key: string, origin: Readonly<Vec3d>): void {
    const pool = this.pools.get(key);
    if (!pool) return;
    const parts: { s: TreeSlice; b: TreeBlock }[] = [];
    for (const b of this.active())
      for (const [sp, s] of b.species) if (s.band >= 0 && keyOf(sp, s.band) === key) parts.push({ s, b });
    this.dropped.set(key, writeTreePool(pool, parts, origin));
  }

  /** L0 셀이 들어오거나 나가면 그 자리 L1 블록의 풀을 다시 채운다. */
  private touchFar(l0: CellKey): void {
    const { ix, iz } = unpackCellKey(l0);
    for (const blocks of this.cells.values())
      for (const b of blocks)
        if (b.l0?.ix === ix && b.l0.iz === iz)
          for (const [sp, s] of b.species) if (s.band >= 0) this.dirty.add(keyOf(sp, s.band));
  }

  addCell(key: CellKey, originWF: Readonly<Vec3d>, batch: TreeBatch | undefined): void {
    this.removeCell(key);
    if (!batch || batch.count === 0) return;
    const level = unpackCellKey(key).level;
    const blocks = treeBlocksOf(originWF, batch, level === 1 ? 1024 : 256);
    if (level === 1)
      for (const b of blocks) {
        const cx = originWF.x + (b.min[0] + b.max[0]) / 2;
        const cz = originWF.z + (b.min[2] + b.max[2]) / 2;
        b.l0 = { ix: Math.floor(cx / 256), iz: Math.floor(cz / 256) };
      }
    this.cells.set(key, blocks);
    if (level === 0) this.touchFar(key);
    this.lastCam = undefined;
  }

  removeCell(key: CellKey): void {
    const blocks = this.cells.get(key);
    if (!blocks) return;
    this.cells.delete(key);
    for (const b of blocks) for (const [sp, s] of b.species) if (s.band >= 0) this.dirty.add(keyOf(sp, s.band));
    if (unpackCellKey(key).level === 0) this.touchFar(key);
  }

  update(cam: Readonly<Vec3d>, origin: Readonly<Vec3d>, force: boolean): boolean {
    const last = this.lastCam;
    if (!last || force || Math.hypot(cam.x - last.x, cam.y - last.y, cam.z - last.z) > 1) {
      this.lastCam = { ...cam };
      for (const blocks of this.cells.values())
        for (const b of blocks) {
          const d = treeDistanceTo(b, cam);
          for (const [sp, s] of b.species) {
            const band = treeBandOf(d, TREE_EDGES_BY_SPECIES[sp] ?? TREE_EDGES, s.band);
            if (band === s.band) continue;
            if (s.band >= 0) this.dirty.add(keyOf(sp, s.band));
            if (band >= 0) this.dirty.add(keyOf(sp, band));
            s.band = band;
          }
        }
    }
    if (force) for (const k of this.pools.keys()) this.dirty.add(k);
    if (this.dirty.size === 0 || this.pools.size === 0) return false;
    for (const k of this.dirty) this.fill(k, origin);
    this.dirty.clear();
    return true;
  }

  primeForCompile(): () => void {
    const primed = [...this.pools.values()].filter((p) => (p.geos[0]?.instanceCount ?? 0) === 0);
    for (const p of primed) {
      (p.iext.array as Float32Array).set([1, 0, 1, 0], 0);
      for (const g of p.geos) g.instanceCount = 1;
    }
    // 복원 = 다음 update에서 전부 다시 채움(컴파일을 기다리는 동안 채워진 풀을 0으로 되돌리면 정지 카메라에선 영영 비어 있다 — 골든뷰).
    return () => {
      for (const p of primed) for (const g of p.geos) g.instanceCount = 0;
      for (const k of this.pools.keys()) this.dirty.add(k);
    };
  }

  stats(): TreeFieldStats {
    // 그릴 나무 = L0 + 그 자리 L0가 없는 L1(원경) 블록.
    let instances = 0;
    for (const b of this.active()) for (const s of b.species.values()) instances += s.n;
    let visible = 0;
    let pools = 0;
    for (const p of this.pools.values()) {
      const n = p.geos[0]?.instanceCount ?? 0;
      visible += n;
      if (n > 0) pools += p.meshes.length;
    }
    let dropped = 0;
    for (const v of this.dropped.values()) dropped += v;
    return { instances, visible, pools, dropped, ready: this.pools.size > 0 };
  }

  dispose(): void {
    for (const p of this.pools.values()) {
      for (const m of p.meshes) m.removeFromParent();
      for (const g of p.geos) g.dispose();
    }
    this.pools.clear();
    this.cells.clear();
  }
}

export function createTreeField(): TreeField {
  return new TreeFieldImpl();
}
