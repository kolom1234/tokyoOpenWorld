// 소품 인스턴싱(M05-T03): 전역 풀 = LOD마다 InstancedMesh 1개(전 종류 합친 기하, 인스턴스 `_itype`) — 드로우콜 ≤ 3(수락 ≤ 종류 × 3).
// three r186은 InstancedMesh마다 셰이더 노드를 따로 빌드한다(캐시 키에 object.uuid, ≈ 140 ms) → 풀 수를 3개로, 용량은 고정(재생성 = 재빌드라 늘리지 않음).
// 블록 LOD 띠(blocks.ts)가 바뀐 LOD만 다시 채운다(셀 로컬 행렬 캐시 + 셀 원점 − 렌더 원점 덧셈, 쓴 범위만 업로드). see ADR-0051, docs/07-rendering.md §3
import type { CellKey, Vec3d } from '@sanpo/core';
import type { PropBatch } from '@sanpo/tile-format';
import { Group, InstancedBufferAttribute, InstancedMesh, type Material } from 'three/webgpu';
import { type Block, bandOf, blocksOf, DEFAULT_FAR_M, distanceTo, FAR_M, type TypeSlice } from './blocks.ts';
import { buildMergedPropGeometry, type PropLod } from './models.ts';

/** LOD별 고정 용량(인스턴스). MVP 적재 반경 안 소품 ≈ 수천 — 넘치면 먼 블록부터가 아니라 채운 순서대로 자르고 stats.dropped에 센다. */
export const PROP_POOL_CAPACITY: Readonly<Record<PropLod, number>> = { 0: 4096, 1: 16384, 2: 32768 };
const LODS: readonly PropLod[] = [0, 1, 2];

export interface PropFieldStats {
  instances: number;
  visible: number;
  /** 인스턴스가 있는 풀 수 = 소품 드로우콜(그림자 패스 제외). */
  pools: number;
  rebuilds: number;
  /** 용량을 넘어 그리지 못한 인스턴스. */
  dropped: number;
}

export interface PropField {
  readonly root: Group;
  /** 모든 풀이 쓰는 머티리얼(그림자 티어 변경 때 재컴파일 대상). */
  readonly material: Material;
  addCell(key: CellKey, originWF: Readonly<Vec3d>, batches: readonly PropBatch[] | undefined): void;
  removeCell(key: CellKey): void;
  /** 카메라(WF)·렌더 원점 → LOD 재배정·풀 재작성. 반환 = 재작성했는지(그림자 캐시 무효화). */
  update(cameraWF: Readonly<Vec3d>, renderOriginWF: Readonly<Vec3d>, force: boolean): boolean;
  /** 선컴파일용: 풀마다 인스턴스 1개(원점) → 복원 함수. */
  primeForCompile(): () => void;
  stats(): PropFieldStats;
  dispose(): void;
}

function createPool(lod: PropLod, material: Material): InstancedMesh {
  const cap = PROP_POOL_CAPACITY[lod];
  const geo = buildMergedPropGeometry(lod);
  geo.setAttribute('_itype', new InstancedBufferAttribute(new Float32Array(cap), 1));
  const m = new InstancedMesh(geo, material, cap);
  m.name = `props/lod${lod}`;
  m.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
  m.frustumCulled = false;
  m.matrixAutoUpdate = false;
  m.castShadow = lod < 2;
  m.receiveShadow = true;
  m.count = 0;
  return m;
}

/** 풀 버퍼에 조각들을 복사(셀 원점 − 렌더 원점 평행이동, 종류 번호)하고 쓴 범위만 올린다. 반환 = 잘린 수. */
function writeInstances(
  m: InstancedMesh,
  parts: readonly { t: number; s: TypeSlice; b: Block }[],
  origin: Readonly<Vec3d>,
): number {
  const cap = m.instanceMatrix.count;
  const mats = m.instanceMatrix.array as Float32Array;
  const cols = m.instanceColor?.array as Float32Array;
  const itype = m.geometry.getAttribute('_itype') as InstancedBufferAttribute;
  const types = itype.array as Float32Array;
  let at = 0;
  let dropped = 0;
  for (const { t, s, b } of parts) {
    const n = Math.min(s.n, cap - at);
    dropped += s.n - n;
    if (n <= 0) continue;
    mats.set(s.mats.subarray(0, n * 16), at * 16);
    cols.set(s.colors.subarray(0, n * 3), at * 3);
    types.fill(t, at, at + n);
    const [dx, dy, dz] = [b.origin.x - origin.x, b.origin.y - origin.y, b.origin.z - origin.z];
    for (let k = at; k < at + n; k++) {
      mats[k * 16 + 12] = (mats[k * 16 + 12] as number) + dx;
      mats[k * 16 + 13] = (mats[k * 16 + 13] as number) + dy;
      mats[k * 16 + 14] = (mats[k * 16 + 14] as number) + dz;
    }
    at += n;
  }
  m.count = at;
  for (const a of [m.instanceMatrix, m.instanceColor, itype]) {
    if (!a || at === 0) continue;
    a.clearUpdateRanges();
    a.addUpdateRange(0, at * a.itemSize);
    a.needsUpdate = true;
  }
  return dropped;
}

class PropFieldImpl implements PropField {
  readonly root = new Group();
  readonly material: Material;
  private readonly cells = new Map<CellKey, Block[]>();
  private readonly pools: InstancedMesh[];
  private readonly dirty = new Set<PropLod>(LODS);
  private readonly dropped: Record<PropLod, number> = { 0: 0, 1: 0, 2: 0 };
  private rebuilds = 0;
  private lastCam: Vec3d | undefined;

  constructor(material: Material) {
    this.material = material;
    this.root.name = 'props';
    this.pools = LODS.map((lod) => createPool(lod, material));
    this.root.add(...this.pools);
  }

  private fill(lod: PropLod, origin: Readonly<Vec3d>): void {
    const parts: { t: number; s: TypeSlice; b: Block }[] = [];
    for (const blocks of this.cells.values())
      for (const b of blocks) for (const [t, s] of b.types) if (s.band === lod) parts.push({ t, s, b });
    this.dropped[lod] = writeInstances(this.pools[lod] as InstancedMesh, parts, origin);
  }

  private markBands(blocks: readonly Block[]): void {
    for (const b of blocks) for (const s of b.types.values()) if (s.band >= 0) this.dirty.add(s.band as PropLod);
  }

  addCell(key: CellKey, originWF: Readonly<Vec3d>, batches: readonly PropBatch[] | undefined): void {
    this.removeCell(key);
    if (!batches || batches.length === 0) return;
    this.cells.set(key, blocksOf(key, originWF, batches));
    this.lastCam = undefined;
  }

  removeCell(key: CellKey): void {
    const blocks = this.cells.get(key);
    if (!blocks) return;
    this.cells.delete(key);
    this.markBands(blocks);
  }

  update(cam: Readonly<Vec3d>, origin: Readonly<Vec3d>, force: boolean): boolean {
    const last = this.lastCam;
    const moved = !last || Math.hypot(cam.x - last.x, cam.y - last.y, cam.z - last.z) > 1;
    if (moved || force) {
      this.lastCam = { ...cam };
      for (const blocks of this.cells.values())
        for (const b of blocks) {
          const d = distanceTo(b, cam);
          for (const [t, s] of b.types) {
            const band = bandOf(d, FAR_M[t] ?? DEFAULT_FAR_M, s.band);
            if (band === s.band) continue;
            if (s.band >= 0) this.dirty.add(s.band as PropLod);
            if (band >= 0) this.dirty.add(band as PropLod);
            s.band = band;
          }
        }
    }
    if (force) for (const lod of LODS) this.dirty.add(lod);
    if (this.dirty.size === 0) return false;
    for (const lod of this.dirty) this.fill(lod, origin);
    this.dirty.clear();
    this.rebuilds++;
    return true;
  }

  primeForCompile(): () => void {
    const primed = this.pools.filter((m) => m.count === 0);
    for (const m of primed) m.count = 1;
    return () => {
      for (const m of primed) m.count = 0;
    };
  }

  stats(): PropFieldStats {
    let instances = 0;
    for (const blocks of this.cells.values())
      for (const b of blocks) for (const s of b.types.values()) instances += s.n;
    const visible = this.pools.reduce((n, m) => n + m.count, 0);
    const pools = this.pools.filter((m) => m.count > 0).length;
    const dropped = this.dropped[0] + this.dropped[1] + this.dropped[2];
    return { instances, visible, pools, rebuilds: this.rebuilds, dropped };
  }

  dispose(): void {
    for (const m of this.pools) {
      m.removeFromParent();
      m.geometry.dispose();
      m.dispose();
    }
    this.cells.clear();
  }
}

export function createPropField(material: Material): PropField {
  return new PropFieldImpl(material);
}
