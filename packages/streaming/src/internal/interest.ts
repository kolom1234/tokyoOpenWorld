// 관심점 → 레벨별 원하는 셀 집합(로드/히스테리시스 유지)과 상주 한도 해제 계획. 순수 함수. see docs/06-world-streaming.md §3, ADR-0021
import { type CellKey, type CellLevel, packCellKey, unpackCellKey } from '@sanpo/core';
import { CELL_SIZES, cellBoundsWF } from '@sanpo/geo';
import type { InterestConfig, StreamingConfig } from '../api.ts';
import type { CellIndex, IndexExtent } from './cell-index.ts';
import { effectiveDistanceM, type InterestFrame, type PreparedPoint, preparePoints } from './geometry.ts';

/** 원형(유효 거리 ≤ m) 또는 링(관심점 셀과 체비셰프 인덱스 거리 ≤ n). */
export type Zone = { circleM: number } | { ring: number };
export interface LevelRule {
  load: Zone;
  keep: Zone;
}

export interface DesiredCells {
  /** 로드 반경 안 = 요청 대상(없는 셀은 제외 — cells.idx에 있는 것만). */
  load: Set<CellKey>;
  /** 로드 반경 밖·해제 반경 안의 **상주** 셀 = 유지만(새로 요청하지 않음). load와 서로소. */
  keep: Set<CellKey>;
}

export interface EvictionPlan {
  /** 해제할 셀(해제 반경 밖 전부 + 한도 초과분은 유지 셀 중 먼 순). */
  evict: CellKey[];
  /** 레벨별 한도 초과 수(로드 반경 안 셀만 남아 해제 못 함 → 호출자가 warn). */
  overLimit: [number, number, number, number];
}

/** L0 로드 반경 R0: 모드 기본(+ freecam 고도항) × 품질 배율, 상한 클램프. */
export function l0RadiusM(frame: Pick<InterestFrame, 'mode' | 'tier'>, altitudeM: number, cfg: InterestConfig): number {
  const base =
    cfg.l0RadiusByModeM[frame.mode] + (frame.mode === 'freecam' ? cfg.freecamRadiusPerAltitudeM * altitudeM : 0);
  return Math.min(base * cfg.l0RadiusScaleByTier[frame.tier], cfg.l0RadiusMaxM);
}

/** L1 로드 반경 R1: 고고도에서 확장, 상한 클램프. */
export function l1RadiusM(altitudeM: number, cfg: InterestConfig): number {
  const extra = Math.max(0, altitudeM - cfg.highAltitudeM) * cfg.l1RadiusPerAltitudeM;
  return Math.min(cfg.l1RadiusM + extra, Math.max(cfg.l1RadiusM, cfg.l1RadiusMaxM));
}

function circle(loadM: number, cfg: InterestConfig): LevelRule {
  return { load: { circleM: loadM }, keep: { circleM: loadM * cfg.releaseFactor } };
}

/**
 * 관심점 하나의 레벨별 규칙(L0–L2). L0 고도 전환도 해제 비율로 히스테리시스:
 * 고도 ≤ H → 원형 R0 / H < 고도 ≤ H×1.25 → 로드 3×3·유지 원형 1.25·R0 / 그 위 → 로드 3×3·유지 5×5.
 */
export function levelRule(
  level: 0 | 1 | 2,
  p: Pick<PreparedPoint, 'altitudeM'>,
  frame: Pick<InterestFrame, 'mode' | 'tier'>,
  cfg: InterestConfig,
): LevelRule {
  if (level === 2) return circle(cfg.l2RadiusM, cfg);
  if (level === 1) return circle(l1RadiusM(p.altitudeM, cfg), cfg);
  const base = circle(l0RadiusM(frame, p.altitudeM, cfg), cfg);
  if (p.altitudeM <= cfg.highAltitudeM) return base;
  const load = { ring: cfg.highAltitudeLoadRing };
  if (p.altitudeM <= cfg.highAltitudeM * cfg.releaseFactor) return { load, keep: base.keep };
  return { load, keep: { ring: cfg.highAltitudeKeepRing } };
}

function zoneReachCells(zone: Zone, size: number): number {
  return 'ring' in zone ? zone.ring : Math.ceil(zone.circleM / size);
}

function inZone(zone: Zone, level: CellLevel, key: CellKey, p: PreparedPoint, cix: number, ciz: number): boolean {
  if ('circleM' in zone) return effectiveDistanceM(cellBoundsWF(key), p, level === 0) <= zone.circleM;
  const { ix, iz } = unpackCellKey(key);
  return Math.max(Math.abs(ix - cix), Math.abs(iz - ciz)) <= zone.ring;
}

interface Visit {
  index: CellIndex;
  resident: ReadonlySet<CellKey>;
  out: DesiredCells;
}

/** 관심점 셀 ± 도달 셀 수 상자(인덱스 범위로 클립)를 훑어 load/keep에 추가. */
function visitLevel(v: Visit, level: CellLevel, rule: LevelRule, p: PreparedPoint, ext: IndexExtent): void {
  const size = CELL_SIZES[level];
  const cix = Math.floor(p.x / size);
  const ciz = Math.floor(p.z / size);
  const reach = Math.max(zoneReachCells(rule.load, size), zoneReachCells(rule.keep, size));
  const x0 = Math.max(cix - reach, ext.minIx);
  const x1 = Math.min(cix + reach, ext.maxIx);
  const z0 = Math.max(ciz - reach, ext.minIz);
  const z1 = Math.min(ciz + reach, ext.maxIz);
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      const key = packCellKey(level, ix, iz);
      if (!v.index.has(key) || v.out.load.has(key)) continue;
      if (inZone(rule.load, level, key, p, cix, ciz)) v.out.load.add(key);
      else if (v.resident.has(key) && inZone(rule.keep, level, key, p, cix, ciz)) v.out.keep.add(key);
    }
  }
}

/**
 * 원하는 셀 집합(06 §3). load = 어느 관심점의 로드 영역 안(+ L3 전부), keep = 로드 밖·유지 영역 안의 상주 셀.
 * 관심점이 없으면 L3만 로드한다.
 */
export function computeDesired(
  index: CellIndex,
  frame: InterestFrame,
  resident: ReadonlySet<CellKey>,
  cfg: InterestConfig,
): DesiredCells {
  const out: DesiredCells = { load: new Set(), keep: new Set() };
  const visit: Visit = { index, resident, out };
  for (const p of preparePoints(frame, cfg)) {
    for (const level of [0, 1, 2] as const) {
      const ext = index.extentAt(level);
      if (ext) visitLevel(visit, level, levelRule(level, p, frame, cfg), p, ext);
    }
  }
  for (const key of index.keysAt(3)) out.load.add(key);
  for (const key of out.load) out.keep.delete(key);
  return out;
}

/**
 * 한 셀이 지금 어느 관심점의 로드 영역 안인가(L3는 항상 참). computeDesired의 셀 단위 판정과 같다 —
 * 재계산 사이에 미뤄 둔 해제를 실행하기 직전 재확인용.
 */
export function inLoadZone(key: CellKey, frame: InterestFrame, cfg: InterestConfig): boolean {
  const { level } = unpackCellKey(key);
  if (level === 3) return true;
  const size = CELL_SIZES[level];
  for (const p of preparePoints(frame, cfg)) {
    const rule = levelRule(level, p, frame, cfg);
    if (inZone(rule.load, level, key, p, Math.floor(p.x / size), Math.floor(p.z / size))) return true;
  }
  return false;
}

/** 관심점들까지의 최소 유효 거리(m). 관심점이 없으면 +∞. */
export function nearestDistanceM(key: CellKey, points: readonly PreparedPoint[]): number {
  const b = cellBoundsWF(key);
  const directional = unpackCellKey(key).level === 0;
  let best = Number.POSITIVE_INFINITY;
  for (const p of points) best = Math.min(best, effectiveDistanceM(b, p, directional));
  return best;
}

/**
 * 상주 한도 적용 해제 계획(06 §3 소프트 리밋). ① load·keep 밖 상주 셀 전부 해제
 * ② 레벨별 남은 수 > 한도면 keep 셀을 먼 순(동률은 키 오름차순)으로 해제 ③ load 셀은 해제 안 함(overLimit 보고).
 */
export function planEvictions(
  resident: Iterable<CellKey>,
  desired: DesiredCells,
  frame: InterestFrame,
  cfg: StreamingConfig,
): EvictionPlan {
  const evict: CellKey[] = [];
  const kept: CellKey[][] = [[], [], [], []];
  const count = [0, 0, 0, 0];
  for (const key of resident) {
    const level = unpackCellKey(key).level;
    if (desired.load.has(key)) count[level] = (count[level] ?? 0) + 1;
    else if (desired.keep.has(key)) kept[level]?.push(key);
    else evict.push(key);
  }
  const points = preparePoints(frame, cfg.interest);
  const overLimit: EvictionPlan['overLimit'] = [0, 0, 0, 0];
  for (const level of [0, 1, 2, 3] as const) {
    const band = kept[level] ?? [];
    const loaded = count[level] ?? 0;
    const excess = loaded + band.length - cfg.residentMax[level];
    if (excess <= 0) continue;
    const far = band
      .map((key) => ({ key, d: nearestDistanceM(key, points) }))
      .sort((a, b) => b.d - a.d || a.key - b.key);
    for (const { key } of far.slice(0, excess)) evict.push(key);
    overLimit[level] = Math.max(0, excess - band.length);
  }
  return { evict, overLimit };
}

/** 레벨별 개수(테스트·통계용). */
export function countByLevel(keys: Iterable<CellKey>): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (const key of keys) out[unpackCellKey(key).level]++;
  return out;
}
