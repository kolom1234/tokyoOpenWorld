// 소품 블록·LOD 띠(M05-T03): 셀 소품을 64 m 블록으로 나눠 종류별 조각(셀 로컬 행렬·색)을 만들고, 블록 AABB 3D 거리로 LOD 띠(히스테리시스 2 m)를 정한다.
// 풀 채우기는 pools.ts. see ADR-0051
import type { CellKey, Vec3d } from '@sanpo/core';
import { PROP_TYPE, type PropBatch } from '@sanpo/tile-format';
import { PROP_TYPE_IDS } from './models.ts';

const BLOCK_M = 64;
/** LOD0/1 경계(m). LOD2 끝 = 종류별 FAR_M. */
const NEAR_M = [40, 150] as const;
const HYST_M = 2;
export const FAR_M: Readonly<Record<number, number>> = {
  [PROP_TYPE.utilityPole]: 600,
  [PROP_TYPE.signalVehicle]: 400,
  [PROP_TYPE.streetLamp]: 350,
  [PROP_TYPE.vendingMachine]: 250,
  [PROP_TYPE.phoneBooth]: 250,
  [PROP_TYPE.guardRail]: 250,
  [PROP_TYPE.busStop]: 200,
  [PROP_TYPE.manhole]: 80,
};
export const DEFAULT_FAR_M = 150;
/** 자판기 가상 브랜드 몸체색(선형 근사, 로고 없음). */
const VENDING_TINTS: readonly (readonly [number, number, number])[] = [
  [0.75, 0.05, 0.05],
  [0.04, 0.18, 0.55],
  [1, 1, 1],
  [0.06, 0.35, 0.1],
  [0.9, 0.55, 0.02],
];

export interface TypeSlice {
  n: number;
  mats: Float32Array;
  colors: Float32Array;
  band: number;
  /** 신호 현시 코드(신호 종류만 — props.inst 5번째 칸, M06-T02). 옛 빌드 = 1(코드 없음). */
  codes?: Float32Array;
}

const isSignal = (t: number): boolean => t === PROP_TYPE.signalVehicle || t === PROP_TYPE.signalPedestrian;

export interface Block {
  key: CellKey;
  origin: Vec3d;
  /** 셀 로컬 AABB. */
  min: [number, number, number];
  max: [number, number, number];
  types: Map<number, TypeSlice>;
}

function sliceOf(t: Float32Array, typeId: number, idx: readonly number[]): TypeSlice {
  const mats = new Float32Array(idx.length * 16);
  const colors = new Float32Array(idx.length * 3).fill(1);
  const codes = isSignal(typeId) ? new Float32Array(idx.length) : undefined;
  idx.forEach((i, k) => {
    const [x, y, z, yaw, raw] = [t[i * 5], t[i * 5 + 1], t[i * 5 + 2], t[i * 5 + 3], t[i * 5 + 4]] as number[];
    if (codes) codes[k] = raw as number;
    const s = codes ? 1 : raw;
    const c = Math.cos(yaw as number) * (s as number);
    const n = Math.sin(yaw as number) * (s as number);
    mats.set([c, 0, -n, 0, 0, s as number, 0, 0, n, 0, c, 0, x as number, y as number, z as number, 1], k * 16);
    if (typeId === PROP_TYPE.vendingMachine) {
      const h = Math.abs(Math.round((x as number) * 7 + (z as number) * 13)) % VENDING_TINTS.length;
      colors.set(VENDING_TINTS[h] as readonly number[], k * 3);
    }
  });
  return codes ? { n: idx.length, mats, colors, band: -1, codes } : { n: idx.length, mats, colors, band: -1 };
}

/** 셀 배치 → 64 m 블록들. */
export function blocksOf(key: CellKey, origin: Readonly<Vec3d>, batches: readonly PropBatch[]): Block[] {
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

export function distanceTo(b: Block, cam: Readonly<Vec3d>): number {
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
