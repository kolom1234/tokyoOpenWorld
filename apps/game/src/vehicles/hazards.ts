// AEB 위험물(M08-T02): sim 출력 버퍼(메인에서 읽기만) → 원 목록. 보행자 = 지금 + 0.5·1.0 s 뒤(걷는 방향·속력 — anim 소수 × 10 m/s),
// 교통 차 = 차체를 덮는 원(차종 치수 core VEHICLE_TYPES), 그 밖 원(세워 둔 플레이어 차 등)은 extra.
import { type SharedInstanceBuffer, VEHICLE_TYPES, type Vec3d } from '@sanpo/core';
import type { HazardCircle } from '@sanpo/traversal';

const STRIDE = 8;
const PED_R = 0.35;
const PREDICT_S = [0.5, 1] as const;
const CAR_MARGIN_M = 0.15;

/** 차체 바닥(중심·yaw·길이·폭)을 덮는 원들. */
export function carCircles(x: number, z: number, yaw: number, len: number, wid: number, out: HazardCircle[]): void {
  const r = wid / 2 + CAR_MARGIN_M;
  const n = Math.max(1, Math.ceil(len / (2 * r)));
  const span = Math.max(0, len / 2 - r);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
    out.push({ x: x + fx * t, z: z + fz * t, r });
  }
}

function pedestrians(buf: SharedInstanceBuffer, c: Readonly<Vec3d>, r2: number, out: HazardCircle[]): void {
  const d = buf.data;
  const a = buf.anchorWF();
  const n = buf.count();
  for (let i = 0; i < n; i++) {
    const k = i * STRIDE;
    const x = (d[k] as number) + a.x;
    const z = (d[k + 2] as number) + a.z;
    if ((x - c.x) ** 2 + (z - c.z) ** 2 > r2) continue;
    out.push({ x, z, r: PED_R, kind: 'ped' });
    const anim = d[k + 4] as number;
    const v = (anim - Math.floor(anim)) * 10;
    if (v < 0.2) continue;
    const yaw = d[k + 3] as number;
    for (const t of PREDICT_S)
      out.push({ x: x - Math.sin(yaw) * v * t, z: z - Math.cos(yaw) * v * t, r: PED_R, kind: 'ped' });
  }
}

function vehicles(buf: SharedInstanceBuffer, c: Readonly<Vec3d>, r2: number, out: HazardCircle[]): void {
  const d = buf.data;
  const a = buf.anchorWF();
  const n = buf.count();
  for (let i = 0; i < n; i++) {
    const k = i * STRIDE;
    const x = (d[k] as number) + a.x;
    const z = (d[k + 2] as number) + a.z;
    if ((x - c.x) ** 2 + (z - c.z) ** 2 > r2) continue;
    const t = VEHICLE_TYPES[Math.min(Math.round(d[k + 6] as number) & 7, VEHICLE_TYPES.length - 1)];
    if (t) carCircles(x, z, d[k + 3] as number, t.lengthM, t.widthM, out);
  }
}

/** center 반경 안 위험물(보행자 + 예측·교통 차·extra). */
export function hazardsNear(
  bufs: { pedestrians?: SharedInstanceBuffer; traffic?: SharedInstanceBuffer },
  center: Readonly<Vec3d>,
  radiusM: number,
  extra: readonly HazardCircle[] = [],
): HazardCircle[] {
  const out: HazardCircle[] = [];
  const r2 = radiusM * radiusM;
  if (bufs.pedestrians) pedestrians(bufs.pedestrians, center, r2, out);
  if (bufs.traffic) vehicles(bufs.traffic, center, r2, out);
  for (const h of extra) if ((h.x - center.x) ** 2 + (h.z - center.z) ** 2 <= r2) out.push(h);
  return out;
}
