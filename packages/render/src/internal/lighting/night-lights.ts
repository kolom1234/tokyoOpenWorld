// 야간 광원(M09-T03 — ADR-0078, 07 §6 "야간 광원"): 셀 lights.bin → (1) 카메라 300 m 안 켜진 광원 중 가까운 N개를 고정 PointLight 풀에 배정(ClusteredLighting —
// 광원 목록이 바뀌면 셰이더가 재컴파일되므로 풀 크기는 부팅 때 고정, 남는 슬롯은 세기 0·멀리), (2) 1.5 km 안 켜진 광원 전부 = 가산 발광 스프라이트(원거리 반짝임 + 블룸).
// 켜짐 = 일정 비율(schedule.ts) > 광원 해시(결정론). 0.25 s마다 또는 원점 재설정·이동 20 m에 다시 고른다.
import type { CellKey, Vec3d } from '@sanpo/core';
import { LIGHT_KIND, type LightRecord } from '@sanpo/tile-format';
import { cameraViewMatrix, float, positionLocal, smoothstep, uv, vec3, vec4 } from 'three/tsl';
import {
  AdditiveBlending,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  PointLight,
  Vector3,
} from 'three/webgpu';
import { hourJst, kelvinRgb, scheduleOn } from './schedule.ts';

/** 실제 광원 반경(m)·스프라이트 반경(m)·재선택 간격(s)·이동 문턱(m). */
const LIGHT_RADIUS_M = 300;
const SPRITE_RADIUS_M = 1500;
const RESELECT_S = 0.25;
const RESELECT_MOVE_M = 20;
export const SPRITE_CAPACITY = 6000;
/**
 * 장면 단위 환산: 광속(lm) / 4π = 광도(cd) × 이 배율 → three PointLight intensity. 대기(takram)의 휘도 배율에 맞춘 것이 아니라 밤 노출(자동 노출 상한)에서
 * 가로등 아래 노면이 보이도록 실제 GPU에서 맞춘 값(ADR-0078).
 */
export const LIGHT_SCENE_K = 0.12;
/** 스프라이트 밝기(장면 단위)·크기(m, 광속 1000 lm 기준). */
const SPRITE_GAIN = 0.35;
const SPRITE_SIZE_M = 0.3;
/** 이 거리(m)부터 스프라이트를 거리에 비례해 키운다(원거리 화면 크기 유지). */
const SPRITE_GROW_M = 120;

interface CellLights {
  originWF: Vec3d;
  recs: LightRecord[];
  /** 광원별 해시 0..1(켜짐 판정). */
  seeds: Float32Array;
  rgb: Float32Array;
}

export interface NightLights {
  readonly root: Group;
  /** ClusteredLighting에 들어가는 고정 풀(장면에 붙어 있다). */
  readonly pool: readonly PointLight[];
  addCell(key: CellKey, originWF: Vec3d, lights: readonly LightRecord[] | undefined): void;
  removeCell(key: CellKey): void;
  /** 프레임마다. camWF = 카메라 WF, origin = 렌더 원점, maxActive = 티어별 실제 광원 수. */
  update(o: {
    camWF: Vec3d;
    origin: Vec3d;
    rebased: boolean;
    night: number;
    gameMs: number;
    dtS: number;
    maxActive: number;
  }): void;
  stats(): { cells: number; lights: number; active: number; sprites: number };
  dispose(): void;
}

function seedOf(key: number, k: number): number {
  let h = Math.imul(key ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 0x1_0000_0000;
}

function spriteMesh(): InstancedMesh {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.blending = AdditiveBlending;
  m.name = 'night_glow';
  // 화면을 향한 사변형: 로컬 xy를 카메라 오른쪽·위 벡터(뷰 행렬 행)로.
  // 행벡터 × 뷰 행렬 = 뷰 회전의 역 → 로컬 xy가 화면 오른쪽·위 방향(월드).
  m.positionNode = vec4(positionLocal.x, positionLocal.y, 0, 0).mul(cameraViewMatrix).xyz;
  const r = uv().sub(0.5).length().mul(2);
  const core = float(1)
    .sub(smoothstep(0, 1, r))
    .pow(3);
  m.colorNode = vec4(vec3(SPRITE_GAIN), core);
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), m, SPRITE_CAPACITY);
  mesh.name = 'night/glow';
  mesh.frustumCulled = false;
  mesh.setColorAt(0, new Color(1, 1, 1));
  mesh.count = 0;
  return mesh;
}

type UpdateArgs = Parameters<NightLights['update']>[0];
interface Cand {
  d2: number;
  cell: CellLights;
  k: number;
}

/** 켜진 광원 중 스프라이트 반경 안 후보를 모아 거리순 정렬. 반환 = 전체 광원 수. */
function gatherCandidates(cells: ReadonlyMap<CellKey, CellLights>, o: UpdateArgs, cand: Cand[]): number {
  cand.length = 0;
  const h = hourJst(o.gameMs);
  let total = 0;
  for (const cl of cells.values()) {
    const dx0 = cl.originWF.x + 128 - o.camWF.x;
    const dz0 = cl.originWF.z + 128 - o.camWF.z;
    total += cl.recs.length;
    if (dx0 * dx0 + dz0 * dz0 > (SPRITE_RADIUS_M + 200) ** 2) continue;
    for (let k = 0; k < cl.recs.length; k++) {
      const r = cl.recs[k] as LightRecord;
      const on = scheduleOn(r.schedule, o.night, h);
      if (on <= 0 || (cl.seeds[k] as number) >= on) continue;
      const x = cl.originWF.x + r.posLocal[0] - o.camWF.x;
      const y = cl.originWF.y + r.posLocal[1] - o.camWF.y;
      const z = cl.originWF.z + r.posLocal[2] - o.camWF.z;
      const d2 = x * x + y * y + z * z;
      if (d2 < SPRITE_RADIUS_M * SPRITE_RADIUS_M) cand.push({ d2, cell: cl, k });
    }
  }
  cand.sort((a, b) => a.d2 - b.d2);
  return total;
}

/** 가까운 후보를 고정 풀에 배정(남는 슬롯 = 세기 0·멀리). 반환 = 켠 슬롯 수. */
function assignPool(pool: readonly PointLight[], cand: readonly Cand[], o: UpdateArgs): number {
  let active = 0;
  for (let i = 0; i < pool.length; i++) {
    const l = pool[i] as PointLight;
    const e = cand[i];
    if (!e || i >= o.maxActive || e.d2 > LIGHT_RADIUS_M * LIGHT_RADIUS_M || o.night <= 0) {
      l.intensity = 0;
      l.distance = 0.01;
      l.position.set(0, -1e5, 0);
      continue;
    }
    const r = e.cell.recs[e.k] as LightRecord;
    l.position.set(
      e.cell.originWF.x + r.posLocal[0] - o.origin.x,
      e.cell.originWF.y + r.posLocal[1] - o.origin.y,
      e.cell.originWF.z + r.posLocal[2] - o.origin.z,
    );
    const rgb = e.cell.rgb;
    l.color.setRGB(rgb[e.k * 3] as number, rgb[e.k * 3 + 1] as number, rgb[e.k * 3 + 2] as number);
    l.intensity = (r.lumen / (4 * Math.PI)) * LIGHT_SCENE_K * o.night;
    l.distance = r.range;
    active++;
  }
  return active;
}

const m4 = new Matrix4();
const v3 = new Vector3();
const col = new Color();

/** 스프라이트 = 실제 등기구가 있는 종류만(가로등·자판기 — 상점 앞·간판 광원은 빛 번짐 자리라 공중에 공이 뜬다). 반환 = 스프라이트 수. */
function fillSprites(sprites: InstancedMesh, cand: readonly Cand[], o: UpdateArgs): number {
  let ns = 0;
  for (const e of cand) {
    if (ns >= SPRITE_CAPACITY) break;
    const r = e.cell.recs[e.k] as LightRecord;
    if (r.kind !== LIGHT_KIND.streetLamp && r.kind !== LIGHT_KIND.vending) continue;
    const i = ns++;
    const s = SPRITE_SIZE_M * Math.sqrt(r.lumen / 1000) * Math.max(1, Math.sqrt(e.d2) / SPRITE_GROW_M);
    v3.set(
      e.cell.originWF.x + r.posLocal[0] - o.origin.x,
      e.cell.originWF.y + r.posLocal[1] - o.origin.y,
      e.cell.originWF.z + r.posLocal[2] - o.origin.z,
    );
    m4.makeScale(s, s, s).setPosition(v3);
    sprites.setMatrixAt(i, m4);
    const rgb = e.cell.rgb;
    col.setRGB(rgb[e.k * 3] as number, rgb[e.k * 3 + 1] as number, rgb[e.k * 3 + 2] as number);
    sprites.setColorAt(i, col.multiplyScalar(o.night));
  }
  sprites.count = ns;
  sprites.visible = ns > 0 && o.night > 0;
  sprites.instanceMatrix.needsUpdate = true;
  if (sprites.instanceColor) sprites.instanceColor.needsUpdate = true;
  return ns;
}

export function createNightLights(poolSize: number): NightLights {
  const root = new Group();
  root.name = 'nightLights';
  const pool: PointLight[] = [];
  for (let i = 0; i < poolSize; i++) {
    const l = new PointLight(0xffffff, 0, 0.01, 2);
    l.position.set(0, -1e5, 0);
    l.name = `nightLight${i}`;
    pool.push(l);
    root.add(l);
  }
  const sprites = spriteMesh();
  root.add(sprites);
  const cells = new Map<CellKey, CellLights>();
  let since = RESELECT_S;
  let last: Vec3d = { x: Number.NaN, y: 0, z: 0 };
  let st = { cells: 0, lights: 0, active: 0, sprites: 0 };
  const cand: Cand[] = [];
  const reselect = (o: UpdateArgs) => {
    const lights = gatherCandidates(cells, o, cand);
    const active = assignPool(pool, cand, o);
    const ns = fillSprites(sprites, cand, o);
    st = { cells: cells.size, lights, active, sprites: ns };
  };
  return {
    root,
    pool,
    addCell(key, originWF, lights) {
      if (!lights || lights.length === 0) return;
      const seeds = new Float32Array(lights.length);
      const rgb = new Float32Array(lights.length * 3);
      for (const [k, r] of lights.entries()) {
        seeds[k] = seedOf(key, k);
        rgb.set(kelvinRgb(r.kelvin), k * 3);
      }
      cells.set(key, { originWF: { ...originWF }, recs: [...lights], seeds, rgb });
      since = RESELECT_S;
    },
    removeCell(key) {
      if (cells.delete(key)) since = RESELECT_S;
    },
    update(o) {
      since += o.dtS;
      const moved = Math.hypot(o.camWF.x - last.x, o.camWF.z - last.z) > RESELECT_MOVE_M || Number.isNaN(last.x);
      if (!o.rebased && !moved && since < RESELECT_S) return;
      since = 0;
      last = { ...o.camWF };
      reselect(o);
    },
    stats: () => ({ ...st }),
    dispose() {
      sprites.geometry.dispose();
      (sprites.material as MeshBasicNodeMaterial).dispose();
      for (const l of pool) l.dispose();
    },
  };
}
