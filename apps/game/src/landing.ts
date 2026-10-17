// freecam G 카메라 아래 내리기(ADR-0083): 카메라 바로 아래(+ 2·4·7 m 링 × 8방위) 후보마다 물리 레이로 판정 → 가장 가까운 안전한 자리(발 WF) 또는 가운데 후보의 이유.
// 안전 = 지면(TERRAIN — 보도·광장·공원) 또는 승강장 윗면(가장자리 0.8 m 안 아님 — 지붕·차양·데크는 아래로 지나간다), 선로 회랑·구덩이 아님, 차선(lanes.bin — 차도) 아님,
// 건물 안 아님(머리 위 덮임 + 수평 8방위 중 7곳 이상 25 m 안 막힘), 머리 공간(구 0.3 m를 발 위 0.35 → 1.8 m) 비어 있음, 경사 법선 y ≥ 0.8.
import type { CellKey, Vec3, Vec3d } from '@sanpo/core';
import { packCellKey } from '@sanpo/core';
import type { RayHit } from '@sanpo/physics';
import { JCOL_MATERIAL, LANE_KIND, type LaneGraphChunk } from '@sanpo/tile-format';
import type { LandingFailReason, LandingResult } from '@sanpo/traversal';
import { laneChunks } from './lane-chunks.ts';
import { clearTopAt, type PlatformTops, type TrackPits } from './station/platform-geo.ts';

export interface LandingQueries {
  ray(o: Vec3d, d: Vec3, max: number): Promise<RayHit | null>;
  sphere(o: Vec3d, d: Vec3, r: number, max: number): Promise<RayHit | null>;
  tops: PlatformTops | undefined;
  pits: TrackPits | undefined;
  onRoad(x: number, z: number): Promise<boolean>;
}

const TERRAIN = 1;
const NPC_KINEMATIC = 5;
const TRAIN = 6;
const PASS_MAX = 4;
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
const UP: Vec3 = { x: 0, y: 1, z: 0 };
const RINGS_M = [2, 4, 7] as const;
const DIRS = 8;
const MAX_DROP_M = 600;
const MIN_NORMAL_Y = 0.8;
const EDGE_CLEAR_M = 0.8;
const ENCLOSED_DIRS = 7;
const ENCLOSED_M = 25;
const HEAD_R = 0.3;
const HEAD_FROM_M = 0.35;
const HEAD_TO_M = 1.8;

/** 후보 오프셋: 가운데 → 2·4·7 m 링(가까운 순). */
export function landingOffsets(): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (const r of RINGS_M)
    for (let i = 0; i < DIRS; i++) {
      const a = (i / DIRS) * 2 * Math.PI;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  return out;
}

type Spot = { ok: true; posWF: Vec3d } | { ok: false; reason: LandingFailReason };

/** 건물 안: 머리 위가 덮였고 수평 8방위 중 ENCLOSED_DIRS곳 이상이 ENCLOSED_M 안에서 막힘. */
async function enclosed(q: LandingQueries, p: Vec3d): Promise<boolean> {
  const roof = await q.ray({ x: p.x, y: p.y + 0.3, z: p.z }, UP, 120);
  if (!roof) return false;
  const eye = { x: p.x, y: p.y + 1.2, z: p.z };
  const hits = await Promise.all(
    Array.from({ length: DIRS }, (_, i) => {
      const a = (i / DIRS) * 2 * Math.PI;
      return q.ray(eye, { x: Math.cos(a), y: 0, z: Math.sin(a) }, ENCLOSED_M);
    }),
  );
  return hits.filter((h) => h !== null).length >= ENCLOSED_DIRS;
}

const onTop = (q: LandingQueries, p: Vec3d): boolean => {
  const top = q.tops?.topAt(p.x, p.z);
  return top !== undefined && Math.abs(top - p.y) < 0.3;
};

/**
 * 아래로 첫 "걸을 수 있는 면"(지면 TERRAIN·승강장 윗면): 지붕·차양·데크(STATIC)는 아래로 지나간다(최대 PASS_MAX 겹 — 승강장 차양 아래 승강장,
 * 지붕 아래 건물 안 지면은 뒤의 건물 안 판정이 거른다). 차량 = 'road', 열차 = 'track'.
 */
async function walkableBelow(
  q: LandingQueries,
  x: number,
  z: number,
  fromY: number,
): Promise<RayHit | LandingFailReason> {
  let y = fromY;
  for (let pass = 0; pass < PASS_MAX; pass++) {
    const hit = await q.ray({ x, y, z }, DOWN, MAX_DROP_M);
    if (!hit) return 'no-ground';
    if (hit.layer === TERRAIN || onTop(q, hit.posWF)) return hit;
    if (hit.layer === NPC_KINEMATIC) return 'road';
    if (hit.layer === TRAIN) return 'track';
    y = hit.posWF.y - 0.05;
  }
  return 'building';
}

/** 한 후보(x, z — 카메라 높이에서 아래로). */
export async function evaluateSpot(q: LandingQueries, x: number, z: number, fromY: number): Promise<Spot> {
  const hit = await walkableBelow(q, x, z, fromY);
  if (typeof hit === 'string') return { ok: false, reason: hit };
  const p = hit.posWF;
  if (hit.normal.y < MIN_NORMAL_Y) return { ok: false, reason: 'steep' };
  if (onTop(q, p)) {
    if (!q.tops || clearTopAt(q.tops, p.x, p.z, EDGE_CLEAR_M) === undefined) return { ok: false, reason: 'track' };
  } else {
    if (q.pits?.onTrack(p) || q.pits?.inPit(p)) return { ok: false, reason: 'track' };
    // 보도·연석(tile 메시)은 차도가 아니다 — 차선 폭이 연석을 살짝 넘어도. 높이장(asphalt)만 차선 판정.
    if (hit.material !== JCOL_MATERIAL.tile && (await q.onRoad(p.x, p.z))) return { ok: false, reason: 'road' };
    if (await enclosed(q, p)) return { ok: false, reason: 'building' };
  }
  const head = await q.sphere({ x: p.x, y: p.y + HEAD_FROM_M, z: p.z }, UP, HEAD_R, HEAD_TO_M - HEAD_FROM_M);
  if (head) return { ok: false, reason: 'blocked' };
  return { ok: true, posWF: { x: p.x, y: p.y + 0.02, z: p.z } };
}

/** 모든 후보를 함께 판정 → 가까운 순 첫 안전 자리, 없으면 가운데 후보의 이유. */
export async function findLanding(q: LandingQueries, cam: Readonly<Vec3d>): Promise<LandingResult> {
  const spots = await Promise.all(landingOffsets().map(([dx, dz]) => evaluateSpot(q, cam.x + dx, cam.z + dz, cam.y)));
  const ok = spots.find((s) => s.ok);
  if (ok) return ok;
  const center = spots[0] as Spot;
  return center.ok ? center : { ok: false, reason: center.reason };
}

/** 셀 차선(lanes.bin) 지연 적재·캐시(최근 16셀 — lane-chunks.ts) → 점이 차선(도로·버스·교차로 연결로) 폭 안인가. */
export function roadIndex(
  request: (key: CellKey) => Promise<ArrayBuffer | undefined>,
): (x: number, z: number) => Promise<boolean> {
  const load = laneChunks(request);
  return async (x, z) => {
    const ix = Math.floor(x / 256);
    const iz = Math.floor(z / 256);
    const g = await load(packCellKey(0, ix, iz));
    return g ? onLane(g, x - ix * 256, z - iz * 256) : false;
  };
}

/** 차선 폭/2 바깥 여유(m): 교차로 연결로는 넓게(연결로 사이 빈 교차로 안 — 스크램블), 일반 차선은 조금. */
const LANE_MARGIN_M = 0.6;
const CONNECTOR_MARGIN_M = 3.5;

/** 셀 로컬 (x, z)가 어느 차선 중심선에서 폭/2 + 여유 안인가. */
export function onLane(g: LaneGraphChunk, x: number, z: number): boolean {
  const L = g.lanes;
  const P = g.pointsLocal;
  for (let i = 0; i < L.id.length; i++) {
    const kind = L.kind[i] as number;
    if (kind !== LANE_KIND.road && kind !== LANE_KIND.connector && kind !== LANE_KIND.bus) continue;
    const half = (L.widthCm[i] as number) / 200 + (kind === LANE_KIND.connector ? CONNECTOR_MARGIN_M : LANE_MARGIN_M);
    const o = L.ptOffset[i] as number;
    for (let k = 0; k + 1 < (L.ptCount[i] as number); k++) {
      const a = (o + k) * 3;
      const b = a + 3;
      const ax = P[a] as number;
      const az = P[a + 2] as number;
      const dx = (P[b] as number) - ax;
      const dz = (P[b + 2] as number) - az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= half) return true;
    }
  }
  return false;
}
