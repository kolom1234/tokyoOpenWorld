// 셀 광원(lights.bin, M09-T03 — ADR-0078, 05 §4): 가로등 머리(소품 2)·자판기 앞면(5)·돌출/입간판(16·17)·상점 1층 앞(파사드 retail 건물의 바닥 벽 가장자리 7 m 간격).
// 실측 조명 데이터가 없어 규칙 배치(가상) — 색온도·광속은 종류별 대표값(가로등 LED 4000 K, 상점 3000–5000 K, 자판기 6000 K). 결정론(gmlId·위치 해시), 셀당 상한.
import { hash32, WORLD_SEED } from '@sanpo/core';
import {
  LIGHT_KIND,
  LIGHT_SCHEDULE,
  type LightRecord,
  PROP_TYPE,
  type PropBatch,
  type Vec3Tuple,
} from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { FACADE_FLAG, facadeParams } from './facade-params.ts';

/** 셀당 상한(렌더 클러스터 1024개 = 주변 9–16셀 몫) — 넘으면 상점 앞부터 줄인다. */
export const LIGHTS_PER_CELL = 600;
/** 가로등 머리(소품 모델 streetLamp: 높이 6.85 m, 기둥에서 1.45 m 앞). */
const LAMP_HEAD: Vec3Tuple = [0, 6.8, 1.45];
const VENDING_FACE: Vec3Tuple = [0, 1.3, 0.55];
const SHOP_STEP_M = 7;
const SHOP_PER_WALL = 6;
const SHOP_PER_BUILDING = 14;
const SHOP_KELVIN = [3000, 3500, 4000, 5000];
const SIGN_KELVIN = [3500, 5000, 6500];
const STOREY_M = 3.5;
/** 아래 방향(옥타 −Y)·수평(dir 0). */
const DOWN: [number, number] = [0, -127];
const OMNI: [number, number] = [0, 0];

function place(t: Float32Array, k: number, off: Vec3Tuple): Vec3Tuple {
  const [x, y, z, yaw, s] = [t[k], t[k + 1], t[k + 2], t[k + 3], t[k + 4]] as number[];
  const c = Math.cos(yaw as number);
  const sn = Math.sin(yaw as number);
  const sc = s as number;
  return [
    (x as number) + (off[0] * c + off[2] * sn) * sc,
    (y as number) + off[1] * sc,
    (z as number) + (-off[0] * sn + off[2] * c) * sc,
  ];
}

const pick = <T>(a: readonly T[], h: number): T => a[h % a.length] as T;

/** 면 고리 Newell 법선의 x·z. */
function newellXZ(r: readonly number[]): [number, number] {
  let nx = 0;
  let nz = 0;
  const m = r.length / 3;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const [yi, zi, xi] = [r[i * 3 + 1] as number, r[i * 3 + 2] as number, r[i * 3] as number];
    const [yj, zj, xj] = [r[j * 3 + 1] as number, r[j * 3 + 2] as number, r[j * 3] as number];
    nx += (yi - yj) * (zi + zj);
    nz += (xi - xj) * (yi + yj);
  }
  return [nx, nz];
}

function propLights(batches: readonly PropBatch[]): LightRecord[] {
  const out: LightRecord[] = [];
  for (const b of batches) {
    const t = b.transforms;
    for (let k = 0; k < t.length; k += 5) {
      const h = hash32(
        WORLD_SEED,
        'light',
        b.typeId,
        Math.round((t[k] as number) * 10),
        Math.round((t[k + 2] as number) * 10),
      );
      if (b.typeId === PROP_TYPE.streetLamp)
        out.push({
          kind: LIGHT_KIND.streetLamp,
          schedule: LIGHT_SCHEDULE.night,
          kelvin: 4000,
          posLocal: place(t, k, LAMP_HEAD),
          dirOct: DOWN,
          lumen: 4000,
          range: 20,
        });
      else if (b.typeId === PROP_TYPE.vendingMachine)
        out.push({
          kind: LIGHT_KIND.vending,
          schedule: LIGHT_SCHEDULE.always,
          kelvin: 6000,
          posLocal: place(t, k, VENDING_FACE),
          dirOct: OMNI,
          lumen: 300,
          range: 3.5,
        });
      else if (b.typeId === PROP_TYPE.signProjecting)
        out.push({
          kind: LIGHT_KIND.sign,
          schedule: LIGHT_SCHEDULE.sign,
          kelvin: pick(SIGN_KELVIN, h),
          posLocal: [t[k] as number, t[k + 1] as number, t[k + 2] as number],
          dirOct: OMNI,
          lumen: 500,
          range: 6,
        });
      else if (b.typeId === PROP_TYPE.signStanding)
        out.push({
          kind: LIGHT_KIND.sign,
          schedule: LIGHT_SCHEDULE.sign,
          kelvin: pick(SIGN_KELVIN, h),
          posLocal: place(t, k, [0, 1, 0.3]),
          dirOct: OMNI,
          lumen: 200,
          range: 4,
        });
    }
  }
  return out;
}

/** 상점 1층 앞: retail 파사드 건물의 바닥(최저 + 1 m 이내) 벽 가장자리를 따라 7 m마다 높이 3 m·바깥 0.6 m. */
function shopLights(b: BuildingRecord, o: Vec3Tuple): LightRecord[] {
  const h = b.measuredHeightM ?? 10;
  const floors = b.storeys ?? Math.max(1, Math.round(h / STOREY_M));
  const fp = facadeParams({ id: b.gmlId, usage: b.usage, heightM: h, floors });
  if (((fp[3] ?? 0) & FACADE_FLAG.retail) === 0) return [];
  let base = Number.POSITIVE_INFINITY;
  for (const s of b.surfaces)
    for (const r of s.ringsWF) for (let i = 1; i < r.length; i += 3) base = Math.min(base, r[i] as number);
  const out: LightRecord[] = [];
  for (const s of b.surfaces) {
    if (s.kind !== 'wall' || out.length >= SHOP_PER_BUILDING) continue;
    const r = s.ringsWF[0] ?? [];
    const low: Vec3Tuple[] = [];
    for (let i = 0; i < r.length; i += 3)
      if ((r[i + 1] as number) < base + 1) low.push([r[i] as number, r[i + 1] as number, r[i + 2] as number]);
    if (low.length < 2) continue;
    const [a, c] = [low[0] as Vec3Tuple, low[low.length - 1] as Vec3Tuple];
    const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
    if (len < 3) continue;
    // 바깥 법선 = 면 Newell 법선의 수평 성분(PLATEAU 면 감김 = 바깥).
    const [wx, wz] = newellXZ(r);
    const wl = Math.hypot(wx, wz) || 1;
    const nx = wx / wl;
    const nz = wz / wl;
    const n = Math.min(SHOP_PER_WALL, Math.max(1, Math.floor(len / SHOP_STEP_M)));
    for (let j = 0; j < n && out.length < SHOP_PER_BUILDING; j++) {
      const t = (j + 0.5) / n;
      const hh = hash32(WORLD_SEED, 'shop-light', b.gmlId, out.length);
      out.push({
        kind: LIGHT_KIND.shopFront,
        schedule: LIGHT_SCHEDULE.shop,
        kelvin: pick(SHOP_KELVIN, hh),
        posLocal: [
          a[0] + (c[0] - a[0]) * t + nx * 0.6 - o[0],
          base + 3 - o[1],
          a[2] + (c[2] - a[2]) * t + nz * 0.6 - o[2],
        ],
        dirOct: OMNI,
        lumen: 900,
        range: 9,
      });
    }
  }
  return out;
}

/** 셀 광원(셀 로컬). 상한을 넘으면 상점 앞을 해시 순으로 뺀다. */
export function buildLights(i: {
  batches: readonly PropBatch[];
  buildings: readonly BuildingRecord[];
  originWF: Vec3Tuple;
}): LightRecord[] {
  const fixed = propLights(i.batches);
  const shops = [...i.buildings].sort((a, b) => (a.gmlId < b.gmlId ? -1 : 1)).flatMap((b) => shopLights(b, i.originWF));
  const room = Math.max(0, LIGHTS_PER_CELL - fixed.length);
  return [...fixed.slice(0, LIGHTS_PER_CELL), ...shops.slice(0, room)];
}
