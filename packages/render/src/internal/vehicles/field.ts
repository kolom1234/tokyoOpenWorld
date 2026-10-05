// 차량 필드(M06-T06, ADR-0066): sim 교통 SAB(stride 8: x,y,z·yaw·속력·바퀴 회전·variant·flags) → 프레임마다 외삽(30 Hz 틱 사이 — 속력·바퀴) →
// 차종(variant 하위 3비트)·LOD(거리 35/110/520 m)·시야 원뿔 → (차종 × LOD) 풀 21개(Mesh + InstancedBufferGeometry, 머티리얼 1개).
// 색 = variant 색 5비트·씨앗 → 도장·액센트(models.vehicleColors). 그림자 = LOD 0–1(110 m — 큰 물체라 군중보다 멀리). `_imove` = 지난 프레임 변위(모션 벡터 — TAA).
import { type SharedInstanceBuffer, VEHICLE_TYPES, type Vec3d } from '@sanpo/core';
import {
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  Mesh,
  type PerspectiveCamera,
  Vector3,
} from 'three/webgpu';
import { buildVehicleGeometry, VEHICLE_LOD_M, type VehicleLod, vehicleColors } from './models.ts';

/** LOD별 풀 용량(차종마다). 넘치면 버리고 stats.dropped. */
export const VEHICLE_POOL_CAPACITY = [24, 48, 96] as const;
const STRIDE = 8;
/** 외삽 상한(s) — 워커가 멈추면 제자리. */
const MAX_AGE_S = 0.12;
/** sim 바퀴 반지름(traffic-sim WHEEL_R) — 외삽 회전 수. */
const SIM_WHEEL_R = 0.33;
const SHADOW_LODS = 2;

export interface VehicleFieldStats {
  instances: number;
  visible: number;
  pools: number;
  dropped: number;
  casters: number;
  lods: number[];
  ready: boolean;
}

interface Pool {
  mesh: Mesh;
  geo: InstancedBufferGeometry;
  pos: InstancedBufferAttribute;
  vars: InstancedBufferAttribute;
  /** 지난 프레임 변위(모션 벡터). */
  move: InstancedBufferAttribute;
  n: number;
}

export interface VehicleField {
  readonly root: Group;
  /** 절차 모델 풀 생성(머티리얼 1개). 두 번째부터 무시. */
  attach(material: Material): void;
  bind(src: SharedInstanceBuffer): void;
  /** 카메라(렌더 좌표)·렌더 원점 → 풀 채우기. 반환 = 그림자 드리우는 인스턴스가 있는지. */
  update(camera: PerspectiveCamera, renderOriginWF: Readonly<Vec3d>): boolean;
  primeForCompile(): () => void;
  stats(): VehicleFieldStats;
  dispose(): void;
}

function createPool(type: number, lod: VehicleLod, material: Material): Pool {
  const cap = VEHICLE_POOL_CAPACITY[lod];
  const base = buildVehicleGeometry(type, lod);
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
  mesh.name = `vehicle/${VEHICLE_TYPES[type]?.name}/lod${lod}`;
  mesh.frustumCulled = false;
  mesh.castShadow = lod < SHADOW_LODS;
  mesh.receiveShadow = true;
  return { mesh, geo, pos, vars, move, n: 0 };
}

function flushPools(pools: readonly Pool[][]): number {
  let drawn = 0;
  for (const row of pools)
    for (const p of row) {
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

interface FillCtx {
  pools: Pool[][];
  st: VehicleFieldStats;
  fwd: Vector3;
  /** 지난 채우기 시각(ms) — 프레임 변위. */
  lastMs: number;
}

/** SAB 칸 하나 → (외삽 위치, 차종, 바퀴, 색). */
function decode(data: Float32Array, k: number, an: Readonly<Vec3d>, o: Readonly<Vec3d>, age: number, dt: number) {
  const yaw = data[k + 3] as number;
  const speed = data[k + 4] as number;
  const step = speed * dt;
  const v = Math.round(data[k + 6] as number);
  const type = Math.min(v & 7, VEHICLE_TYPES.length - 1);
  const [paint, accent] = vehicleColors(type, (v >> 3) & 31, (v >> 8) & 255);
  return {
    x: (data[k] as number) + an.x - o.x - Math.sin(yaw) * speed * age,
    y: (data[k + 1] as number) + an.y - o.y,
    z: (data[k + 2] as number) + an.z - o.z - Math.cos(yaw) * speed * age,
    yaw,
    type,
    wheel: ((data[k + 5] as number) + (speed * age) / (2 * Math.PI * SIM_WHEEL_R)) % 1,
    flags: Math.round(data[k + 7] as number),
    paint,
    accent,
    move: [-Math.sin(yaw) * step, 0, -Math.cos(yaw) * step, step / (2 * Math.PI * SIM_WHEEL_R)],
  };
}

function fillPools(c: FillCtx, src: SharedInstanceBuffer, camera: PerspectiveCamera, o: Readonly<Vec3d>): void {
  const { st, fwd } = c;
  for (const row of c.pools) for (const p of row) p.n = 0;
  const n = src.count();
  const an = src.anchorWF();
  const tick = (src as { tickAbsMs?: () => number }).tickAbsMs?.() ?? 0;
  const age = Math.min(Math.max((performance.timeOrigin + performance.now() - tick) / 1000, 0), MAX_AGE_S);
  const cam = camera.position;
  camera.getWorldDirection(fwd);
  const halfDiag = Math.atan(Math.tan(((camera.fov * Math.PI) / 180) * 0.5) * Math.hypot(1, camera.aspect));
  Object.assign(st, { instances: n, visible: 0, dropped: 0, casters: 0, lods: [0, 0, 0] });
  const now = performance.now();
  const dt = Math.min(Math.max((now - c.lastMs) / 1000, 0), 0.1);
  c.lastMs = now;
  for (let i = 0; i < n; i++) {
    const d0 = decode(src.data, i * STRIDE, an, o, age, dt);
    const dx = d0.x - cam.x;
    const dy = d0.y + 1 - cam.y;
    const dz = d0.z - cam.z;
    const d = Math.hypot(dx, dy, dz);
    const lod = VEHICLE_LOD_M.findIndex((m) => d <= m);
    if (lod < 0) continue;
    const r = (VEHICLE_TYPES[d0.type]?.lengthM ?? 5) / 2 + 1;
    const cone = Math.cos(Math.min(halfDiag + Math.atan(r / Math.max(d, 1e-3)), Math.PI));
    if (d > r && (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d < cone) continue;
    const pool = c.pools[d0.type]?.[lod];
    if (!pool || pool.n >= (VEHICLE_POOL_CAPACITY[lod as VehicleLod] ?? 0)) {
      st.dropped++;
      continue;
    }
    write(pool, [d0.x, d0.y, d0.z, d0.yaw], [d0.wheel, d0.flags, d0.paint, d0.accent], d0.move);
    st.visible++;
    st.lods[lod] = (st.lods[lod] ?? 0) + 1;
    if (lod < SHADOW_LODS) st.casters++;
  }
}

export function createVehicleField(): VehicleField {
  const root = new Group();
  root.name = 'vehicles';
  let fill: FillCtx | undefined;
  let src: SharedInstanceBuffer | undefined;
  const st: VehicleFieldStats = {
    instances: 0,
    visible: 0,
    pools: 0,
    dropped: 0,
    casters: 0,
    lods: [0, 0, 0],
    ready: false,
  };
  const pools = (): Pool[][] => fill?.pools ?? [];
  return {
    root,
    attach(material) {
      if (fill) return;
      const ps = VEHICLE_TYPES.map((_, t) => ([0, 1, 2] as const).map((l) => createPool(t, l, material)));
      for (const row of ps) for (const p of row) root.add(p.mesh);
      fill = { pools: ps, st, fwd: new Vector3(), lastMs: performance.now() };
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
      for (const row of pools())
        for (const p of row) {
          p.n = 0;
          write(p, [0, -1000, 0, 0], [0, 0, 0xffffff, 0xffffff], [0, 0, 0, 0]);
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
