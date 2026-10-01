// 간판 필드(M05-T06): 셀 props.inst 중 간판 종류(돌출·입간판·옥상) → 종류별 풀 1개(Mesh + InstancedBufferGeometry, 셰이더 배치 — 나무와 같은 이유, ADR-0052).
// 카메라에서 종류별 거리 안 인스턴스를 가까운 순으로 용량까지 채운다(15 m 이동·셀 변경·원점 재설정 때만). 브랜드·크기 변형 = WF 위치 해시(결정론). see ADR-0054
import type { CellKey, Vec3d } from '@sanpo/core';
import { PROP_TYPE, type PropBatch } from '@sanpo/tile-format';
import {
  type BufferGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
} from 'three/webgpu';
import { SIGN_BRANDS } from './atlas.ts';
import { projectingSign, rooftopSign, standingSign } from './models.ts';

interface SignType {
  id: number;
  cap: number;
  /** 보이는 거리(m). */
  far: number;
  make: () => BufferGeometry;
}

export const SIGN_TYPES: readonly SignType[] = [
  { id: PROP_TYPE.signProjecting, cap: 6144, far: 320, make: projectingSign },
  { id: PROP_TYPE.signStanding, cap: 1536, far: 120, make: standingSign },
  { id: PROP_TYPE.signRooftop, cap: 512, far: 1500, make: rooftopSign },
];
const SIGN_IDS: ReadonlySet<number> = new Set(SIGN_TYPES.map((t) => t.id));
const REFILL_M = 15;

export interface SignStats {
  instances: number;
  visible: number;
  pools: number;
  ready: boolean;
}

export interface SignField {
  readonly root: Group;
  addCell(key: CellKey, originWF: Readonly<Vec3d>, props: readonly PropBatch[] | undefined): void;
  removeCell(key: CellKey): void;
  /** 반환 = 풀을 다시 썼는가. */
  update(camWF: Readonly<Vec3d>, renderOriginWF: Readonly<Vec3d>, force: boolean): boolean;
  attach(material: Material): void;
  primeForCompile(): () => void;
  stats(): SignStats;
  dispose(): void;
}

/** WF 위치 → 32비트 해시(브랜드·크기). */
export function signHash(x: number, y: number, z: number): number {
  let h = Math.imul(Math.round(x * 4) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.round(y * 4) ^ (h >>> 15), 0xc2b2ae35);
  h = Math.imul(h ^ Math.round(z * 4) ^ (h >>> 13), 0x27d4eb2f);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 인스턴스 → (브랜드, 배율 x·y·z). 돌출 = 0.85–1.1 균일, 옥상 = 파이프라인 scale(폭/10 m), 입간판 = 1. */
export function signVariant(
  type: number,
  x: number,
  y: number,
  z: number,
  scale: number,
): [number, number, number, number] {
  const h = signHash(x, y, z);
  const brand = h % SIGN_BRANDS;
  if (type === PROP_TYPE.signProjecting) {
    const s = 0.85 + ((h >>> 8) % 256) / 1024;
    return [brand, s, s, s];
  }
  if (type === PROP_TYPE.signRooftop) return [brand, scale, scale, scale];
  return [brand, 1, 1, 1];
}

interface Pool {
  type: SignType;
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  ipos: InstancedBufferAttribute;
  isig: InstancedBufferAttribute;
}

function makePool(t: SignType): Pool {
  const base = t.make();
  const geo = new InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'uv', '_face']) geo.setAttribute(name, base.getAttribute(name));
  if (base.index) geo.setIndex(base.index);
  const ipos = new InstancedBufferAttribute(new Float32Array(t.cap * 4), 4);
  const isig = new InstancedBufferAttribute(new Float32Array(t.cap * 4), 4);
  geo.setAttribute('_ipos', ipos);
  geo.setAttribute('_isig', isig);
  geo.instanceCount = 0;
  const mesh = new Mesh(geo);
  mesh.name = `signs/${t.id}`;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.visible = false;
  return { type: t, mesh, geo, ipos, isig };
}

type Cells = Map<CellKey, Map<number, Float64Array>>;

/** 풀 1개 채우기: 거리 안 후보 → (넘치면) 가까운 순 → 용량까지(렌더 원점 상대). 반환 = 쓴 수. */
function fillPool(p: Pool, cells: Cells, cam: Readonly<Vec3d>, o: Readonly<Vec3d>, ready: boolean): number {
  const cand: [number, Float64Array, number][] = [];
  const far2 = p.type.far * p.type.far;
  for (const byType of cells.values()) {
    const r = byType.get(p.type.id);
    if (!r) continue;
    for (let i = 0; i < r.length; i += 5) {
      const d2 = ((r[i] as number) - cam.x) ** 2 + ((r[i + 2] as number) - cam.z) ** 2;
      if (d2 < far2) cand.push([d2, r, i]);
    }
  }
  if (cand.length > p.type.cap) cand.sort((a, b) => a[0] - b[0]);
  const n = Math.min(cand.length, p.type.cap);
  const ip = p.ipos.array as Float32Array;
  const is = p.isig.array as Float32Array;
  for (let k = 0; k < n; k++) {
    const [, r, i] = cand[k] as [number, Float64Array, number];
    const [x, y, z] = [r[i] as number, r[i + 1] as number, r[i + 2] as number];
    ip.set([x - o.x, y - o.y, z - o.z, r[i + 3] as number], k * 4);
    is.set(signVariant(p.type.id, x, y, z, r[i + 4] as number), k * 4);
  }
  p.geo.instanceCount = n;
  p.mesh.visible = ready && n > 0;
  for (const a of [p.ipos, p.isig]) {
    a.clearUpdateRanges();
    if (n > 0) a.addUpdateRange(0, n * 4);
    a.needsUpdate = true;
  }
  return n;
}

/** 셀 props 배치 → 간판 종류만, WF(x, y, z, yaw, scale) 배열. */
function signRecords(originWF: Readonly<Vec3d>, props: readonly PropBatch[] | undefined): Map<number, Float64Array> {
  const byType = new Map<number, Float64Array>();
  for (const b of props ?? []) {
    if (!SIGN_IDS.has(b.typeId)) continue;
    const t = b.transforms;
    const out = new Float64Array(t.length);
    for (let i = 0; i < t.length; i += 5) {
      out[i] = (t[i] as number) + originWF.x;
      out[i + 1] = (t[i + 1] as number) + originWF.y;
      out[i + 2] = (t[i + 2] as number) + originWF.z;
      out[i + 3] = t[i + 3] as number;
      out[i + 4] = t[i + 4] as number;
    }
    byType.set(b.typeId, out);
  }
  return byType;
}

function primePools(pools: readonly Pool[]): () => void {
  const saved = pools.map((p) => [p.geo.instanceCount, p.mesh.visible] as const);
  for (const p of pools) {
    p.geo.instanceCount = 1;
    p.mesh.visible = true;
  }
  return () => {
    pools.forEach((p, i) => {
      p.geo.instanceCount = (saved[i] as readonly [number, boolean])[0];
      p.mesh.visible = (saved[i] as readonly [number, boolean])[1];
    });
  };
}

export function createSignField(): SignField {
  const root = new Group();
  root.name = 'signs';
  root.matrixAutoUpdate = false;
  const pools = SIGN_TYPES.map(makePool);
  for (const p of pools) root.add(p.mesh);
  const cells: Cells = new Map();
  let ready = false;
  let dirty = true;
  let last: Vec3d | null = null;
  let lastOrigin: Vec3d | null = null;
  let visible = 0;
  return {
    root,
    addCell(key, originWF, props) {
      const byType = signRecords(originWF, props);
      if (byType.size > 0 || cells.has(key)) dirty = true;
      if (byType.size > 0) cells.set(key, byType);
      else cells.delete(key);
    },
    removeCell(key) {
      if (cells.delete(key)) dirty = true;
    },
    update(cam, origin, force) {
      const moved = !last || Math.hypot(cam.x - last.x, cam.z - last.z) > REFILL_M;
      const rebased =
        !lastOrigin || lastOrigin.x !== origin.x || lastOrigin.y !== origin.y || lastOrigin.z !== origin.z;
      if (!(force || dirty || moved || rebased)) return false;
      visible = pools.reduce((n, p) => n + fillPool(p, cells, cam, origin, ready), 0);
      last = { ...cam };
      lastOrigin = { ...origin };
      dirty = false;
      return true;
    },
    attach(material) {
      for (const p of pools) p.mesh.material = material;
      ready = true;
      dirty = true;
    },
    primeForCompile() {
      const restore = primePools(pools);
      return () => {
        restore();
        dirty = true;
      };
    },
    stats: () => ({
      instances: [...cells.values()].reduce((n, m) => n + [...m.values()].reduce((a, r) => a + r.length / 5, 0), 0),
      visible,
      pools: pools.filter((p) => p.mesh.visible).length,
      ready,
    }),
    dispose() {
      for (const p of pools) {
        p.geo.dispose();
        p.mesh.removeFromParent();
      }
      cells.clear();
    },
  };
}
