// 차 부르기 자리(09 §1 drive "인접 차도 가장자리", M08-T01/T02): 플레이어 주변 3×3 셀 차선 중 연석 쪽(laneIdx 0 — 좌측통행 맨 왼쪽) 일반 도로 차선,
// 교차로(차선 양 끝)에서 MIN_FROM_END_M 떨어진 중심선 위 가장 가까운 점 → 진행 방향 왼쪽(연석)으로 (폭/2 − 차 반폭 − 여유)만큼 비킨 자리, 방향 = 차선 진행 방향.
import type { CellKey, Vec3d } from '@sanpo/core';
import { packCellKey } from '@sanpo/core';
import { LANE_KIND, type LaneGraphChunk } from '@sanpo/tile-format';

const CELL_M = 256;
/** 교차로·정지선에서 떨어진 거리(m) — 차선 양 끝(노드)까지. */
const MIN_FROM_END_M = 9;
/** 차 반폭 + 연석 여유(m). */
const CAR_HALF_M = 0.88 + 0.25;
/** 찾는 반경(m). */
export const CURB_SEARCH_M = 40;

export interface CurbSpot {
  /** 차체 바닥 중심(WF, y = 차선 중심선 높이). */
  posWF: Vec3d;
  /** 진행 방향(전방 −Z 기준, +Y 반시계). */
  yawRad: number;
  /** 플레이어까지 수평 거리(m). */
  distanceM: number;
}

interface Seg {
  ax: number;
  ay: number;
  az: number;
  dx: number;
  dy: number;
  dz: number;
  len: number;
  /** 차선 시작부터 이 조각 시작까지 거리(m). */
  s0: number;
}

function segments(g: LaneGraphChunk, i: number): { segs: Seg[]; total: number } {
  const P = g.pointsLocal;
  const o = g.lanes.ptOffset[i] as number;
  const n = g.lanes.ptCount[i] as number;
  const segs: Seg[] = [];
  let total = 0;
  for (let k = 0; k + 1 < n; k++) {
    const a = (o + k) * 3;
    const b = a + 3;
    const seg = {
      ax: P[a] as number,
      ay: P[a + 1] as number,
      az: P[a + 2] as number,
      dx: (P[b] as number) - (P[a] as number),
      dy: (P[b + 1] as number) - (P[a + 1] as number),
      dz: (P[b + 2] as number) - (P[a + 2] as number),
      len: 0,
      s0: total,
    };
    seg.len = Math.hypot(seg.dx, seg.dz);
    total += seg.len;
    if (seg.len > 1e-3) segs.push(seg);
  }
  return { segs, total };
}

/** 한 셀(원점 ox, oz)의 후보 중 가장 가까운 것. near = WF. */
export function curbSpotInChunk(
  g: LaneGraphChunk,
  ox: number,
  oz: number,
  near: Readonly<Vec3d>,
): CurbSpot | undefined {
  let best: CurbSpot | undefined;
  const L = g.lanes;
  for (let i = 0; i < L.id.length; i++) {
    if (L.kind[i] !== LANE_KIND.road || L.laneIdx[i] !== 0) continue;
    const { segs, total } = segments(g, i);
    if (total < 2 * MIN_FROM_END_M) continue;
    const shift = Math.max(0, (L.widthCm[i] as number) / 200 - CAR_HALF_M);
    for (const s of segs) {
      const px = near.x - ox - s.ax;
      const pz = near.z - oz - s.az;
      const tMin = Math.max(0, (MIN_FROM_END_M - s.s0) / s.len);
      const tMax = Math.min(1, (total - MIN_FROM_END_M - s.s0) / s.len);
      if (tMin > tMax) continue;
      const t = Math.max(tMin, Math.min(tMax, (px * s.dx + pz * s.dz) / (s.len * s.len)));
      const fx = s.dx / s.len;
      const fz = s.dz / s.len;
      // 진행 방향 왼쪽(연석) = (fz, −fx).
      const x = ox + s.ax + s.dx * t + fz * shift;
      const z = oz + s.az + s.dz * t - fx * shift;
      const d = Math.hypot(x - near.x, z - near.z);
      if (!best || d < best.distanceM)
        best = { posWF: { x, y: s.ay + s.dy * t, z }, yawRad: Math.atan2(-fx, -fz), distanceM: d };
    }
  }
  return best;
}

/** 주변 3×3 셀에서 연석 자리(반경 maxM 안, 없으면 undefined). */
export async function findCurbSpot(
  load: (key: CellKey) => Promise<LaneGraphChunk | null>,
  near: Readonly<Vec3d>,
  maxM = CURB_SEARCH_M,
): Promise<CurbSpot | undefined> {
  const cx = Math.floor(near.x / CELL_M);
  const cz = Math.floor(near.z / CELL_M);
  let best: CurbSpot | undefined;
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const g = await load(packCellKey(0, cx + dx, cz + dz));
      if (!g) continue;
      const s = curbSpotInChunk(g, (cx + dx) * CELL_M, (cz + dz) * CELL_M, near);
      if (s && (!best || s.distanceM < best.distanceM)) best = s;
    }
  return best && best.distanceM <= maxM ? best : undefined;
}
