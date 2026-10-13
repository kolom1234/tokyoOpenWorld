// 승강장 윗면 질의(M07-T06 후속 — ADR-0082): sim 승강장 메시(railStatic().platforms 윗면 삼각형) → 8 m 격자 버킷.
// 점 높이(윗면 위인가), 가장자리 여유(반경 r 원 위 표본이 모두 윗면), 안전 도착점(힌트 주변 나선 탐색), 선로 구덩이(승강장 근처 레일 아래) 판정.
// 순수 함수(단위 테스트). 계단 F 이동·카메라 아래 내리기·선로 구조가 같이 쓴다.
import type { Vec3d } from '@sanpo/core';

export interface PlatformMesh {
  positions: Float64Array;
  indices: Uint32Array;
  topIndexCount: number;
}

const CELL = 8;
/** 격자 칸 번호 → 숫자 키(문자열 키보다 수 배 빠르다 — 메인 스레드 4 ms). */
const key = (i: number, j: number) => (i + 0x8000) * 0x10000 + (j + 0x8000);

export interface PlatformTops {
  /** 윗면 높이(없으면 undefined — 승강장 밖). */
  topAt(x: number, z: number): number | undefined;
  /** 윗면 삼각형 수(빈 메시 = 0). */
  readonly triangles: number;
  /** 윗면이 닿는 격자 칸(i, j — CELL m). */
  cells(): Iterable<readonly [number, number]>;
}

/** 윗면 삼각형 → 격자 버킷(삼각형 xz 경계 상자가 닿는 칸마다). */
export function platformTops(m: PlatformMesh): PlatformTops {
  const P = m.positions;
  const buckets = new Map<number, number[]>();
  const n = Math.floor(m.topIndexCount / 3);
  for (let t = 0; t < n; t++) {
    const [a, b, c] = [m.indices[t * 3] as number, m.indices[t * 3 + 1] as number, m.indices[t * 3 + 2] as number];
    const xs = [P[a * 3] as number, P[b * 3] as number, P[c * 3] as number];
    const zs = [P[a * 3 + 2] as number, P[b * 3 + 2] as number, P[c * 3 + 2] as number];
    for (let i = Math.floor(Math.min(...xs) / CELL); i <= Math.floor(Math.max(...xs) / CELL); i++)
      for (let j = Math.floor(Math.min(...zs) / CELL); j <= Math.floor(Math.max(...zs) / CELL); j++) {
        const k = key(i, j);
        const list = buckets.get(k) ?? [];
        list.push(t);
        buckets.set(k, list);
      }
  }
  const topAt = (x: number, z: number): number | undefined => {
    let best: number | undefined;
    for (const t of buckets.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const y = triY(P, m.indices, t, x, z);
      if (y !== undefined && (best === undefined || y > best)) best = y;
    }
    return best;
  };
  const cells = function* (): Iterable<readonly [number, number]> {
    for (const k of buckets.keys()) yield [Math.floor(k / 0x10000) - 0x8000, (k % 0x10000) - 0x8000] as const;
  };
  return { topAt, triangles: n, cells };
}

/** 삼각형 t 안이면 그 점 높이(무게중심 보간), 밖이면 undefined. */
function triY(P: Float64Array, I: Uint32Array, t: number, x: number, z: number): number | undefined {
  const a = (I[t * 3] as number) * 3;
  const b = (I[t * 3 + 1] as number) * 3;
  const c = (I[t * 3 + 2] as number) * 3;
  const [ax, az, bx, bz, cx, cz] = [P[a], P[a + 2], P[b], P[b + 2], P[c], P[c + 2]] as number[] as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
  if (Math.abs(d) < 1e-12) return undefined;
  const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
  const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
  const w = 1 - u - v;
  const e = -1e-6;
  if (u < e || v < e || w < e) return undefined;
  return u * (P[a + 1] as number) + v * (P[b + 1] as number) + w * (P[c + 1] as number);
}

/** 가장자리 여유 표본: 반경 r/2·r 원 위 12방위. */
const RING_DIRS = 12;

/** (x, z)에서 반경 r 안이 모두 같은 높이(±0.15 m)의 윗면인가 → 그 높이, 아니면 undefined. */
export function clearTopAt(tops: PlatformTops, x: number, z: number, r: number): number | undefined {
  const y0 = tops.topAt(x, z);
  if (y0 === undefined) return undefined;
  for (const rr of [r / 2, r])
    for (let k = 0; k < RING_DIRS; k++) {
      const a = (k / RING_DIRS) * 2 * Math.PI;
      const y = tops.topAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      if (y === undefined || Math.abs(y - y0) > 0.15) return undefined;
    }
  return y0;
}

/** 도착 여유 반경(m) — 캐릭터 캡슐 Ø 0.5 + 한 걸음. */
export const ARRIVAL_CLEARANCE_M = 1.2;

/**
 * 힌트 xz 주변(≤ searchM) 0.5 m 나선에서 여유 반경 r을 만족하는 가장 가까운 점 → WF(윗면 + 0.05 m). 없으면 undefined.
 * 힌트 자체가 만족하면 그대로(내용 파일 위치 존중).
 */
export function safeArrival(
  tops: PlatformTops,
  hint: { x: number; z: number },
  r = ARRIVAL_CLEARANCE_M,
  searchM = 8,
): Vec3d | undefined {
  for (const [dx, dz] of spiral(searchM)) {
    const y = clearTopAt(tops, hint.x + dx, hint.z + dz, r);
    if (y !== undefined) return { x: hint.x + dx, y: y + 0.05, z: hint.z + dz };
  }
  return undefined;
}

const SPIRAL_STEP_M = 0.5;
const spirals = new Map<number, (readonly [number, number])[]>();
/** 0.5 m 격자 오프셋, 가까운 순(반경별 1회 계산). */
function spiral(searchM: number): readonly (readonly [number, number])[] {
  const hit = spirals.get(searchM);
  if (hit) return hit;
  const n = Math.ceil(searchM / SPIRAL_STEP_M);
  const out: [number, number][] = [];
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      if (Math.hypot(i, j) * SPIRAL_STEP_M <= searchM) out.push([i * SPIRAL_STEP_M, j * SPIRAL_STEP_M]);
  out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  spirals.set(searchM, out);
  return out;
}

/** 선로 표본(레일 윗면 중심선) 격자 — 승강장 근처 구덩이 판정·선로 위 판정. */
export interface TrackPits {
  /** 발이 승강장 근처(≤ nearM) 선로 회랑(중심 ±lateralM) 안 레일 높이 아래(구덩이)이거나 승강장 윗면 아래(밑)인가. */
  inPit(feet: Vec3d): boolean;
  /** 점이 어느 선로든 회랑(중심 ±ON_TRACK_LATERAL_M) 안이고 레일 높이 ±ON_TRACK_DY_M인가(카메라 아래 내리기 — 승강장 윗면 제외는 호출 측). */
  onTrack(p: Vec3d): boolean;
}
const ON_TRACK_LATERAL_M = 2.2;
const ON_TRACK_DY_M = 1.6;

/** 승강장 옆(이 거리 m 안) 선로 표본만 — 그 밖 선로(고가 아래 길·평면 건널목)에선 구조하지 않는다. */
const PIT_NEAR_M = 8;
const PIT_LATERAL_M = 2.6;
/** 레일 윗면 아래 이 범위(m)면 구덩이(하라주쿠 1.5 m — 고가 아래 거리는 4 m+ 아래라 제외). */
const PIT_DEPTH_M: readonly [number, number] = [0.25, 2.8];
/** 승강장 윗면 아래 이 범위(m)면 승강장 밑. */
const UNDER_DEPTH_M: readonly [number, number] = [0.6, 4];

/** 구덩이 격자 점진 생성(메인 스레드 4 ms — 프레임마다 표본 일부). step(n) = 표본 n개 더 넣고 다 넣었으면 결과. */
export function trackPitsBuilder(tops: PlatformTops, points: Float32Array): { step(n: number): TrackPits | undefined } {
  // 윗면 칸을 PIT_NEAR_M만큼 넓힌 칸 집합(구덩이는 이 칸에서만). 표본은 모두 칸별로(선로 위 판정).
  const reach = Math.ceil(PIT_NEAR_M / CELL);
  const near = new Set<number>();
  for (const [ci, cj] of tops.cells())
    for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) near.add(key(i, j));
  const buckets = new Map<number, number[]>();
  const total = Math.floor(points.length / 3);
  let k = 0;
  return {
    step(n) {
      for (const end = Math.min(total, k + n); k < end; k++) {
        const kk = key(Math.floor((points[k * 3] as number) / CELL), Math.floor((points[k * 3 + 2] as number) / CELL));
        const list = buckets.get(kk) ?? [];
        list.push(k);
        buckets.set(kk, list);
      }
      return k < total ? undefined : pitsOf(tops, points, buckets, near);
    },
  };
}

/** 한 번에(테스트·작은 데이터). */
export function trackPits(tops: PlatformTops, points: Float32Array): TrackPits {
  return trackPitsBuilder(tops, points).step(Number.POSITIVE_INFINITY) as TrackPits;
}

function pitsOf(
  tops: PlatformTops,
  points: Float32Array,
  buckets: Map<number, number[]>,
  near: Set<number>,
): TrackPits {
  const around = function* (x: number, z: number): Iterable<number> {
    const i0 = Math.floor(x / CELL);
    const j0 = Math.floor(z / CELL);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) yield* buckets.get(key(i, j)) ?? [];
  };
  return {
    inPit(f) {
      const top = tops.topAt(f.x, f.z);
      if (top !== undefined && f.y < top - UNDER_DEPTH_M[0] && f.y > top - UNDER_DEPTH_M[1]) return true;
      if (!near.has(key(Math.floor(f.x / CELL), Math.floor(f.z / CELL)))) return false;
      for (const k of around(f.x, f.z)) {
        const dx = (points[k * 3] as number) - f.x;
        const dz = (points[k * 3 + 2] as number) - f.z;
        if (dx * dx + dz * dz > PIT_LATERAL_M ** 2) continue;
        const below = (points[k * 3 + 1] as number) - f.y;
        if (below > PIT_DEPTH_M[0] && below < PIT_DEPTH_M[1] && besideTop(tops, points, k)) return true;
      }
      return false;
    },
    onTrack(p) {
      for (const k of around(p.x, p.z)) {
        const dx = (points[k * 3] as number) - p.x;
        const dz = (points[k * 3 + 2] as number) - p.z;
        if (
          dx * dx + dz * dz <= ON_TRACK_LATERAL_M ** 2 &&
          Math.abs((points[k * 3 + 1] as number) - p.y) <= ON_TRACK_DY_M
        )
          return true;
      }
      return false;
    },
  };
}

/** 표본 k 둘레 PIT_NEAR_M 안에 윗면이 있는가(8방위 × 3 반경 — 걸렸을 때만 정밀 확인). */
function besideTop(tops: PlatformTops, points: Float32Array, k: number): boolean {
  const x = points[k * 3] as number;
  const z = points[k * 3 + 2] as number;
  for (const r of [PIT_NEAR_M / 4, PIT_NEAR_M / 2, PIT_NEAR_M])
    for (let d = 0; d < 8; d++) {
      const a = (d / 8) * 2 * Math.PI;
      if (tops.topAt(x + Math.cos(a) * r, z + Math.sin(a) * r) !== undefined) return true;
    }
  return false;
}
