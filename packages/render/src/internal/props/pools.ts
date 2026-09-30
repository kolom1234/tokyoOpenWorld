// 소품 인스턴싱(M05-T03): 전역 풀 = (종류 × LOD 3) InstancedMesh — 드로우콜 ≤ 종류 × 3(수락 기준). 셀 소품은 64 m 블록으로 나눠
// 블록마다 카메라 거리(3D, 블록 AABB)로 LOD 띠(히스테리시스 2 m)를 정하고, 띠가 바뀐 종류만 풀을 다시 채운다(셀 추가·제거·원점 재설정 = 전부).
// 인스턴스 행렬은 셀 로컬로 한 번 계산해 두고 채울 때 셀 원점 − 렌더 원점만 더한다(메인 스레드 복사 + 덧셈). see ADR-0051, docs/07-rendering.md §5
import type { CellKey, Vec3d } from '@sanpo/core';
import { PROP_TYPE, type PropBatch } from '@sanpo/tile-format';
import { Group, InstancedBufferAttribute, InstancedMesh, type Material } from 'three/webgpu';
import { buildPropGeometry, PROP_TYPE_IDS, type PropLod } from './models.ts';

const BLOCK_M = 64;
/** LOD0/1 경계(m). LOD2 끝 = 종류별 FAR_M. */
const NEAR_M = [40, 150] as const;
const HYST_M = 2;
const FAR_M: Readonly<Record<number, number>> = {
  [PROP_TYPE.utilityPole]: 600,
  [PROP_TYPE.signalVehicle]: 400,
  [PROP_TYPE.streetLamp]: 350,
  [PROP_TYPE.vendingMachine]: 250,
  [PROP_TYPE.phoneBooth]: 250,
  [PROP_TYPE.guardRail]: 250,
  [PROP_TYPE.busStop]: 200,
  [PROP_TYPE.manhole]: 80,
};
const DEFAULT_FAR_M = 150;
/** 그림자를 드리우는 종류(키 큰 것, LOD 0–1). */
const SHADOW_TYPES: ReadonlySet<number> = new Set([
  PROP_TYPE.utilityPole,
  PROP_TYPE.streetLamp,
  PROP_TYPE.signalVehicle,
  PROP_TYPE.signalPedestrian,
  PROP_TYPE.vendingMachine,
  PROP_TYPE.phoneBooth,
  PROP_TYPE.busStop,
]);
/** 자판기 가상 브랜드 몸체색(선형 근사, 로고 없음). */
const VENDING_TINTS: readonly (readonly [number, number, number])[] = [
  [0.75, 0.05, 0.05],
  [0.04, 0.18, 0.55],
  [1, 1, 1],
  [0.06, 0.35, 0.1],
  [0.9, 0.55, 0.02],
];
const MIN_CAPACITY = 64;

interface TypeSlice {
  n: number;
  mats: Float32Array;
  colors: Float32Array;
  band: number;
}

interface Block {
  key: CellKey;
  origin: Vec3d;
  /** 셀 로컬 AABB. */
  min: [number, number, number];
  max: [number, number, number];
  types: Map<number, TypeSlice>;
}

export interface PropFieldStats {
  instances: number;
  visible: number;
  pools: number;
  rebuilds: number;
}

export interface PropField {
  readonly root: Group;
  /** 모든 풀이 쓰는 머티리얼(그림자 티어 변경 때 재컴파일 대상). */
  readonly material: Material;
  addCell(key: CellKey, originWF: Readonly<Vec3d>, batches: readonly PropBatch[] | undefined): void;
  removeCell(key: CellKey): void;
  /** 카메라(WF)·렌더 원점 → LOD 재배정·풀 재작성. 반환 = 재작성했는지(그림자 캐시 무효화). */
  update(cameraWF: Readonly<Vec3d>, renderOriginWF: Readonly<Vec3d>, force: boolean): boolean;
  /** 선컴파일용: 모든 종류 LOD0 풀에 인스턴스 1개(원점)씩 → 복원 함수. */
  primeForCompile(): () => void;
  stats(): PropFieldStats;
  dispose(): void;
}

function sliceOf(t: Float32Array, typeId: number, idx: readonly number[]): TypeSlice {
  const mats = new Float32Array(idx.length * 16);
  const colors = new Float32Array(idx.length * 3).fill(1);
  idx.forEach((i, k) => {
    const [x, y, z, yaw, s] = [t[i * 5], t[i * 5 + 1], t[i * 5 + 2], t[i * 5 + 3], t[i * 5 + 4]] as number[];
    const c = Math.cos(yaw as number) * (s as number);
    const n = Math.sin(yaw as number) * (s as number);
    mats.set([c, 0, -n, 0, 0, s as number, 0, 0, n, 0, c, 0, x as number, y as number, z as number, 1], k * 16);
    if (typeId === PROP_TYPE.vendingMachine) {
      const h = Math.abs(Math.round((x as number) * 7 + (z as number) * 13)) % VENDING_TINTS.length;
      colors.set(VENDING_TINTS[h] as readonly number[], k * 3);
    }
  });
  return { n: idx.length, mats, colors, band: -1 };
}

/** 셀 배치 → 64 m 블록들. */
function blocksOf(key: CellKey, origin: Readonly<Vec3d>, batches: readonly PropBatch[]): Block[] {
  const blocks = new Map<number, Block>();
  for (const b of batches) {
    if (!PROP_TYPE_IDS.includes(b.typeId)) continue;
    const per = new Map<number, number[]>();
    for (let i = 0; i < b.transforms.length / 5; i++) {
      const bx = Math.min(3, Math.max(0, Math.floor((b.transforms[i * 5] as number) / BLOCK_M)));
      const bz = Math.min(3, Math.max(0, Math.floor((b.transforms[i * 5 + 2] as number) / BLOCK_M)));
      const list = per.get(bz * 4 + bx) ?? [];
      list.push(i);
      per.set(bz * 4 + bx, list);
    }
    for (const [id, idx] of per) {
      let blk = blocks.get(id);
      if (!blk) {
        const [bx, bz] = [id % 4, Math.floor(id / 4)];
        blk = {
          key,
          origin: { ...origin },
          min: [bx * BLOCK_M, Infinity, bz * BLOCK_M],
          max: [(bx + 1) * BLOCK_M, -Infinity, (bz + 1) * BLOCK_M],
          types: new Map(),
        };
        blocks.set(id, blk);
      }
      for (const i of idx) {
        const y = b.transforms[i * 5 + 1] as number;
        blk.min[1] = Math.min(blk.min[1], y);
        blk.max[1] = Math.max(blk.max[1], y + 12);
      }
      blk.types.set(b.typeId, sliceOf(b.transforms, b.typeId, idx));
    }
  }
  return [...blocks.values()];
}

function distanceTo(b: Block, cam: Readonly<Vec3d>): number {
  const d = (lo: number, hi: number, v: number): number => (v < lo ? lo - v : v > hi ? v - hi : 0);
  return Math.hypot(
    d(b.origin.x + b.min[0], b.origin.x + b.max[0], cam.x),
    d(b.origin.y + b.min[1], b.origin.y + b.max[1], cam.y),
    d(b.origin.z + b.min[2], b.origin.z + b.max[2], cam.z),
  );
}

/** 거리 → 띠(0–2, −1 숨김), 현재 띠에서 멀어질 땐 +HYST, 가까워질 땐 −HYST. */
export function bandOf(dist: number, far: number, current: number): number {
  const edges = [NEAR_M[0], NEAR_M[1], far];
  let band = edges.findIndex((e) => dist <= e);
  if (band === -1) band = 3;
  const cur = current === -1 ? 3 : current;
  if (band !== cur) {
    // 지금 띠 바로 옆 경계(멀어짐 = 바깥 경계, 가까워짐 = 안쪽 경계)에서 HYST 안이면 유지.
    const edge = band > cur ? (edges[cur] as number) : (edges[cur - 1] as number);
    if (Math.abs(dist - edge) < HYST_M) band = cur;
  }
  return band === 3 ? -1 : band;
}

class PropFieldImpl implements PropField {
  readonly root = new Group();
  private readonly cells = new Map<CellKey, Block[]>();
  private readonly pools = new Map<string, InstancedMesh>();
  private readonly dirty = new Set<number>(PROP_TYPE_IDS);
  private rebuilds = 0;
  private lastCam: Vec3d | undefined;
  readonly material: Material;

  constructor(material: Material) {
    this.material = material;
    this.root.name = 'props';
  }

  /** (종류, LOD) 풀 — 용량이 모자라면 2배수로 새로 만든다(기하 재사용). need 0이고 없으면 만들지 않음. */
  private poolOf(typeId: number, lod: PropLod, need: number): InstancedMesh | undefined {
    const id = `${typeId}:${lod}`;
    const m = this.pools.get(id);
    if (m && m.instanceMatrix.count >= need) return m;
    if (!m && need === 0) return undefined;
    const geo = m?.geometry ?? buildPropGeometry(typeId, lod);
    if (!geo) return undefined;
    let cap = MIN_CAPACITY;
    while (cap < need) cap *= 2;
    const next = new InstancedMesh(geo, this.material, cap);
    next.name = `props/${typeId}/lod${lod}`;
    next.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    next.frustumCulled = false;
    next.matrixAutoUpdate = false;
    next.castShadow = lod < 2 && SHADOW_TYPES.has(typeId);
    next.receiveShadow = true;
    next.count = 0;
    if (m) {
      m.removeFromParent();
      m.dispose();
    }
    this.root.add(next);
    this.pools.set(id, next);
    return next;
  }

  /** 종류 하나의 LOD 풀 3개를 띠에 맞춰 다시 채운다. */
  private fill(typeId: number, origin: Readonly<Vec3d>): void {
    for (const lod of [0, 1, 2] as const) {
      const parts: { s: TypeSlice; b: Block }[] = [];
      let need = 0;
      for (const blocks of this.cells.values())
        for (const b of blocks) {
          const s = b.types.get(typeId);
          if (s && s.band === lod) {
            parts.push({ s, b });
            need += s.n;
          }
        }
      const m = this.poolOf(typeId, lod, need);
      if (m) writeInstances(m, parts, need, origin);
    }
  }

  private markAll(blocks: readonly Block[]): void {
    for (const b of blocks) for (const t of b.types.keys()) this.dirty.add(t);
  }

  addCell(key: CellKey, originWF: Readonly<Vec3d>, batches: readonly PropBatch[] | undefined): void {
    this.removeCell(key);
    if (!batches || batches.length === 0) return;
    const blocks = blocksOf(key, originWF, batches);
    this.cells.set(key, blocks);
    this.markAll(blocks);
    this.lastCam = undefined;
  }

  removeCell(key: CellKey): void {
    const blocks = this.cells.get(key);
    if (!blocks) return;
    this.cells.delete(key);
    this.markAll(blocks);
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
            s.band = band;
            this.dirty.add(t);
          }
        }
    }
    if (force) for (const t of PROP_TYPE_IDS) this.dirty.add(t);
    if (this.dirty.size === 0) return false;
    for (const t of this.dirty) this.fill(t, origin);
    this.dirty.clear();
    this.rebuilds++;
    return true;
  }

  primeForCompile(): () => void {
    const primed: InstancedMesh[] = [];
    for (const t of PROP_TYPE_IDS) {
      const m = this.poolOf(t, 0, 1);
      if (m && m.count === 0) {
        m.count = 1;
        primed.push(m);
      }
    }
    return () => {
      for (const m of primed) m.count = 0;
    };
  }

  stats(): PropFieldStats {
    let instances = 0;
    for (const blocks of this.cells.values())
      for (const b of blocks) for (const s of b.types.values()) instances += s.n;
    let visible = 0;
    let used = 0;
    for (const m of this.pools.values()) {
      visible += m.count;
      if (m.count > 0) used++;
    }
    return { instances, visible, pools: used, rebuilds: this.rebuilds };
  }

  dispose(): void {
    for (const m of this.pools.values()) {
      m.removeFromParent();
      m.geometry.dispose();
      m.dispose();
    }
    this.pools.clear();
    this.cells.clear();
  }
}

/** 풀 버퍼에 조각들을 복사(셀 원점 − 렌더 원점 평행이동)하고 쓴 범위만 올린다. */
function writeInstances(
  m: InstancedMesh,
  parts: readonly { s: TypeSlice; b: Block }[],
  need: number,
  origin: Readonly<Vec3d>,
): void {
  const mats = m.instanceMatrix.array as Float32Array;
  const cols = m.instanceColor?.array as Float32Array;
  let at = 0;
  for (const { s, b } of parts) {
    mats.set(s.mats, at * 16);
    cols.set(s.colors, at * 3);
    const [dx, dy, dz] = [b.origin.x - origin.x, b.origin.y - origin.y, b.origin.z - origin.z];
    for (let k = at; k < at + s.n; k++) {
      mats[k * 16 + 12] = (mats[k * 16 + 12] as number) + dx;
      mats[k * 16 + 13] = (mats[k * 16 + 13] as number) + dy;
      mats[k * 16 + 14] = (mats[k * 16 + 14] as number) + dz;
    }
    at += s.n;
  }
  m.count = need;
  for (const a of [m.instanceMatrix, m.instanceColor]) {
    if (!a) continue;
    a.clearUpdateRanges();
    a.addUpdateRange(0, need * a.itemSize);
    a.needsUpdate = true;
  }
}

export function createPropField(material: Material): PropField {
  return new PropFieldImpl(material);
}
