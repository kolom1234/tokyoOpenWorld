// 자판기(M05-T03, 가상 브랜드 — 로고·상표 없음): 상업·주거 용도(카탈로그 usage) 건물 지면 링의 길가 변(바깥 3 m 안에 보도·차도)을 따라
// 누적 길이 perFacadeM(± 절반 난수)마다 벽에 붙여(wallGapM 0.08 — 캐릭터 지름 0.5 m보다 좁은 뒤 틈이 생기면 끼인다) 1–2대(나란히 1.15 m), 정면 = 벽 바깥.
// 차도 위·다른 건물 안이면 건너뜀. see ADR-0051
import type { BuildingRecord } from '../../../readers/plateau/types.ts';
import { type PlaceCtx, place, rngFor, type V2, yawOf } from './context.ts';

const FACING_PROBE_M = 3;
/** 변 끝(건물 모서리)에서 떨어질 거리(m) — 오목 모서리 옆 벽과 자판기 옆면 사이 좁은 틈 방지. */
const CORNER_M = 1.5;
const HALF_W_M = 0.55;
const HALF_DEPTH_M = 0.4;
const PAIR_GAP_M = 1.15;
const PAIR_P = 0.4;
/** 옆면 너머 이 거리 안에 벽이 있으면 놓지 않는다(캐릭터 지름 0.5 m + 콜라이더 단순화 여유). */
const SIDE_CLEAR_M = [0.3, 0.6] as const;

function signedArea(r: readonly number[]): number {
  let a = 0;
  const n = r.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (r[i * 3] as number) * (r[j * 3 + 2] as number) - (r[j * 3] as number) * (r[i * 3 + 2] as number);
  }
  return a / 2;
}

/** xz 점이 지면 링(stride 3) 안인가(짝홀). */
function inRing(r: readonly number[], x: number, z: number): boolean {
  let inside = false;
  const n = r.length / 3;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [r[i * 3] as number, r[i * 3 + 2] as number, r[j * 3] as number, r[j * 3 + 2] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Edge {
  a: V2;
  u: V2;
  L: number;
  n: V2;
}

/** 길가 변(바깥 법선 n 방향 3 m에 보도·차도, 길이 ≥ 모서리 여유 × 2). */
export function streetEdges(c: PlaceCtx, ring: readonly number[]): Edge[] {
  const out: Edge[] = [];
  const cnt = ring.length / 3;
  const sgn = signedArea(ring) > 0 ? 1 : -1;
  for (let i = 0; i < cnt; i++) {
    const j = (i + 1) % cnt;
    const a: V2 = [ring[i * 3] as number, ring[i * 3 + 2] as number];
    const v: V2 = [(ring[j * 3] as number) - a[0], (ring[j * 3 + 2] as number) - a[1]];
    const L = Math.hypot(v[0], v[1]);
    if (L < CORNER_M * 2) continue;
    const u: V2 = [v[0] / L, v[1] / L];
    const n: V2 = [u[1] * sgn, -u[0] * sgn];
    const m: V2 = [a[0] + v[0] / 2 + n[0] * FACING_PROBE_M, a[1] + v[1] / 2 + n[1] * FACING_PROBE_M];
    if (c.roads.classify(m[0], m[1]) !== 'none') out.push({ a, u, L, n });
  }
  return out;
}

export type Walls = (x: number, z: number) => boolean;

/** 자판기 몸체 모서리가 벽 안이 아니고, 양 옆면 너머 SIDE_CLEAR 안에 벽이 없나(벽에 붙은 뒤쪽 0.2 m 줄에서 검사). */
function clearOfWalls(walls: Walls, e: Edge, p: V2): boolean {
  const at = (du: number, dn: number): boolean =>
    walls(p[0] + e.u[0] * du + e.n[0] * dn, p[1] + e.u[1] * du + e.n[1] * dn);
  for (const s of [-1, 1]) {
    if (at(s * HALF_W_M, HALF_DEPTH_M) || at(s * HALF_W_M, -HALF_DEPTH_M + 0.02)) return false;
    for (const d of SIDE_CLEAR_M)
      if (at(s * (HALF_W_M + d), -0.2) || at(s * (HALF_W_M + d), HALF_DEPTH_M)) return false;
  }
  return true;
}

function placeAt(c: PlaceCtx, walls: Walls, e: Edge, s: number, gap: number): boolean {
  const back = gap + HALF_DEPTH_M;
  const p: V2 = [e.a[0] + e.u[0] * s + e.n[0] * back, e.a[1] + e.u[1] * s + e.n[1] * back];
  if (c.roads.classify(p[0], p[1]) === 'road' || c.inIntersection(p[0], p[1]) || c.inBuilding(p[0], p[1])) return false;
  if (!clearOfWalls(walls, e, p)) return false;
  return place(c, 'vendingMachine', p, yawOf(e.n));
}

/** 셀 건물 지면 외곽 링(정확 판정, bbox 거름). */
export function wallTest(buildings: readonly BuildingRecord[]): Walls {
  const rings: { r: number[]; x0: number; x1: number; z0: number; z1: number }[] = [];
  for (const b of buildings)
    for (const s of b.surfaces) {
      const r = s.kind === 'ground' ? s.ringsWF[0] : undefined;
      if (!r || r.length < 9) continue;
      let [x0, x1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (let i = 0; i < r.length; i += 3) {
        x0 = Math.min(x0, r[i] as number);
        x1 = Math.max(x1, r[i] as number);
        z0 = Math.min(z0, r[i + 2] as number);
        z1 = Math.max(z1, r[i + 2] as number);
      }
      rings.push({ r, x0, x1, z0, z1 });
    }
  return (x, z) => rings.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inRing(q.r, x, z));
}

export function placeVending(c: PlaceCtx, buildings: readonly BuildingRecord[]): number {
  const k = c.catalog.types.vendingMachine.place as { perFacadeM: number; wallGapM: number; usage: string[] };
  const usage = new Set(k.usage);
  const walls = wallTest(buildings);
  let n = 0;
  for (const b of buildings) {
    if (!b.usage || !usage.has(b.usage)) continue;
    const rng = rngFor(c, 'vending', b.gmlId);
    let next = rng.next() * k.perFacadeM;
    let acc = 0;
    for (const s of b.surfaces) {
      const ring = s.kind === 'ground' ? s.ringsWF[0] : undefined;
      if (!ring || ring.length < 9) continue;
      for (const e of streetEdges(c, ring)) {
        while (next <= acc + e.L) {
          const t = Math.min(Math.max(next - acc, CORNER_M), e.L - CORNER_M);
          if (placeAt(c, walls, e, t, k.wallGapM)) {
            n++;
            if (
              rng.next() < PAIR_P &&
              t + PAIR_GAP_M <= e.L - CORNER_M &&
              placeAt(c, walls, e, t + PAIR_GAP_M, k.wallGapM)
            )
              n++;
          }
          next += k.perFacadeM * (0.5 + rng.next());
        }
        acc += e.L;
      }
    }
  }
  return n;
}
