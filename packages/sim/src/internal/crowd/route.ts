// 보행 경로의 횡단 분해(M06-T03, ADR-0063): 전체 필터(횡단 포함) 경로의 꺾은선에서 처음 들어가는 횡단보도 띠를 찾고,
// 진입 쪽 대기점(연석 뒤 깊이·띠 안 가로 오프셋)과 건너편 출구점을 만든다. 순수 기하(내비 질의 없음) — 스냅은 호출 측.
import type { CrossingRec } from './nav-world.ts';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface CrossingHit {
  rec: CrossingRec;
  /** true = a 쪽에서 들어가 b로 건넌다. */
  fromA: boolean;
}

/** 띠 안(끝 5 % 여유 제외) 여부. */
export function inBand(c: CrossingRec, x: number, z: number, shrink = 0): boolean {
  const px = x - c.a[0];
  const pz = z - c.a[2];
  const t = px * c.ux + pz * c.uz;
  if (t < c.len * 0.05 || t > c.len * 0.95) return false;
  return Math.abs(-px * c.uz + pz * c.ux) <= c.halfWidth - shrink;
}

/** 경로(꺾은선)를 1 m 간격으로 따라가며 처음 들어가는 띠. 들어가기 전 점이 a·b 중 가까운 쪽 = 진입 쪽. */
export function firstCrossing(path: readonly V3[], crossings: readonly CrossingRec[]): CrossingHit | undefined {
  if (crossings.length === 0 || path.length < 2) return undefined;
  let prev = path[0] as V3;
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i] as V3;
    const q = path[i + 1] as V3;
    const L = Math.hypot(q.x - p.x, q.z - p.z);
    const n = Math.max(1, Math.ceil(L));
    for (let s = 0; s <= n; s++) {
      const x = p.x + ((q.x - p.x) * s) / n;
      const z = p.z + ((q.z - p.z) * s) / n;
      for (const c of crossings)
        if (inBand(c, x, z)) {
          const da = Math.hypot(prev.x - c.a[0], prev.z - c.a[2]);
          const db = Math.hypot(prev.x - c.b[0], prev.z - c.b[2]);
          return { rec: c, fromA: da <= db };
        }
      prev = { x, y: p.y, z };
    }
  }
  return undefined;
}

/** 좌측 보행 차로(일본 — 마주 오는 흐름과 갈라 막힘 방지): u = [0, 1) 난수 → lat ∈ [−0.95, −0.05](진행 방향 왼쪽 절반). */
export const keepLeftLat = (u: number): number => -(0.05 + 0.9 * u);

/**
 * 대기점: 진입 끝에서 보도 쪽으로 depth + 0.4 m 뒤, 띠 방향의 수직으로 lat(−1..1 × (반폭 − 0.4), + = 진행 방향 오른쪽) — 출구점은 반대 끝 너머 2.5 m
 * (건너편 대기 무리는 같은 끝의 다른 절반에 서 있다).
 */
export function crossingPoints(
  h: CrossingHit,
  lat: number,
  depth: number,
): { wait: V3; exit: V3; dir: [number, number] } {
  const c = h.rec;
  const s = h.fromA ? c.a : c.b;
  const e = h.fromA ? c.b : c.a;
  const ux = h.fromA ? c.ux : -c.ux;
  const uz = h.fromA ? c.uz : -c.uz;
  const off = lat * Math.max(0, c.halfWidth - 0.4);
  const nx = -uz * off;
  const nz = ux * off;
  return {
    wait: { x: s[0] - ux * (depth + 0.4) + nx, y: s[1], z: s[2] - uz * (depth + 0.4) + nz },
    exit: { x: e[0] + ux * 2.5 + nx, y: e[1], z: e[2] + uz * 2.5 + nz },
    dir: [ux, uz],
  };
}
