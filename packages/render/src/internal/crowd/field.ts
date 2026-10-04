// 군중 필드(M06-T01): sim SAB 인스턴스(stride 8) → 프레임마다 외삽(30 Hz 틱 사이 — 속력·주기율) → 베이스(variant 가중 선택)·LOD(거리)·시야 원뿔 →
// (베이스 × LOD) 풀 48개(Mesh + InstancedBufferGeometry, 머티리얼 1개). 그림자는 LOD0만(근거리 — 캐시 무효화 비용 제한). see ADR-0057, docs/10-simulation.md §1
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
import type { CrowdAssets, CrowdBase } from './assets.ts';

/** LOD별 풀 용량(베이스마다). 넘치면 버리고 stats.dropped. */
export const CROWD_POOL_CAPACITY = [48, 128, 320, 640] as const;
const STRIDE = 8;
/** 외삽 상한(s) — 워커가 멈추면 제자리. */
const MAX_AGE_S = 0.12;

export interface CrowdFieldStats {
  instances: number;
  visible: number;
  pools: number;
  dropped: number;
  casters: number;
  /** LOD별 그린 수. */
  lods: number[];
  ready: boolean;
}

interface Pool {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  pos: InstancedBufferAttribute;
  anim: InstancedBufferAttribute;
  vars: InstancedBufferAttribute;
  n: number;
}

export interface CrowdField {
  readonly root: Group;
  attach(assets: CrowdAssets, material: Material): void;
  bind(src: SharedInstanceBuffer): void;
  /** 카메라(렌더 좌표)·렌더 원점 → 풀 채우기. 반환 = 그림자 드리우는 인스턴스가 있는지(그림자 캐시 무효화). */
  update(camera: PerspectiveCamera, renderOriginWF: Readonly<Vec3d>): boolean;
  primeForCompile(): () => void;
  stats(): CrowdFieldStats;
  dispose(): void;
}

function createPool(base: CrowdBase, lod: number, material: Material, layer: number): Pool {
  const cap = CROWD_POOL_CAPACITY[lod] ?? 64;
  const geo = new InstancedBufferGeometry();
  for (const [name, a] of Object.entries(base.attributes)) geo.setAttribute(name, a);
  geo.setIndex(base.lods[lod]?.index ?? null);
  const pos = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const anim = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  const vars = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
  geo.setAttribute('_ipos', pos);
  geo.setAttribute('_ianim', anim);
  geo.setAttribute('_ivar', vars);
  geo.instanceCount = 0;
  const mesh = new Mesh(geo, material);
  mesh.name = `crowd/${base.id}/lod${lod}`;
  mesh.frustumCulled = false;
  mesh.castShadow = lod === 0;
  mesh.receiveShadow = true;
  mesh.userData.layer = layer;
  return { mesh, geo, pos, anim, vars, n: 0 };
}

/** variant(u16) → 베이스(가중치 누적). */
function basePicker(bases: readonly CrowdBase[]): (variant: number) => number {
  const total = bases.reduce((s, b) => s + b.weight, 0) || 1;
  const cum: number[] = [];
  let acc = 0;
  for (const b of bases) {
    acc += b.weight / total;
    cum.push(acc);
  }
  return (variant) => {
    const u = (variant % 65536) / 65536;
    const i = cum.findIndex((c) => u < c);
    return i < 0 ? bases.length - 1 : i;
  };
}

/** 풀 버퍼 확정: 인스턴스 수·보임·쓴 범위만 업로드. 반환 = 그리는 풀 수. */
function flushPools(pools: readonly Pool[][]): number {
  let drawn = 0;
  for (const row of pools)
    for (const p of row) {
      p.geo.instanceCount = p.n;
      p.mesh.visible = p.n > 0;
      if (p.n === 0) continue;
      drawn++;
      for (const a of [p.pos, p.anim, p.vars]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, p.n * 4);
        a.needsUpdate = true;
      }
    }
  return drawn;
}

/** 인스턴스 1개 기록: 위치·모델 yaw(+π — 모델 정면 +Z), (행, 프레임 수, 프레임 위치, 키 배율), (층, 밝기). */
function writeInstance(
  p: Pool,
  x: number,
  y: number,
  z: number,
  yaw: number,
  anim: readonly number[],
  vars: readonly number[],
): void {
  const o = p.n * 4;
  p.pos.array.set([x, y, z, yaw + Math.PI], o);
  p.anim.array.set(anim, o);
  p.vars.array.set(vars, o);
  p.n++;
}

interface FillCtx {
  assets: CrowdAssets;
  pools: Pool[][];
  pick: (v: number) => number;
  st: CrowdFieldStats;
  fwd: Vector3;
}

/** SAB 인스턴스 → 외삽 → LOD·시야 → 풀. */
function fillPools(c: FillCtx, src: SharedInstanceBuffer, camera: PerspectiveCamera, o: Readonly<Vec3d>): void {
  const { st, fwd } = c;
  for (const row of c.pools) for (const p of row) p.n = 0;
  const n = src.count();
  const data = src.data;
  const an = src.anchorWF();
  const tick = (src as { tickAbsMs?: () => number }).tickAbsMs?.() ?? 0;
  const age = Math.min(Math.max((performance.timeOrigin + performance.now() - tick) / 1000, 0), MAX_AGE_S);
  const cam = camera.position;
  camera.getWorldDirection(fwd);
  const halfDiag = Math.atan(Math.tan(((camera.fov * Math.PI) / 180) * 0.5) * Math.hypot(1, camera.aspect));
  Object.assign(st, { instances: n, visible: 0, dropped: 0, casters: 0, lods: [0, 0, 0, 0] });
  for (let i = 0; i < n; i++) {
    const k = i * STRIDE;
    const yaw = data[k + 3] as number;
    const clip = Math.floor(data[k + 4] as number);
    const speed = ((data[k + 4] as number) - clip) * 10;
    const x = (data[k] as number) + an.x - o.x - Math.sin(yaw) * speed * age;
    const y = (data[k + 1] as number) + an.y - o.y;
    const z = (data[k + 2] as number) + an.z - o.z - Math.cos(yaw) * speed * age;
    const dx = x - cam.x;
    const dy = y + 0.9 - cam.y;
    const dz = z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    const v = data[k + 6] as number;
    const b = c.pick(v);
    const base = c.assets.bases[b] as CrowdBase;
    const lod = base.lods.findIndex((l) => d <= l.maxDistM);
    if (lod < 0) continue;
    const cone = Math.cos(Math.min(halfDiag + Math.atan(1.4 / d), Math.PI));
    if (d > 2 && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d < cone) continue;
    const pool = c.pools[b]?.[lod];
    if (!pool || pool.n >= (CROWD_POOL_CAPACITY[lod] ?? 0)) {
      st.dropped++;
      continue;
    }
    const cl = base.clips[clip] ?? base.clips[0] ?? { start: 0, frames: 1 };
    const phase = ((data[k + 5] as number) + (data[k + 7] as number) * age) % 1;
    const scale = 0.95 + 0.1 * (((v >> 8) & 15) / 15);
    writeInstance(
      pool,
      x,
      y,
      z,
      yaw,
      [base.row0 + cl.start, cl.frames, phase * cl.frames, scale],
      [b, 0.92 + 0.16 * (((v >> 4) & 15) / 15), 0, 0],
    );
    st.visible++;
    st.lods[lod] = (st.lods[lod] ?? 0) + 1;
    if (lod === 0) st.casters++;
  }
}

export function createCrowdField(): CrowdField {
  const root = new Group();
  root.name = 'crowd';
  let fill: FillCtx | undefined;
  let src: SharedInstanceBuffer | undefined;
  const st: CrowdFieldStats = {
    instances: 0,
    visible: 0,
    pools: 0,
    dropped: 0,
    casters: 0,
    lods: [0, 0, 0, 0],
    ready: false,
  };
  const pools = (): Pool[][] => fill?.pools ?? [];
  return {
    root,
    attach(a, material) {
      const ps = a.bases.map((b, i) => b.lods.map((_, l) => createPool(b, l, material, i)));
      for (const row of ps) for (const p of row) root.add(p.mesh);
      fill = { assets: a, pools: ps, pick: basePicker(a.bases), st, fwd: new Vector3() };
      st.ready = true;
    },
    bind(s) {
      src = s;
    },
    update(camera, o) {
      if (!fill || !src) return false;
      fillPools(fill, src, camera, o);
      st.pools = flushPools(fill.pools);
      return st.casters > 0;
    },
    primeForCompile() {
      for (const [b, row] of pools().entries())
        for (const p of row) {
          p.n = 0;
          writeInstance(p, 0, -1000, 0, 0, [0, 1, 0, 1], [b, 1, 0, 0]);
        }
      flushPools(pools());
      return () => {
        for (const row of pools()) for (const p of row) p.n = 0;
        flushPools(pools());
      };
    },
    stats: () => ({ ...st, lods: [...st.lods] }),
    dispose() {
      for (const row of pools()) for (const p of row) p.geo.dispose();
      fill = undefined;
    },
  };
}
