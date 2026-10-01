// 가상 간판(M05-T06): 상업 용도 건물의 길가 변을 따라 — 돌출 간판(袖看板, 벽에서 바깥으로 튀어나온 세로 상자를 층마다 쌓은 열), 입간판(立て看板, 보도 위 A형),
// 옥상 광고탑(높은 건물 길가 쪽 옥상, 폭 = scale × 10 m). 브랜드·크기 변형은 렌더가 위치 해시로 고른다(props.inst 형식 그대로). 실존 상호 없음.
// y = WF 높이(셀 원점 y = 0이라 셀 로컬과 같다). see ADR-0054
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { type PlaceCtx, place, rngFor, type V2, yawOf } from './context.ts';
import { streetEdges, type Walls, wallTest } from './vending.ts';

/** 돌출 간판 상자 높이·간격(m), 첫 상자 바닥 높이. 렌더 모델(signs/models PROJECTING.h, 크기 변형 ≤ 1.1배)과 맞춘 값. */
export const SIGN_BOX_H = 2.2;
const SIGN_STEP_M = 2.5;
const SIGN_BASE_M = 3.6;
const SIGN_MAX_BOXES = 6;
/** 옥상 광고탑 기준 폭(m) — scale 1 = 10 m. */
export const BILLBOARD_UNIT_M = 10;

interface SignPlace {
  usage: string[];
  perFacadeM: number;
  minHeightM: number;
  p?: number;
}

function heightOf(b: BuildingRecord): { base: number; top: number } {
  let [lo, hi] = [Infinity, -Infinity];
  for (const s of b.surfaces)
    for (const r of s.ringsWF)
      for (let i = 1; i < r.length; i += 3) {
        lo = Math.min(lo, r[i] as number);
        hi = Math.max(hi, r[i] as number);
      }
  return { base: lo, top: b.measuredHeightM !== null ? lo + b.measuredHeightM : hi };
}

function inRingXZ(r: readonly number[], x: number, z: number): boolean {
  let inside = false;
  const n = r.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [r[i * 3] as number, r[i * 3 + 2] as number, r[j * 3] as number, r[j * 3 + 2] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 이 점 위 지붕 면(평균 높이)의 최댓값(WF), 없으면 undefined. */
function roofAt(b: BuildingRecord, p: V2): number | undefined {
  let best: number | undefined;
  for (const s of b.surfaces) {
    const r = s.kind === 'roof' ? s.ringsWF[0] : undefined;
    if (!r || r.length < 9 || !inRingXZ(r, p[0], p[1])) continue;
    let y = 0;
    for (let i = 1; i < r.length; i += 3) y += r[i] as number;
    y /= r.length / 3;
    best = best === undefined ? y : Math.max(best, y);
  }
  return best;
}

const groundRings = (b: BuildingRecord): number[][] =>
  b.surfaces
    .filter((s) => s.kind === 'ground' && (s.ringsWF[0]?.length ?? 0) >= 9)
    .map((s) => s.ringsWF[0] as number[]);

/** 돌출 간판 열: 길가 변 perFacadeM(± 절반)마다 벽 바깥면에 상자를 2.5 m마다 쌓는다(맨 위는 건물 높이 − 1 m까지). */
function placeProjecting(c: PlaceCtx, walls: Walls, b: BuildingRecord, k: SignPlace): number {
  const { base, top } = heightOf(b);
  // 맨 위 상자 윗면 ≤ 건물 높이 − 1 m.
  const boxes = Math.min(SIGN_MAX_BOXES, Math.floor((top - base - SIGN_BASE_M - SIGN_BOX_H - 1) / SIGN_STEP_M) + 1);
  if (top - base < k.minHeightM || boxes < 1) return 0;
  const rng = rngFor(c, 'sign-projecting', b.gmlId);
  let n = 0;
  for (const ring of groundRings(b)) {
    for (const e of streetEdges(c, ring)) {
      for (let t = rng.next() * k.perFacadeM; t < e.L - 1; t += k.perFacadeM * (0.5 + rng.next())) {
        if (t < 1) continue;
        const wall: V2 = [e.a[0] + e.u[0] * t, e.a[1] + e.u[1] * t];
        const front: V2 = [wall[0] + e.n[0] * 1.2, wall[1] + e.n[1] * 1.2];
        if (walls(front[0], front[1])) continue;
        const p: V2 = [wall[0] + e.n[0] * 0.05, wall[1] + e.n[1] * 0.05];
        const count = 1 + Math.floor(rng.next() * boxes);
        for (let i = 0; i < count; i++) {
          const y = base + SIGN_BASE_M + i * SIGN_STEP_M;
          if (place(c, 'signProjecting', p, yawOf(e.n), 1, y)) n++;
        }
      }
    }
  }
  return n;
}

/** 입간판: 길가 변 perFacadeM마다 확률 p로 벽에 붙여(보도 위). */
function placeStanding(c: PlaceCtx, walls: Walls, b: BuildingRecord, k: SignPlace): number {
  const rng = rngFor(c, 'sign-standing', b.gmlId);
  let n = 0;
  for (const ring of groundRings(b)) {
    for (const e of streetEdges(c, ring)) {
      for (let t = 1.5 + rng.next() * k.perFacadeM; t < e.L - 1.5; t += k.perFacadeM * (0.5 + rng.next())) {
        if (rng.next() >= (k.p ?? 1)) continue;
        // 벽에 붙임(뒤 틈 0.08 m — 캐릭터가 끼는 틈을 만들지 않는다, ADR-0051 자판기와 같은 이유).
        const back = 0.25 + 0.08;
        const p: V2 = [e.a[0] + e.u[0] * t + e.n[0] * back, e.a[1] + e.u[1] * t + e.n[1] * back];
        if (c.roads.classify(p[0], p[1]) === 'road' || c.inIntersection(p[0], p[1]) || walls(p[0], p[1])) continue;
        if (place(c, 'signStanding', p, yawOf(e.n))) n++;
      }
    }
  }
  return n;
}

/** 옥상 광고탑: 가장 긴 길가 변(≥ 8 m) 안쪽 1.5 m 지붕 위, 확률 p. */
function placeRooftop(c: PlaceCtx, b: BuildingRecord, k: SignPlace): number {
  const { base, top } = heightOf(b);
  if (top - base < k.minHeightM) return 0;
  const rng = rngFor(c, 'sign-rooftop', b.gmlId);
  if (rng.next() >= (k.p ?? 1)) return 0;
  const edges = groundRings(b).flatMap((r) => streetEdges(c, r));
  const e = edges.reduce<(typeof edges)[number] | undefined>((a, q) => (!a || q.L > a.L ? q : a), undefined);
  if (!e || e.L < 8) return 0;
  const p: V2 = [e.a[0] + e.u[0] * (e.L / 2) - e.n[0] * 1.5, e.a[1] + e.u[1] * (e.L / 2) - e.n[1] * 1.5];
  const roof = roofAt(b, p);
  if (roof === undefined) return 0;
  const width = Math.min(e.L * 0.7, 14);
  return place(c, 'signRooftop', p, yawOf(e.n), width / BILLBOARD_UNIT_M, roof) ? 1 : 0;
}

export function placeSigns(
  c: PlaceCtx,
  buildings: readonly BuildingRecord[],
): { projecting: number; standing: number; rooftop: number } {
  const t = c.catalog.types;
  const kp = t.signProjecting?.place as SignPlace | undefined;
  const ks = t.signStanding?.place as SignPlace | undefined;
  const kr = t.signRooftop?.place as SignPlace | undefined;
  const out = { projecting: 0, standing: 0, rooftop: 0 };
  const walls = wallTest(buildings);
  for (const b of buildings) {
    if (!b.usage) continue;
    if (kp?.usage.includes(b.usage)) out.projecting += placeProjecting(c, walls, b, kp);
    if (ks?.usage.includes(b.usage)) out.standing += placeStanding(c, walls, b, ks);
    if (kr?.usage.includes(b.usage)) out.rooftop += placeRooftop(c, b, kr);
  }
  return out;
}
