// 플레이어 차량 목록(M08-T01): 생성·입력·스텝 전 보조·노면 젖음·스냅샷 차량 기록(protocol VEH_*). 차체 강체 자체는 bodies 슬롯(kind 'veh')이 포즈를 쓴다.
import type { BicycleParams, SedanParams, VehicleInput } from '../../api.ts';
import {
  MAX_VEHICLES,
  VEH_ABS,
  VEH_BASE,
  VEH_HEAD,
  VEH_SHIFTING,
  VEH_STRIDE,
  VEH_TCS,
  WHEEL_STRIDE,
} from '../protocol.ts';
import { createBicycle } from './vehicle-bicycle.ts';
import type { VehicleBody, WheelOut } from './vehicle-common.ts';
import { createSedan } from './vehicle-sedan.ts';
import type { PhysicsWorld } from './world.ts';

export type { VehicleBody };

export interface Vehicles {
  spawn(
    handle: number,
    kind: 'sedan' | 'bicycle',
    pos: readonly [number, number, number],
    yaw: number,
    p: SedanParams | BicycleParams,
  ): VehicleBody;
  remove(handle: number): void;
  setInput(handle: number, i: VehicleInput): void;
  setWetness(w: number): void;
  /** 물리 스텝마다(전): 입력 + 보조. */
  preStep(dt: number): void;
  /** 스냅샷 차량 기록(빈 칸 handle 0). */
  fill(frame: Float64Array): void;
  readonly count: number;
  dispose(): void;
}

const wo: WheelOut = { rotation: 0, steer: 0, suspension: 0, slipLong: 0, slipLatDeg: 0, material: -1 };

/** 스냅샷 차량 칸 하나(머리 + 바퀴). */
function writeOne(f: Float64Array, o: number, h: number, v: VehicleBody): void {
  f[o] = h;
  f[o + 1] = v.speed();
  f[o + 2] = v.rpm();
  f[o + 3] = v.gear();
  f[o + 4] = (v.applied.abs ? VEH_ABS : 0) | (v.applied.tcs ? VEH_TCS : 0) | (v.shifting() ? VEH_SHIFTING : 0);
  f[o + 5] = v.applied.throttle;
  f[o + 6] = v.wheelCount;
  f[o + 7] = 0;
  for (let i = 0; i < v.wheelCount; i++) {
    v.wheel(i, wo);
    f.set(
      [wo.rotation, wo.steer, wo.suspension, wo.slipLong, wo.slipLatDeg, wo.material],
      o + VEH_HEAD + i * WHEEL_STRIDE,
    );
  }
}

export function createVehicles(w: PhysicsWorld): Vehicles {
  const list = new Map<number, VehicleBody>();
  let wet = 0;
  return {
    spawn(handle, kind, pos, yaw, p) {
      list.get(handle)?.dispose();
      if (!list.has(handle) && list.size >= MAX_VEHICLES)
        throw new Error(`physics: vehicles exhausted (${MAX_VEHICLES})`);
      const v =
        kind === 'bicycle'
          ? createBicycle(w, pos, yaw, p as BicycleParams)
          : createSedan(w, pos, yaw, p as SedanParams);
      v.setWetness(wet);
      list.set(handle, v);
      return v;
    },
    remove(handle) {
      list.get(handle)?.dispose();
      list.delete(handle);
    },
    setInput(handle, i) {
      const v = list.get(handle);
      if (v) v.input = { ...i };
    },
    setWetness(x) {
      wet = x;
      for (const v of list.values()) v.setWetness(x);
    },
    preStep(dt) {
      for (const v of list.values()) v.preStep(dt);
    },
    fill(frame) {
      let k = 0;
      for (const [h, v] of list) writeOne(frame, VEH_BASE + k++ * VEH_STRIDE, h, v);
      for (; k < MAX_VEHICLES; k++) frame[VEH_BASE + k * VEH_STRIDE] = 0;
    },
    get count() {
      return list.size;
    },
    dispose() {
      for (const v of list.values()) v.dispose();
      list.clear();
    },
  };
}
