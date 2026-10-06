// 신호 현시 코드(M06-T02, ADR-0062): 신호기(소품)마다 교차로 ID·계획·그룹을 정수 코드로 → props.inst 5번째 칸(신호 종류는 scale 대신 코드).
// 교차로 = PLATEAU 車道交差部(TrafficArea 1020) 조각 중 붙은 것끼리 묶은 것(셀 + 8-이웃 — 셀 경계 너머도 같은 중심·같은 ID),
// 도로 방향 A·B = 중심 40 m 안 OSM 차도 선의 각도 히스토그램 두 봉우리(roadAxes — 없으면 면 PCA와 그 수직). 신호기에서 40 m 안 교차로가
// 없으면 횡단 중점 4 m 격자를 중심으로(단일로 신호 횡단). 그룹: 0 차량 A·1 차량 B(진행 방향이 가까운 도로), 2 보행 A·3 보행 B(B를 건너면 A).
// 코드 = id(20비트) × 16 + 계획(2비트) × 4 + 그룹 — 2^24 미만이라 f32에 정확히 들어간다. 계획 = content/sim/signal-plans.json 사이트 반경 안이면 그 번호.
import { hash32 } from '@sanpo/core';
import type { RoadRecord } from '../../../readers/plateau/types.ts';
import type { V2 } from './context.ts';

export interface SignalPlanSite {
  centerWF: [number, number];
  radiusM: number;
  /** content/sim/signal-plans.json plans 순서(0 = 기본). */
  plan: number;
}

/** 계획 규칙(content/sim/signal-plans.json — ADR-0069): 계획별 주기·연동 여부, minor 계획 번호(간선 × 작은 길 교차로). */
export interface SignalPlanRules {
  cycles: readonly number[];
  coordinated: readonly boolean[];
  minorPlan?: number;
}

export interface SignalSite {
  id: number;
  cx: number;
  cz: number;
  /** 이 계획의 주기(s)·연동 여부 — 오프셋 칸(없으면 120 s·0번 계획만 연동). */
  cycleS?: number;
  coordinated?: boolean;
  /** 도로 방향 A·B(rad, mod π, WF x·z 평면 atan2(z, x)) — 신호기는 가까운 쪽 그룹. */
  axis: number;
  axisB: number;
  plan: number;
}

const NEAR_M = 40;
const ID_MASK = 0xfffff;

const GAP_M = 1.5;

type Box = { x0: number; x1: number; z0: number; z1: number; pts: number[] };

/** 겹치거나 GAP_M 안으로 붙은 상자끼리 묶기(합집합 찾기) — 큰 교차로(스크램블)는 1020 레코드 여러 개로 나뉜다. */
function clusterBoxes(boxes: readonly Box[]): Box[][] {
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    return r;
  };
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const p = boxes[a] as Box;
      const q = boxes[b] as Box;
      if (p.x0 - GAP_M <= q.x1 && q.x0 - GAP_M <= p.x1 && p.z0 - GAP_M <= q.z1 && q.z0 - GAP_M <= p.z1)
        parent[find(b)] = find(a);
    }
  const groups = new Map<number, Box[]>();
  boxes.forEach((bx, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), bx]);
  });
  return [...groups.values()];
}

const AXIS_REACH_M = 40;

const BIN_RAD = Math.PI / 36;
const MIN_SPLIT_RAD = Math.PI / 6;

/** mod π 각도 차(0–π/2). */
export const axisGap = (a: number, b: number): number => {
  const d = Math.abs((((a - b) % Math.PI) + Math.PI) % Math.PI);
  return Math.min(d, Math.PI - d);
};

/** 봉우리 bin 중심 ±15° 안 선분의 2배각 가중 평균(mod π). */
function refine(segs: readonly (readonly [number, number])[], c: number): number {
  let sx = 0;
  let sy = 0;
  for (const [a, w] of segs)
    if (axisGap(a, c) <= Math.PI / 12) {
      sx += Math.cos(2 * a) * w;
      sy += Math.sin(2 * a) * w;
    }
  const m = Math.atan2(sy, sx) / 2;
  return ((m % Math.PI) + Math.PI) % Math.PI;
}

/**
 * 교차로의 두 도로 방향(A, B; mod π): 선분 (각도, 길이) 5° 히스토그램(1-2-1 평활)의 최고 봉우리 = A, A와 30° 이상 떨어진 최고 봉우리 = B
 * (없으면 A + 90°). 사거리가 직교가 아니어도(도겐자카 등 ~70°) 신호기를 가까운 쪽 방향으로 나눈다 — 단일 축 ±45°는 비스듬한 교차로에서
 * 같은 길 양쪽을 다른 그룹에 넣었다. 선분이 없으면 undefined.
 */
export function roadAxes(segs: readonly (readonly [number, number])[]): [number, number] | undefined {
  const n = Math.round(Math.PI / BIN_RAD);
  const h = new Float64Array(n);
  for (const [a, w] of segs) {
    const k = Math.floor((((a % Math.PI) + Math.PI) % Math.PI) / BIN_RAD) % n;
    h[k] = (h[k] as number) + w;
  }
  const sm = h.map((_, k) => 2 * (h[k] as number) + (h[(k + 1) % n] as number) + (h[(k + n - 1) % n] as number));
  const centre = (k: number) => (k + 0.5) * BIN_RAD;
  let ka = -1;
  for (let k = 0; k < n; k++) if ((sm[k] as number) > 0 && (ka < 0 || (sm[k] as number) > (sm[ka] as number))) ka = k;
  if (ka < 0) return undefined;
  const a = refine(segs, centre(ka));
  let kb = -1;
  for (let k = 0; k < n; k++)
    if (
      axisGap(centre(k), a) >= MIN_SPLIT_RAD &&
      (sm[k] as number) > 0 &&
      (kb < 0 || (sm[k] as number) > (sm[kb] as number))
    )
      kb = k;
  const b = kb < 0 ? (a + Math.PI / 2) % Math.PI : refine(segs, centre(kb));
  return [a, b];
}

/** OSM 차도 선(WF xz 꺾은선)의 중심 AXIS_REACH_M 안 선분 → (각도, 길이). 신호기 방향이 이 선 기준이라 축도 같은 출처로(ADR-0062). */
/** 도로 등급 가중(M06-T05 — ADR-0065): 축 히스토그램이 간선 쪽으로 기울게(주축 A = 간선 → 기본 계획의 긴 녹색). */
const CLASS_WEIGHT: Readonly<Record<string, number>> = { trunk: 4, primary: 4, secondary: 3, tertiary: 2 };

/** OSM 차도 선 → (꺾은선, 등급 가중) — siteFinder 입력. */
export function weightedRoadLines(records: readonly { rings: number[][]; tags: Record<string, string> }[]): {
  lines: number[][];
  weights: number[];
} {
  return {
    lines: records.map((r) => r.rings[0] ?? []),
    weights: records.map((r) => CLASS_WEIGHT[(r.tags.highway ?? '').replace(/_link$/, '')] ?? 1),
  };
}

export function osmSegmentsNear(
  lines: readonly (readonly number[])[],
  cx: number,
  cz: number,
  weights?: readonly number[],
): [number, number][] {
  const out: [number, number][] = [];
  for (const [li, xz] of lines.entries())
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const ax = xz[i] as number;
      const az = xz[i + 1] as number;
      const bx = xz[i + 2] as number;
      const bz = xz[i + 3] as number;
      if (Math.hypot((ax + bx) / 2 - cx, (az + bz) / 2 - cz) > AXIS_REACH_M) continue;
      out.push([Math.atan2(bz - az, bx - ax), Math.hypot(bx - ax, bz - az) * (weights?.[li] ?? 1)]);
    }
  return out;
}

/** 축(mod π) ±15° 안 OSM 차도 선분의 최대 등급 가중(중심 AXIS_REACH_M 안, 없으면 0) — minor 교차로 판정(ADR-0069). */
export function axisClass(
  lines: readonly (readonly number[])[],
  weights: readonly number[] | undefined,
  cx: number,
  cz: number,
  axis: number,
): number {
  let best = 0;
  for (const [li, xz] of lines.entries())
    for (let i = 0; i + 3 < xz.length; i += 2) {
      const [ax, az, bx, bz] = [xz[i] as number, xz[i + 1] as number, xz[i + 2] as number, xz[i + 3] as number];
      if (Math.hypot((ax + bx) / 2 - cx, (az + bz) / 2 - cz) > AXIS_REACH_M) continue;
      if (axisGap(Math.atan2(bz - az, bx - ax), axis) > Math.PI / 12) continue;
      best = Math.max(best, weights?.[li] ?? 1);
    }
  return best;
}

/** minor 계획 조건: 주축이 간선(secondary 이상 — 가중 ≥ 3)이고 다른 축이 tertiary 이하(≤ 2). */
export const MINOR_MAIN_CLASS = 3;
export const MINOR_CROSS_CLASS = 2;

/** 1020 조각 → 교차로(붙은 조각 묶음의 bbox 중심 + 주변 차도 방향 축). 셀 + 8-이웃이면 셀이 달라도 같은 묶음·같은 축. */
export function junctionsOf(roads: readonly RoadRecord[]): { cx: number; cz: number; axis: number }[] {
  const boxes: Box[] = [];
  for (const r of [...roads].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (r.functionCode !== 'TrafficArea:1020') continue;
    const pts: number[] = [];
    for (const ring of r.polygonWF)
      for (let i = 0; i + 2 < ring.length; i += 3) pts.push(ring[i] as number, ring[i + 2] as number);
    if (pts.length < 6) continue;
    const xs = pts.filter((_, k) => k % 2 === 0);
    const zs = pts.filter((_, k) => k % 2 === 1);
    boxes.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), pts });
  }
  return clusterBoxes(boxes)
    .map((g) => {
      const x0 = Math.min(...g.map((b) => b.x0));
      const x1 = Math.max(...g.map((b) => b.x1));
      const z0 = Math.min(...g.map((b) => b.z0));
      const z1 = Math.max(...g.map((b) => b.z1));
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      let sxx = 0;
      let szz = 0;
      let sxz = 0;
      for (const b of g)
        for (let i = 0; i < b.pts.length; i += 2) {
          const dx = (b.pts[i] as number) - cx;
          const dz = (b.pts[i + 1] as number) - cz;
          sxx += dx * dx;
          szz += dz * dz;
          sxz += dx * dz;
        }
      const pca = (0.5 * Math.atan2(2 * sxz, sxx - szz) + Math.PI) % Math.PI;
      return { cx, cz, axis: pca };
    })
    .sort((a, b) => a.cx - b.cx || a.cz - b.cz);
}

const idOf = (cx: number, cz: number): number => hash32(Math.round(cx), Math.round(cz)) & ID_MASK;

/** 점 p(WF) → 신호 사이트(가까운 교차로, 없으면 fallback 중심·축). */
export function siteFinder(
  junctions: readonly { cx: number; cz: number; axis: number }[],
  plans: readonly SignalPlanSite[],
  osmLines: readonly (readonly number[])[] = [],
  /** osmLines별 등급 가중(없으면 1). */
  weights?: readonly number[],
  /** 계획 규칙(주기·연동·minor — ADR-0069). 없으면 사이트 밖 = 0번, 120 s. */
  rules?: SignalPlanRules,
) {
  const axisCache = new Map<number, [number, number]>();
  const axesOf = (cx: number, cz: number, fallback: number): [number, number] => {
    const key = Math.round(cx) * 100003 + Math.round(cz);
    let a = axisCache.get(key);
    if (a === undefined) {
      a = roadAxes(osmSegmentsNear(osmLines, cx, cz, weights)) ?? [fallback, (fallback + Math.PI / 2) % Math.PI];
      axisCache.set(key, a);
    }
    return a;
  };
  const planAt = (cx: number, cz: number, axes: [number, number]): number => {
    const site = plans.find((s) => Math.hypot(cx - s.centerWF[0], cz - s.centerWF[1]) <= s.radiusM);
    if (site) return site.plan;
    if (rules?.minorPlan === undefined) return 0;
    const a = axisClass(osmLines, weights, cx, cz, axes[0]);
    const b = axisClass(osmLines, weights, cx, cz, axes[1]);
    return a >= MINOR_MAIN_CLASS && b <= MINOR_CROSS_CLASS ? rules.minorPlan : 0;
  };
  return (p: V2, fallback: { center: V2; axis: number }): SignalSite => {
    let best: { cx: number; cz: number; axis: number } | undefined;
    let bd = NEAR_M;
    for (const j of junctions) {
      const d = Math.hypot(p[0] - j.cx, p[1] - j.cz);
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    const cx = best ? best.cx : Math.round(fallback.center[0] / 4) * 4;
    const cz = best ? best.cz : Math.round(fallback.center[1] / 4) * 4;
    const [axis, axisB] = axesOf(cx, cz, best ? best.axis : ((fallback.axis % Math.PI) + Math.PI) % Math.PI);
    const plan = planAt(cx, cz, [axis, axisB]);
    const timing = rules ? { cycleS: rules.cycles[plan] ?? 120, coordinated: rules.coordinated[plan] ?? false } : {};
    return { id: idOf(cx, cz), cx, cz, axis, axisB, plan, ...timing };
  };
}

/** 방향 (dx, dz)가 B보다 A에 가까운가(mod π). */
export function nearerA(site: Pick<SignalSite, 'axis' | 'axisB'>, dx: number, dz: number): boolean {
  const a = Math.atan2(dz, dx);
  return axisGap(a, site.axis) <= axisGap(a, site.axisB);
}

/** 연동(系統) 오프셋 칸(2 s): 주축 A 방향 위치 ÷ 진행 속도(12 m/s ≈ 43 km/h)를 계획 주기로 접어 같은 간선의 교차로가 녹색 물결(M06-T05, ADR-0065·0069). 연동 아닌 계획 = 0. */
export const PROGRESSION_MS = 12;
const CYCLE_S = 120;
export function offsetSlot(site: Pick<SignalSite, 'cx' | 'cz' | 'axis' | 'plan' | 'cycleS' | 'coordinated'>): number {
  if (!(site.coordinated ?? site.plan === 0)) return 0;
  const cycle = site.cycleS ?? CYCLE_S;
  const p = site.cx * Math.cos(site.axis) + site.cz * Math.sin(site.axis);
  const off = ((((-p / PROGRESSION_MS) % cycle) + cycle) % cycle) / 2;
  return Math.floor(off) % 64;
}

/**
 * 그룹: 차량 = 진행 방향(d — 정면은 −d로 다가오는 차를 봄)이 가까운 도로, 보행 = 건너는 도로(보행 방향의 수직)가 B면 A(차량 A와 같이 녹색).
 * T05 차선 그래프의 접근로 그룹도 같은 규칙(nearerA)으로 나눠 교통·보행 신호가 일치한다.
 * 코드(24비트, f32 정확) = ((ID 14비트 × 64 + 오프셋 칸 6비트) × 16) + 계획 × 4 + 그룹 — M06-T05에서 ID 20 → 14비트 + 오프셋 칸(ADR-0065).
 */
export function signalCode(site: SignalSite, kind: 'vehicle' | 'pedestrian', dx: number, dz: number): number {
  const group = kind === 'vehicle' ? (nearerA(site, dx, dz) ? 0 : 1) : nearerA(site, -dz, dx) ? 3 : 2;
  return ((site.id & 0x3fff) * 64 + offsetSlot(site)) * 16 + (site.plan & 3) * 4 + group;
}

/** 코드 해석(테스트·런타임 공용 규약 — sim signals/controller.ts와 같은 비트 배치). */
export const decodeSignal = (code: number) => ({
  id: Math.floor(code / 1024),
  slot: Math.floor(code / 16) % 64,
  plan: Math.floor(code / 4) % 4,
  group: code % 4,
});
