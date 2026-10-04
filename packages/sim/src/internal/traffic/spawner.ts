// 차량 스폰(10 §5.1, M06-T05 — ADR-0065): 플레이어 spawnM(400 m) 안 도로 차선(연결로 아님)에서 — 처음엔 어디든 채우고, 평소엔 시야 밖 또는 farM(250 m) 밖,
// 같은 차선 앞뒤 12 m 비었을 때. 차종(가상 디자인 7종 — 치수·비율 = core VEHICLE_TYPES, M06-T06)·색·원하는 속력 비율은 순번 난수. 목표 수 = maxVehicles × 시간대 곡선.
import { createRng, hash32, type Rng, VEHICLE_TYPES, type VehicleTypeInfo, WORLD_SEED } from '@sanpo/core';
import { LANE_KIND } from '@sanpo/tile-format';
import type { Lane, LaneGraph } from './lane-graph.ts';

const KIND_CAR = 0x63617273; // 'cars'

export type { TrafficParams } from '../../api.ts';

export interface NewVehicle {
  seq: number;
  rng: Rng;
  type: number;
  len: number;
  /** u16: 차종(3비트) | 색(5비트) << 3 | 씨앗(8비트) << 8. */
  variant: number;
  /** 원하는 속력 = 제한속도 × 이 값. */
  v0f: number;
}

export function newVehicle(seq: number): NewVehicle {
  const rng = createRng(hash32(WORLD_SEED, KIND_CAR, seq));
  let r = rng.next();
  let type = 0;
  for (; type < VEHICLE_TYPES.length - 1; type++) {
    r -= (VEHICLE_TYPES[type] as VehicleTypeInfo).share;
    if (r <= 0) break;
  }
  const color = Math.floor(rng.next() * 32);
  const seed = Math.floor(rng.next() * 256);
  return {
    seq,
    rng,
    type,
    len: (VEHICLE_TYPES[type] as VehicleTypeInfo).lengthM,
    variant: type | (color << 3) | (seed << 8),
    v0f: 0.85 + rng.next() * 0.25,
  };
}

/** 스폰 후보 차선·위치: 길이 비례 무작위 도로 차선, 플레이어와의 거리·시야 조건은 호출 측. */
export function pickSpawn(
  g: LaneGraph,
  seed: number,
  near: { x: number; z: number },
  maxM: number,
): { lane: Lane; s: number; x: number; z: number } | undefined {
  const rng = createRng(seed);
  const cand: Lane[] = [];
  let total = 0;
  for (const l of g.lanes) {
    if (!l || l.kind !== LANE_KIND.road || l.length < 10) continue;
    const mid = g.pointAt(l, l.length / 2);
    if (Math.hypot(mid.x - near.x, mid.z - near.z) > maxM) continue;
    cand.push(l);
    total += l.length;
  }
  if (cand.length === 0) return undefined;
  let r = rng.next() * total;
  for (const l of cand) {
    r -= l.length;
    if (r > 0) continue;
    const s = 3 + rng.next() * Math.max(0, l.length - 6);
    const p = g.pointAt(l, s);
    return { lane: l, s, x: p.x, z: p.z };
  }
  return undefined;
}
