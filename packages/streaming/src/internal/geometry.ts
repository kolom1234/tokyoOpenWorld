// 관심점 전처리(고도·진행 방향)와 셀 AABB 수평 거리·뷰 쐐기 판정. interest/priority 공용 순수 함수. see docs/06-world-streaming.md §3–4
import type { InterestPoint, ModeId, QualityTier } from '@sanpo/core';
import type { CellBoundsWF } from '@sanpo/geo';
import type { InterestConfig } from '../api.ts';

/** 관심점 → 레벨별 셀 집합·우선순위 계산 입력(한 프레임). */
export interface InterestFrame {
  points: readonly InterestPoint[];
  mode: ModeId;
  tier: QualityTier;
  /** 지면 높이(WF y, m). 모르면 undefined → 지면 0 m로 간주(고도 = posWF.y). */
  groundHeightAt?: ((xWF: number, zWF: number) => number | undefined) | undefined;
}

/** 계산용 관심점. dirX/dirZ는 진행 방향 가중이 켜진 경우만 단위 벡터, 아니면 0. */
export interface PreparedPoint {
  x: number;
  z: number;
  /** 지면 기준 고도(m, ≥ 0). */
  altitudeM: number;
  weight: number;
  kind: InterestPoint['kind'];
  dirX: number;
  dirZ: number;
  /** 뒤쪽 거리 가중(0 = 없음). */
  behindPenalty: number;
  /** 수평 forward 단위 벡터(없으면 0). 뷰 쐐기용. */
  fwdX: number;
  fwdZ: number;
}

function unit2(x: number, z: number, minLen: number): [number, number] {
  const len = Math.hypot(x, z);
  return len > minLen ? [x / len, z / len] : [0, 0];
}

function preparePoint(p: InterestPoint, frame: InterestFrame, cfg: InterestConfig): PreparedPoint {
  const { x, y, z } = p.posWF;
  const groundY = frame.groundHeightAt?.(x, z) ?? 0;
  const moving = frame.mode === 'train' && cfg.trainBehindPenalty > 0 && p.velWF !== undefined;
  const [dirX, dirZ] = moving && p.velWF ? unit2(p.velWF.x, p.velWF.z, cfg.directionMinSpeedMs) : [0, 0];
  const [fwdX, fwdZ] = p.forward ? unit2(p.forward.x, p.forward.z, 1e-6) : [0, 0];
  return {
    x,
    z,
    altitudeM: Math.max(0, y - groundY),
    weight: p.weight,
    kind: p.kind,
    dirX,
    dirZ,
    behindPenalty: dirX !== 0 || dirZ !== 0 ? cfg.trainBehindPenalty : 0,
    fwdX,
    fwdZ,
  };
}

/** 유한 좌표 관심점만 전처리한다(NaN 관심점은 무시). */
export function preparePoints(frame: InterestFrame, cfg: InterestConfig): PreparedPoint[] {
  const out: PreparedPoint[] = [];
  for (const p of frame.points) {
    if (Number.isFinite(p.posWF.x) && Number.isFinite(p.posWF.z)) out.push(preparePoint(p, frame, cfg));
  }
  return out;
}

/** 점(x, z)에서 AABB까지 수평 최단거리(안이면 0). */
export function aabbDistanceM(b: CellBoundsWF, x: number, z: number): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * 진행 방향 가중 거리: d × (1 + penalty × max(0, −cosθ)), θ = 진행 방향과 (최근접점 − 관심점) 사이 각.
 * `directional` = false(L1 이상)거나 가중이 없으면 AABB 거리 그대로. 항상 ≥ AABB 거리.
 */
export function effectiveDistanceM(b: CellBoundsWF, p: PreparedPoint, directional: boolean): number {
  const nx = Math.min(Math.max(p.x, b.minX), b.maxX);
  const nz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
  const dx = nx - p.x;
  const dz = nz - p.z;
  const d = Math.hypot(dx, dz);
  if (!directional || p.behindPenalty === 0 || d === 0) return d;
  const cos = (dx * p.dirX + dz * p.dirZ) / d;
  return d * (1 + p.behindPenalty * Math.max(0, -cos));
}

/** 반직선(ox,oz)+t(dx,dz), t ≥ 0이 AABB와 만나는가(2D 슬랩). */
function rayHitsAabb(b: CellBoundsWF, ox: number, oz: number, dx: number, dz: number): boolean {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  const slabs: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of slabs) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
      continue;
    }
    const a = (lo - o) / d;
    const c = (hi - o) / d;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 <= t1;
}

/**
 * 셀 AABB가 관심점의 수평 뷰 쐐기(forward 기준 반각 `halfAngleRad` < 90°)와 겹치는가.
 * 볼록 쐐기 ∩ 볼록 사각형 ≠ ∅ ⇔ 꼭짓점이 사각형 안 ∨ 사각형 모서리가 쐐기 안 ∨ 쐐기 경계 반직선이 사각형과 만남.
 */
export function inViewWedge(b: CellBoundsWF, p: PreparedPoint, halfAngleRad: number): boolean {
  if (p.fwdX === 0 && p.fwdZ === 0) return false;
  if (aabbDistanceM(b, p.x, p.z) === 0) return true;
  const cosHalf = Math.cos(halfAngleRad);
  for (const [cx, cz] of [
    [b.minX, b.minZ],
    [b.maxX, b.minZ],
    [b.minX, b.maxZ],
    [b.maxX, b.maxZ],
  ] as const) {
    const vx = cx - p.x;
    const vz = cz - p.z;
    if (vx * p.fwdX + vz * p.fwdZ >= cosHalf * Math.hypot(vx, vz)) return true;
  }
  const s = Math.sin(halfAngleRad);
  // forward를 ±반각 회전한 경계 반직선.
  const lx = p.fwdX * cosHalf - p.fwdZ * s;
  const lz = p.fwdX * s + p.fwdZ * cosHalf;
  const rx = p.fwdX * cosHalf + p.fwdZ * s;
  const rz = -p.fwdX * s + p.fwdZ * cosHalf;
  return rayHitsAabb(b, p.x, p.z, lx, lz) || rayHitsAabb(b, p.x, p.z, rx, rz);
}
