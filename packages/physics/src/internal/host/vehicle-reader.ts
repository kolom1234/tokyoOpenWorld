// 차량 기록 읽기(M08-T01): 최신 스냅샷의 VEH_* 칸 → VehicleState(핸들별 객체 재사용 — 프레임마다 할당 없음). 보간 없음(HUD·바퀴·소리용).
import type { VehicleState } from '../../api.ts';
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

function emptyState(): VehicleState {
  return { speedMs: 0, rpm: 0, gear: 0, throttle: 0, abs: false, tcs: false, shifting: false, wheels: [] };
}

/** frame의 handle 차량 → out. 없으면 false. */
export function readVehicle(frame: Float64Array, handle: number, out: VehicleState): boolean {
  for (let k = 0; k < MAX_VEHICLES; k++) {
    const o = VEH_BASE + k * VEH_STRIDE;
    if (frame[o] !== handle) continue;
    const flags = Math.trunc(frame[o + 4] ?? 0);
    out.speedMs = frame[o + 1] ?? 0;
    out.rpm = frame[o + 2] ?? 0;
    out.gear = frame[o + 3] ?? 0;
    out.abs = (flags & VEH_ABS) !== 0;
    out.tcs = (flags & VEH_TCS) !== 0;
    out.shifting = (flags & VEH_SHIFTING) !== 0;
    out.throttle = frame[o + 5] ?? 0;
    const n = Math.trunc(frame[o + 6] ?? 0);
    out.wheels.length = n;
    for (let i = 0; i < n; i++) {
      const b = o + VEH_HEAD + i * WHEEL_STRIDE;
      const wh = out.wheels[i] ?? {
        rotationRad: 0,
        steerRad: 0,
        suspensionM: 0,
        slipLong: 0,
        slipLatDeg: 0,
        contactMaterial: -1,
      };
      wh.rotationRad = frame[b] ?? 0;
      wh.steerRad = frame[b + 1] ?? 0;
      wh.suspensionM = frame[b + 2] ?? 0;
      wh.slipLong = frame[b + 3] ?? 0;
      wh.slipLatDeg = frame[b + 4] ?? 0;
      wh.contactMaterial = frame[b + 5] ?? -1;
      out.wheels[i] = wh;
    }
    return true;
  }
  return false;
}

export function createVehicleReader(latest: () => Float64Array | undefined) {
  const states = new Map<number, VehicleState>();
  return {
    state(h: number): VehicleState | undefined {
      const f = latest();
      if (!f) return undefined;
      const s = states.get(h) ?? emptyState();
      if (!readVehicle(f, h, s)) return undefined;
      states.set(h, s);
      return s;
    },
    forget: (h: number) => void states.delete(h),
  };
}
