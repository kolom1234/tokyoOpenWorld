// 교량 면 걷어내기(M05-T08): OSM 계단이 PLATEAU 보도육교와 만나는 곳의 교량 면 정리. see ADR-0056
// 1) 면 중심(xz)이 계단 통로(옆 반폭 + 0.6 m, 아래 끝 ~ 위 끝 + 착지판) 안이고 모든 꼭짓점이 옆 반폭 + 1.6 m 띠 안 → 통째로 걷어낸다.
//    PLATEAU가 계단을 속이 찬 블록(지면 ~ 상판 벽 + 비탈 지붕)으로 둔 곳(新都心歩道橋)에서 OSM 계단이 블록 안으로 들어간다.
//    남김: 상판 윗면(평평 ≤ 0.3 m, 위 끝 높이 − 0.3 m 이상), 위 끝 너머 아랫면, 띠 밖까지 뻗은 면(상판 가장자리 난간 — 2)로).
// 2) 계단 위 끝 "문"(끝 0.6 m 앞 ~ 착지판, 계단 폭)을 가로지르는 면(상판 가장자리 난간·슬래브 옆면 — 가장자리 전체가 긴 폴리곤 하나라 중심이 멀다)
//    → 계단 폭 + 0.2 m 띠 밖 두 조각만 남긴다(수직 평면 2개로 자름).
// 통로 = 이웃 셀 소유 계단 포함(교량이 셀 경계를 걸친다).
import type { SurfaceKind } from '../../../readers/plateau/types.ts';
import type { StairSpec } from '../../derive/stairs.ts';

/** 점(xz) → 꺾은선 위 거리 s(첫 구간은 아래로, 끝 구간은 위로 연장)·수직 거리 d·전체 길이 L. */
function alongPath(path: readonly [number, number][], x: number, z: number): { s: number; d: number; L: number } {
  let [acc, best] = [0, { s: Number.NaN, d: Infinity }];
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i] as [number, number], path[i + 1] as [number, number]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const [dx, dz] = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const raw = (x - a[0]) * dx + (z - a[1]) * dz;
    const t = Math.min(i + 2 < path.length ? l : Infinity, Math.max(i === 0 ? -Infinity : 0, raw));
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best.d) best = { s: acc + t, d };
    acc += l;
  }
  return { ...best, L: acc };
}

/** 계단 위 끝 문: 끝점 c, 진행 방향 d, 옆 방향 u(xz 단위). */
interface Gate {
  c: [number, number];
  d: [number, number];
  u: [number, number];
  hw: number;
  landing: number;
}

function gateOf(st: StairSpec): Gate {
  const [p, q] = [st.path[st.path.length - 2] as [number, number], st.path[st.path.length - 1] as [number, number]];
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const d: [number, number] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
  return { c: q, d, u: [-d[1], d[0]], hw: st.width / 2 + 0.1, landing: st.landing };
}

/** 링 변 중 하나라도 문 사각형(a ∈ [−0.6, landing], |t| ≤ hw)을 지나는가(Liang–Barsky). */
function crossesGate(g: Gate, ring: readonly number[]): boolean {
  const at = (i: number): [number, number] => {
    const [x, z] = [(ring[i] as number) - g.c[0], (ring[i + 2] as number) - g.c[1]];
    return [x * g.d[0] + z * g.d[1], x * g.u[0] + z * g.u[1]];
  };
  const n = ring.length / 3;
  for (let k = 0; k < n; k++) {
    const [a, b] = [at(k * 3), at(((k + 1) % n) * 3)];
    let [t0, t1] = [0, 1];
    const lim: [number, number][] = [
      [-(b[0] - a[0]), a[0] + 0.6],
      [b[0] - a[0], g.landing - a[0]],
      [-(b[1] - a[1]), a[1] + g.hw],
      [b[1] - a[1], g.hw - a[1]],
    ];
    let ok = true;
    for (const [p, q] of lim) {
      if (Math.abs(p) < 1e-12) {
        if (q < 0) ok = false;
      } else if (p < 0) t0 = Math.max(t0, q / p);
      else t1 = Math.min(t1, q / p);
    }
    if (ok && t0 <= t1) return true;
  }
  return false;
}

/** 수직 평면(옆 좌표 t·sign ≥ hw) 쪽만 남기는 Sutherland–Hodgman(3D 링 그대로). */
function clipSide(g: Gate, ring: readonly number[], sign: 1 | -1): number[] {
  const f = (i: number) =>
    (((ring[i] as number) - g.c[0]) * g.u[0] + ((ring[i + 2] as number) - g.c[1]) * g.u[1]) * sign - g.hw;
  const out: number[] = [];
  const n = ring.length / 3;
  for (let k = 0; k < n; k++) {
    const [i, j] = [k * 3, ((k + 1) % n) * 3];
    const [fi, fj] = [f(i), f(j)];
    if (fi >= 0) out.push(ring[i] as number, ring[i + 1] as number, ring[i + 2] as number);
    if (fi >= 0 !== fj >= 0) {
      const t = fi / (fi - fj);
      for (let a = 0; a < 3; a++)
        out.push((ring[i + a] as number) + ((ring[j + a] as number) - (ring[i + a] as number)) * t);
    }
  }
  return out.length >= 9 ? out : [];
}

/** 모든 꼭짓점이 계단 축에서 옆 반폭 + 1.6 m 안(통로를 따라 놓인 면 — 가로지르는 긴 난간이 아님). */
function narrow(c: StairSpec, ring: readonly number[]): boolean {
  for (let i = 0; i < ring.length; i += 3)
    if (alongPath(c.path, ring[i] as number, ring[i + 2] as number).d > c.width / 2 + 1.6) return false;
  return true;
}

/** 면 1개 처리: 'drop' = 통째로 걷어냄, 링 배열 = 문 띠를 잘라낸 조각, null = 그대로. */
export function carveSurface(
  corridors: readonly StairSpec[],
  kind: SurfaceKind,
  ring: readonly number[],
): 'drop' | number[][] | null {
  const n = ring.length / 3;
  if (n < 3 || corridors.length === 0) return null;
  let [cx, cz, lo, hi] = [0, 0, Infinity, -Infinity];
  for (let i = 0; i < ring.length; i += 3) {
    cx += (ring[i] as number) / n;
    cz += (ring[i + 2] as number) / n;
    lo = Math.min(lo, ring[i + 1] as number);
    hi = Math.max(hi, ring[i + 1] as number);
  }
  let pieces: number[][] | null = null;
  for (const c of corridors) {
    const deck = kind === 'roof' && hi - lo <= 0.3 && lo >= c.y1 - 0.3;
    const at = alongPath(c.path, cx, cz);
    const inside = at.d <= c.width / 2 + 0.6 && at.s >= 0 && at.s <= at.L + c.landing;
    if (inside && !deck && !(kind === 'ground' && at.s > at.L) && narrow(c, ring)) return 'drop';
    if (deck || kind === 'ground') continue;
    const g = gateOf(c);
    const cur: number[][] = pieces ?? [[...ring]];
    if (!cur.some((r) => crossesGate(g, r))) continue;
    const next: number[][] = cur.flatMap((r) => (crossesGate(g, r) ? [clipSide(g, r, 1), clipSide(g, r, -1)] : [r]));
    pieces = next.filter((r) => r.length >= 9);
  }
  return pieces;
}
