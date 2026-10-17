// 플레이어 차·자전거 바닥 사각형(M08-T02): 교통 양보(사각형까지 거리)·군중 회피(축 위 원 장애물). 원점 = 차체 바닥 중심, 전방 = (−sin yaw, −cos yaw).
import type { PlayerFootprint } from '../api.ts';

/** 점 (x, z)에서 사각형까지 수평 거리(안이면 0). */
export function footprintDistance(f: Readonly<PlayerFootprint>, cx: number, cz: number, x: number, z: number): number {
  const dx = x - cx;
  const dz = z - cz;
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  // WF → 차 로컬(옆 = 오른쪽 +X, 앞뒤 = 로컬 Z).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const qx = Math.max(Math.abs(lx) - f.widthM / 2, 0);
  const qz = Math.max(Math.abs(lz) - f.lengthM / 2, 0);
  return Math.hypot(qx, qz);
}

/**
 * 반경 r 원 격자(가로 × 세로)로 사각형 + margin을 덮는다 — 군중 장애물(DetourCrowd 최대 반경을 키우면 분리 동작이 바뀌어 겹침이 생겼다, M08-T02).
 */
export function footprintGrid(
  f: Readonly<PlayerFootprint>,
  cx: number,
  cz: number,
  r: number,
  margin: number,
): { x: number; z: number }[] {
  const w = f.widthM + 2 * margin;
  const l = f.lengthM + 2 * margin;
  const nx = Math.max(1, Math.ceil(w / (2 * r)));
  const nz = Math.max(1, Math.ceil(l / (2 * r)));
  const fx = -Math.sin(f.yaw);
  const fz = -Math.cos(f.yaw);
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < nz; i++)
    for (let j = 0; j < nx; j++) {
      const a = nz === 1 ? 0 : -(l / 2 - r) + ((l - 2 * r) * i) / (nz - 1);
      const b = nx === 1 ? 0 : -(w / 2 - r) + ((w - 2 * r) * j) / (nx - 1);
      // 오른쪽 = (−fz, fx).
      out.push({ x: cx + fx * a - fz * b, z: cz + fz * a + fx * b });
    }
  return out;
}

/** 길이 방향 원 중심들(차체를 덮는 반경 = 반폭 + margin) — 원 k개. */
export function footprintCircles(
  f: Readonly<PlayerFootprint>,
  cx: number,
  cz: number,
  margin: number,
): { x: number; z: number; r: number }[] {
  const r = f.widthM / 2 + margin;
  const n = Math.max(1, Math.ceil(f.lengthM / (2 * r)));
  const span = Math.max(0, f.lengthM / 2 - r);
  const fx = -Math.sin(f.yaw);
  const fz = -Math.cos(f.yaw);
  const out: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
    out.push({ x: cx + fx * t, z: cz + fz * t, r });
  }
  return out;
}
