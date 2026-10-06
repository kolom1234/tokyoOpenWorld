// 승강장·홈도어(M07-T04, ADR-0073): rail.bin 승강장 고리(OSM) → 윗면 삼각형(귀 자르기) + 옆면(레일 높이까지) — render 메시·physics 바닥 공용.
// 홈도어 = 탑승 가능 노선(rideable)의 정차마다 승강장 쪽 선로 중심에서 PSD_OFFSET_M, 편성 길이 + 2 m: 문 자리(차형 문 위치) = 열리는 문(gate),
// 그 사이 = 고정 판(≤ 2 m 조각 — 곡선을 따른다). 문 열림 = 그 정차에 선 열차의 문(sim이 프레임마다).
import { TRAIN_CAR_TYPES } from '@sanpo/core';
import type { RailNetwork, RailTrackMeta } from '@sanpo/tile-format';
import { pointAt, type RailRt } from './network.ts';

/** 홈도어 선(선로 중심에서, m) — 승강장 가장자리(≈ 1.6 m) 안쪽 0.45 m. */
export const PSD_OFFSET_M = 2.05;
/** 홈도어 높이·문 열림 폭(m). */
export const PSD_HEIGHT_M = 1.3;
export const PSD_GATE_M = 2.0;
const PIECE_M = 2;

/** 단순 다각형 귀 자르기(반시계·시계 모두) — 꼭짓점 ≤ 수십 개. 반환 = 꼭짓점 번호 3개씩. */
export function triangulate(xz: readonly number[]): number[] {
  const n = xz.length / 2;
  const X = (i: number) => xz[i * 2] as number;
  const Z = (i: number) => xz[i * 2 + 1] as number;
  let area = 0;
  for (let i = 0; i < n; i++) area += X(i) * Z((i + 1) % n) - X((i + 1) % n) * Z(i);
  const sgn = Math.sign(area) || 1;
  const cross = (a: number, b: number, c: number) =>
    ((X(b) - X(a)) * (Z(c) - Z(a)) - (Z(b) - Z(a)) * (X(c) - X(a))) * sgn;
  const inside = (p: number, a: number, b: number, c: number) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const [a, b, c] = [idx[(k + idx.length - 1) % idx.length], idx[k], idx[(k + 1) % idx.length]] as [
        number,
        number,
        number,
      ];
      if (cross(a, b, c) <= 1e-9) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      out.push(a, b, c);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(idx[0] as number, idx[1] as number, idx[2] as number);
  return out;
}

const shoelace = (r: readonly number[]): number => {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += (r[i * 2] as number) * (r[j * 2 + 1] as number) - (r[j * 2] as number) * (r[i * 2 + 1] as number);
  }
  return a;
};
const reverseRing = (r: readonly number[]): number[] => {
  const out: number[] = [];
  for (let i = r.length / 2 - 1; i >= 0; i--) out.push(r[i * 2] as number, r[i * 2 + 1] as number);
  return out;
};

export interface PlatformGeometry {
  /** WF xyz. 윗면 = 0 … top−1, 옆면 뒤. */
  positions: Float64Array;
  indices: Uint32Array;
  /** 윗면 삼각형 인덱스 수(physics 바닥 = 앞 topIndexCount개). */
  topIndexCount: number;
}

/** 모든 승강장: 윗면(고리 닫힘 점 제외) + 옆면(윗면 − 1.1 m까지, 바깥에서 보이게 고리 방향 그대로 쿼드). */
export function platformGeometry(net: RailNetwork): PlatformGeometry {
  const pos: number[] = [];
  const top: number[] = [];
  const side: number[] = [];
  for (const p of net.platforms) {
    let ring = p.ringXZ;
    if (ring.length >= 4 && ring[0] === ring.at(-2) && ring[1] === ring.at(-1)) ring = ring.slice(0, -2);
    // 윗면 법선 +Y·옆면 바깥 = xz 신발끈 면적 < 0 방향(+X 동·+Z 남에서 위에서 보아 시계).
    if (shoelace(ring) > 0) ring = reverseRing(ring);
    const base = pos.length / 3;
    const n = ring.length / 2;
    for (let i = 0; i < n; i++) pos.push(ring[i * 2] as number, p.topY, ring[i * 2 + 1] as number);
    for (const t of triangulate(ring)) top.push(base + t);
    const low = pos.length / 3;
    for (let i = 0; i < n; i++) pos.push(ring[i * 2] as number, p.topY - 1.1, ring[i * 2 + 1] as number);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      side.push(base + i, low + i, low + j, base + i, low + j, base + j);
    }
  }
  edgeStrips(net, pos, top, side);
  return { positions: Float64Array.from(pos), indices: Uint32Array.from([...top, ...side]), topIndexCount: top.length };
}

/** 승강장 가장자리 띠(선로 중심에서, m): OSM 윤곽은 실제보다 1 m 남짓 멀리 그려지기도 해 차체(1.475 m)와 틈이 생긴다 → 선로 기준으로 메운다. */
export const EDGE_STRIP_M = [1.55, 3.2] as const;

function trackXZ(net: RailNetwork, t: RailTrackMeta, s: number): [number, number, number] {
  const x = Math.min(Math.max(s / t.stepM, 0), t.ptCount - 1);
  const k = Math.min(t.ptCount - 2, Math.floor(x));
  const f = x - k;
  const P = net.points;
  const a = (t.ptOffset + k) * 3;
  return [
    (P[a] as number) + ((P[a + 3] as number) - (P[a] as number)) * f,
    (P[a + 1] as number) + ((P[a + 4] as number) - (P[a + 1] as number)) * f,
    (P[a + 2] as number) + ((P[a + 5] as number) - (P[a + 2] as number)) * f,
  ];
}

/** 삼각형을 원하는 법선 쪽으로 감아 넣는다. */
function tri(
  out: number[],
  pos: readonly number[],
  a: number,
  b: number,
  c: number,
  want: readonly [number, number, number],
): void {
  const v = (i: number, k: number) => pos[i * 3 + k] as number;
  const u = [v(b, 0) - v(a, 0), v(b, 1) - v(a, 1), v(b, 2) - v(a, 2)] as const;
  const w = [v(c, 0) - v(a, 0), v(c, 1) - v(a, 1), v(c, 2) - v(a, 2)] as const;
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  if ((n[0] as number) * want[0] + (n[1] as number) * want[1] + (n[2] as number) * want[2] >= 0) out.push(a, b, c);
  else out.push(a, c, b);
}

/** 승강장이 있는 정차마다 승강장 길이만큼 가장자리 띠(윗면 5 mm 아래 — OSM 윗면과 겹치면 그쪽이 보인다) + 선로 쪽 옆면. */
function edgeStrips(net: RailNetwork, pos: number[], top: number[], side: number[]): void {
  for (const t of net.tracks)
    for (const st of t.stops) {
      const p = st.platform === undefined ? undefined : net.platforms[st.platform];
      if (!p) continue;
      const sgn = st.side === 'L' ? 1 : -1;
      const n = Math.max(2, Math.ceil(st.platformLengthM / 2) + 1);
      const base = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const s = st.s - st.platformLengthM / 2 + (i * st.platformLengthM) / (n - 1);
        const a = trackXZ(net, t, s - 0.5);
        const b = trackXZ(net, t, s + 0.5);
        const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        const [nx, nz] = [((b[2] - a[2]) / L) * sgn, (-(b[0] - a[0]) / L) * sgn];
        const c = trackXZ(net, t, s);
        const y = p.topY - 0.005;
        pos.push(c[0] + nx * EDGE_STRIP_M[0], y, c[2] + nz * EDGE_STRIP_M[0]);
        pos.push(c[0] + nx * EDGE_STRIP_M[1], y, c[2] + nz * EDGE_STRIP_M[1]);
        pos.push(c[0] + nx * EDGE_STRIP_M[0], p.topY - 1.1, c[2] + nz * EDGE_STRIP_M[0]);
        if (i === 0) continue;
        const [i0, o0, l0, i1, o1, l1] = [
          base + (i - 1) * 3,
          base + (i - 1) * 3 + 1,
          base + (i - 1) * 3 + 2,
          base + i * 3,
          base + i * 3 + 1,
          base + i * 3 + 2,
        ];
        tri(top, pos, i0, o0, o1, [0, 1, 0]);
        tri(top, pos, i0, o1, i1, [0, 1, 0]);
        tri(side, pos, i0, l0, l1, [-nx, 0, -nz]);
        tri(side, pos, i0, l1, i1, [-nx, 0, -nz]);
      }
    }
}

export interface PsdStop {
  track: string;
  station: string;
  /** 왼쪽(진행 방향) +1·오른쪽 −1 — 선로 왼쪽 법선 (dz, −dx) 쪽 부호. */
  side: number;
  topY: number;
  /** 문(gate) 범위 [s0, s1] — 열림은 이 정차 열차 문. */
  gates: [number, number][];
  /** 고정 판 조각 [s0, s1](≤ 2 m). */
  panels: [number, number][];
}

/** 정차 하나의 홈도어 구간: 편성(노선 편성·차형 문 위치)의 문마다 gate, 사이 = 판 조각. */
function psdStop(
  t: RailTrackMeta,
  stop: RailTrackMeta['stops'][number],
  cars: number,
  carL: number,
  topY: number,
): PsdStop {
  const type = TRAIN_CAR_TYPES[carL >= 18 ? 0 : 1] ?? (TRAIN_CAR_TYPES[0] as (typeof TRAIN_CAR_TYPES)[number]);
  const half = (cars * carL) / 2;
  const gates: [number, number][] = [];
  for (let k = 0; k < cars; k++) {
    const sk = stop.s + half - (k + 0.5) * carL;
    for (const z of type.doorsZ) gates.push([sk - z - PSD_GATE_M / 2, sk - z + PSD_GATE_M / 2]);
  }
  gates.sort((a, b) => a[0] - b[0]);
  const panels: [number, number][] = [];
  let s = stop.s - half - 1;
  for (const [a, b] of [...gates, [stop.s + half + 1, stop.s + half + 1] as [number, number]]) {
    for (let x = s; x < a - 0.05; x += PIECE_M) panels.push([x, Math.min(a, x + PIECE_M)]);
    s = Math.max(s, b);
  }
  return { track: t.id, station: stop.station, side: stop.side === 'L' ? 1 : -1, topY, gates, panels };
}

/** 탑승 가능 노선(rideable)의 승강장 있는 정차마다 홈도어. */
export function psdLayout(net: RailNetwork): PsdStop[] {
  const out: PsdStop[] = [];
  for (const t of net.tracks) {
    const line = net.lines.find((l) => l.id === t.line);
    if (!line?.rideable) continue;
    for (const st of t.stops) {
      const p = st.platform === undefined ? undefined : net.platforms[st.platform];
      if (p) out.push(psdStop(t, st, line.formation.cars, line.formation.carLengthM, p.topY));
    }
  }
  return out;
}

const pa = new Float64Array(3);
const pb = new Float64Array(3);

/** 선로 위 [s0, s1] 조각 → 홈도어 선 위 중심 WF·yaw(전방 = s 증가)·길이. */
export function psdPiece(
  rt: RailRt,
  ps: PsdStop,
  s0: number,
  s1: number,
): { x: number; y: number; z: number; yaw: number; len: number } {
  const t = rt.tracks.get(ps.track)?.meta as RailTrackMeta;
  pointAt(rt, t, s0, pa);
  pointAt(rt, t, s1, pb);
  const dx = (pb[0] as number) - (pa[0] as number);
  const dz = (pb[2] as number) - (pa[2] as number);
  const L = Math.hypot(dx, dz) || 1;
  // 왼쪽 법선 (dz, −dx) / L.
  const off = ps.side * PSD_OFFSET_M;
  return {
    x: ((pa[0] as number) + (pb[0] as number)) / 2 + (dz / L) * off,
    y: ps.topY,
    z: ((pa[2] as number) + (pb[2] as number)) / 2 - (dx / L) * off,
    yaw: Math.atan2(-dx, -dz),
    len: L,
  };
}
