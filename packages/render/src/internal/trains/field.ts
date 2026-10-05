// 열차 필드(M07-T03, ADR-0072): sim 열차 칸 버퍼(메인 스레드 — 프레임마다 정확한 값, stride 8: x,y,z·yaw·pitch·속력·노선색·코드) →
// 차형 × 칸 종류 × LOD(45/300/1600 m)·시야 원뿔 → 풀 24개(Mesh + InstancedBufferGeometry, 머티리얼 1개). 그림자 = LOD 0–1.
// 코드 = 정수(차형 × 4 + 종류) + 소수((문 + 1) / 2 × 0.999). `_imove` = 속력 × 프레임 dt(진행 방향) — TAA 모션 벡터.
import type { SharedInstanceBuffer, Vec3d } from '@sanpo/core';
import {
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
  type PerspectiveCamera,
  Vector3,
} from 'three/webgpu';
import type { TrainStationsData } from '../../api.ts';
import { buildTrainGeometry, TRAIN_CAR_KINDS, TRAIN_CAR_TYPES } from './models.ts';
import { CAR_DIMS, type CarLod, TRAIN_LOD_M } from './parts.ts';
import { createStationsField } from './stations.ts';

export const TRAIN_POOL_CAPACITY = [24, 64, 160] as const;
const STRIDE = 8;
const SHADOW_LODS = 2;

export interface TrainFieldStats {
  cars: number;
  visible: number;
  pools: number;
  dropped: number;
  lods: number[];
  ready: boolean;
}

interface Pool {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  pos: InstancedBufferAttribute;
  vars: InstancedBufferAttribute;
  move: InstancedBufferAttribute;
  n: number;
}

export interface TrainField {
  readonly root: Group;
  attach(material: Material): void;
  bind(src: SharedInstanceBuffer): void;
  /** 승강장·홈도어(M07-T04): 정적 메시 + 문 인스턴스(머티리얼 = 열차). null = 제거. */
  setStations(d: TrainStationsData | null): void;
  update(camera: PerspectiveCamera, renderOriginWF: Readonly<Vec3d>): boolean;
  primeForCompile(): () => void;
  stats(): TrainFieldStats;
  dispose(): void;
}

/** 칸 코드 → 차형·종류·문(−1..1). */
export function decodeCarCode(v: number): { type: number; kind: number; doors: number } {
  const k = Math.floor(v);
  return { type: Math.floor(k / 4), kind: k % 4, doors: Math.min(Math.max(((v - k) / 0.999) * 2 - 1, -1), 1) };
}

function createPool(type: number, kind: number, lod: CarLod, material: Material): Pool {
  const cap = TRAIN_POOL_CAPACITY[lod];
  const base = buildTrainGeometry(type, kind, lod);
  const geo = new InstancedBufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) geo.setAttribute(name, a);
  geo.setIndex(base.index);
  const pos = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const vars = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const move = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  geo.setAttribute('_ipos', pos);
  geo.setAttribute('_ivar', vars);
  geo.setAttribute('_imove', move);
  geo.instanceCount = 0;
  const mesh = new Mesh(geo, material);
  mesh.name = `train/${type}/${kind}/lod${lod}`;
  mesh.frustumCulled = false;
  mesh.castShadow = lod < SHADOW_LODS;
  mesh.receiveShadow = true;
  return { mesh, geo, pos, vars, move, n: 0 };
}

function flush(pools: readonly Pool[]): number {
  let drawn = 0;
  for (const p of pools) {
    p.geo.instanceCount = p.n;
    p.mesh.visible = p.n > 0;
    if (p.n === 0) continue;
    drawn++;
    for (const a of [p.pos, p.vars, p.move]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, p.n * 4);
      a.needsUpdate = true;
    }
  }
  return drawn;
}

function write(p: Pool, at: readonly number[], vars: readonly number[], move: readonly number[]): void {
  const o = p.n * 4;
  p.pos.array.set(at, o);
  p.vars.array.set(vars, o);
  p.move.array.set(move, o);
  p.n++;
}

const poolIndex = (type: number, kind: number, lod: number): number => (type * TRAIN_CAR_KINDS + kind) * 3 + lod;

interface Fill {
  pools: Pool[];
  st: TrainFieldStats;
  fwd: Vector3;
  lastMs: number;
}

function fill(c: Fill, src: SharedInstanceBuffer, camera: PerspectiveCamera, o: Readonly<Vec3d>): void {
  for (const p of c.pools) p.n = 0;
  const n = src.count();
  const an = src.anchorWF();
  const d = src.data;
  const cam = camera.position;
  camera.getWorldDirection(c.fwd);
  const halfDiag = Math.atan(Math.tan(((camera.fov * Math.PI) / 180) * 0.5) * Math.hypot(1, camera.aspect));
  const now = performance.now();
  const dt = Math.min(Math.max((now - c.lastMs) / 1000, 0), 0.1);
  c.lastMs = now;
  Object.assign(c.st, { cars: n, visible: 0, dropped: 0, lods: [0, 0, 0] });
  for (let i = 0; i < n; i++) {
    const k = i * STRIDE;
    const x = (d[k] as number) + an.x - o.x;
    const y = (d[k + 1] as number) + an.y - o.y;
    const z = (d[k + 2] as number) + an.z - o.z;
    const { type, kind, doors } = decodeCarCode(d[k + 7] as number);
    const dx = x - cam.x;
    const dy = y + 2 - cam.y;
    const dz = z - cam.z;
    const dist = Math.hypot(dx, dy, dz);
    const lod = TRAIN_LOD_M.findIndex((m) => dist <= m);
    if (lod < 0 || type >= TRAIN_CAR_TYPES) continue;
    const r = (CAR_DIMS[type]?.L ?? 20) / 2 + 2;
    const cone = Math.cos(Math.min(halfDiag + Math.atan(r / Math.max(dist, 1e-3)), Math.PI));
    if (dist > r && (dx * c.fwd.x + dy * c.fwd.y + dz * c.fwd.z) / dist < cone) continue;
    const pool = c.pools[poolIndex(type, kind, lod)];
    if (!pool || pool.n >= (TRAIN_POOL_CAPACITY[lod as CarLod] ?? 0)) {
      c.st.dropped++;
      continue;
    }
    const yaw = d[k + 3] as number;
    const step = (d[k + 5] as number) * dt;
    write(
      pool,
      [x, y, z, yaw],
      [d[k + 4] as number, doors, d[k + 6] as number, 0],
      [-Math.sin(yaw) * step, 0, -Math.cos(yaw) * step, 0],
    );
    c.st.visible++;
    c.st.lods[lod] = (c.st.lods[lod] ?? 0) + 1;
  }
}

export function createTrainField(): TrainField {
  const root = new Group();
  root.name = 'trains';
  let f: Fill | undefined;
  let src: SharedInstanceBuffer | undefined;
  let material: Material | undefined;
  let stationsData: TrainStationsData | null = null;
  const stations = createStationsField();
  root.add(stations.root);
  const st: TrainFieldStats = { cars: 0, visible: 0, pools: 0, dropped: 0, lods: [0, 0, 0], ready: false };
  return {
    root,
    attach(m) {
      if (f) return;
      material = m;
      stations.set(stationsData, m);
      const pools: Pool[] = [];
      for (let t = 0; t < TRAIN_CAR_TYPES; t++)
        for (let k = 0; k < TRAIN_CAR_KINDS; k++)
          for (const l of [0, 1, 2] as const) pools[poolIndex(t, k, l)] = createPool(t, k, l, m);
      for (const p of pools) root.add(p.mesh);
      f = { pools, st, fwd: new Vector3(), lastMs: performance.now() };
      st.ready = true;
    },
    bind(s) {
      src = s;
    },
    setStations(d) {
      stationsData = d;
      stations.set(d, material);
    },
    update(camera, o) {
      stations.update(o);
      if (!f || !src) return false;
      fill(f, src, camera, o);
      st.pools = flush(f.pools);
      return (st.lods[0] ?? 0) + (st.lods[1] ?? 0) > 0;
    },
    primeForCompile() {
      const pools = f?.pools ?? [];
      for (const p of pools) {
        p.n = 0;
        write(p, [0, -1000, 0, 0], [0, 0, 0xffffff, 0], [0, 0, 0, 0]);
      }
      flush(pools);
      return () => {
        for (const p of pools) p.n = 0;
        flush(pools);
      };
    },
    stats: () => ({ ...st, lods: [...st.lods] }),
    dispose() {
      for (const p of f?.pools ?? []) p.geo.dispose();
      stations.dispose();
      f = undefined;
    },
  };
}
