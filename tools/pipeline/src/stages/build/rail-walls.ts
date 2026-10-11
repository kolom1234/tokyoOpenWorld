// 역 건물 선로 구간 벽 잘라내기(⓪ M09 사전, ADR-0075): PLATEAU 역사·선로 위 빌딩의 벽 중 선로 회랑(중심선 ± CORRIDOR_HALF_M)·승강장과 겹치는
// 부분만 레일 높이 띠(레일 −BAND_BELOW_M ~ +BAND_ABOVE_M)에서 잘라 낸다(나머지 벽·지붕 유지 — 승강장 차양은 떠 있는 지붕이 된다).
// 선로 회랑에서 차량 외형(레일 + ENVELOPE_M 이하)에 걸린 지붕·비스듬한 부속물만 면째 뺀다.
// 터널 표본은 회랑에서 뺀다(지하 선로 위 건물 벽은 그대로). see docs/adr/0075-station-wall-cut.md, ADR-0073
import { RAIL_FLAG, type RailNetwork } from '@sanpo/tile-format';
import type { BuildingRecord, SurfaceRecord } from '../../readers/plateau/types.ts';

/** 회랑 반폭(m) = 차체 반폭 1.475(core TRAIN_CAR_TYPES commuter20) + 여유 0.7(OSM 선로 위치 오차 일부). */
export const CORRIDOR_HALF_M = 2.2;
/** 띠 = 레일 윗면 아래 1.5 m(대차·도상이 보이게) ~ 위 6.5 m(전차선 5.2 m + 조가선). */
export const BAND_BELOW_M = 1.5;
export const BAND_ABOVE_M = 6.5;
/** 차량 외형 높이(m) = 지붕 3.65(commuter20) + 내린 팬터그래프 ≈ 0.95 — 지붕 면을 뺄지 판정. */
export const ENVELOPE_M = 4.6;
/** 승강장 윗면 = 레일 윗면 + 1.1 m(ADR-0073). */
const PLATFORM_ABOVE_RAIL_M = 1.1;
const WALL_NY = 0.7;
/** 벽 따라 회랑 판정 간격(m)·잘라 낼 구간 양끝 여유(m). */
const STEP_M = 0.25;
const PAD_M = 0.25;
const GRID = 32;
const STRIDE = 2;

interface Seg {
  x0: number;
  z0: number;
  y0: number;
  x1: number;
  z1: number;
  y1: number;
}

export interface RailCorridor {
  /** (x, z)가 선로 회랑(platforms면 승강장 포함) 안이면 그곳 레일 윗면 y(WF), 밖이면 undefined. */
  railY(x: number, z: number, platforms?: boolean): number | undefined;
  /** xz 상자가 회랑 격자와 겹칠 수 있나(빠른 거르기). */
  near(x0: number, z0: number, x1: number, z1: number): boolean;
}

function inRingXZ(x: number, z: number, r: readonly number[]): boolean {
  let c = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, zi, xj, zj] = [r[i * 2] as number, r[i * 2 + 1] as number, r[j * 2] as number, r[j * 2 + 1] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function segRail(s: Seg, x: number, z: number): number | undefined {
  const dx = s.x1 - s.x0;
  const dz = s.z1 - s.z0;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(Math.max(((x - s.x0) * dx + (z - s.z0) * dz) / l2, 0), 1) : 0;
  const d = Math.hypot(s.x0 + dx * t - x, s.z0 + dz * t - z);
  return d <= CORRIDOR_HALF_M ? s.y0 + (s.y1 - s.y0) * t : undefined;
}

/** 선로 표본(터널 제외)·승강장 → 회랑 판정기. 격자 = 선분이 닿는 GRID m 칸(반폭 여유 포함). */
const cache = new WeakMap<RailNetwork, RailCorridor>();

/** 같은 망이면 판정기 재사용(셀마다 다시 만들지 않게). */
export function railCorridorOf(net: RailNetwork): RailCorridor {
  let c = cache.get(net);
  if (!c) {
    c = railCorridor(net);
    cache.set(net, c);
  }
  return c;
}

export function railCorridor(net: RailNetwork): RailCorridor {
  const grid = new Map<string, Seg[]>();
  const put = (s: Seg) => {
    const m = CORRIDOR_HALF_M;
    for (
      let gx = Math.floor((Math.min(s.x0, s.x1) - m) / GRID);
      gx <= Math.floor((Math.max(s.x0, s.x1) + m) / GRID);
      gx++
    )
      for (
        let gz = Math.floor((Math.min(s.z0, s.z1) - m) / GRID);
        gz <= Math.floor((Math.max(s.z0, s.z1) + m) / GRID);
        gz++
      ) {
        const k = `${gx},${gz}`;
        const a = grid.get(k);
        if (a) a.push(s);
        else grid.set(k, [s]);
      }
  };
  const p = net.points;
  for (const t of net.tracks)
    for (let k = t.ptOffset; k < t.ptOffset + t.ptCount - 1; k += STRIDE) {
      const k1 = Math.min(k + STRIDE, t.ptOffset + t.ptCount - 1);
      if (((net.flags[k] as number) | (net.flags[k1] as number)) & RAIL_FLAG.tunnel) continue;
      put({
        x0: p[k * 3] as number,
        y0: p[k * 3 + 1] as number,
        z0: p[k * 3 + 2] as number,
        x1: p[k1 * 3] as number,
        y1: p[k1 * 3 + 1] as number,
        z1: p[k1 * 3 + 2] as number,
      });
    }
  const plats = net.platforms.map((pl) => {
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pl.ringXZ.length; i += 2) {
      [x0, x1] = [Math.min(x0, pl.ringXZ[i] as number), Math.max(x1, pl.ringXZ[i] as number)];
      [z0, z1] = [Math.min(z0, pl.ringXZ[i + 1] as number), Math.max(z1, pl.ringXZ[i + 1] as number)];
    }
    return { ring: pl.ringXZ, y: pl.topY - PLATFORM_ABOVE_RAIL_M, x0, z0, x1, z1 };
  });
  return {
    railY(x, z, platforms = true) {
      for (const s of grid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`) ?? []) {
        const y = segRail(s, x, z);
        if (y !== undefined) return y;
      }
      if (!platforms) return undefined;
      for (const q of plats) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inRingXZ(x, z, q.ring)) return q.y;
      return undefined;
    },
    near(x0, z0, x1, z1) {
      for (const q of plats) if (x0 <= q.x1 && x1 >= q.x0 && z0 <= q.z1 && z1 >= q.z0) return true;
      for (let gx = Math.floor(x0 / GRID); gx <= Math.floor(x1 / GRID); gx++)
        for (let gz = Math.floor(z0 / GRID); gz <= Math.floor(z1 / GRID); gz++)
          if (grid.has(`${gx},${gz}`)) return true;
      return false;
    },
  };
}

/** 면 평면 기저: e1 = 수평 접선, e2 = n × e1(위쪽), c = 무게중심. */
interface Basis {
  c: [number, number, number];
  e1: [number, number, number];
  e2: [number, number, number];
}

function newell(r: readonly number[]): [number, number, number] {
  const n: [number, number, number] = [0, 0, 0];
  const m = r.length / 3;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const [xi, yi, zi, xj, yj, zj] = [
      r[i * 3],
      r[i * 3 + 1],
      r[i * 3 + 2],
      r[j * 3],
      r[j * 3 + 1],
      r[j * 3 + 2],
    ] as number[];
    n[0] += ((yi as number) - (yj as number)) * ((zi as number) + (zj as number));
    n[1] += ((zi as number) - (zj as number)) * ((xi as number) + (xj as number));
    n[2] += ((xi as number) - (xj as number)) * ((yi as number) + (yj as number));
  }
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

function basisOf(r: readonly number[], n: readonly [number, number, number]): Basis {
  const m = r.length / 3;
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < r.length; i += 3) {
    c[0] += (r[i] as number) / m;
    c[1] += (r[i + 1] as number) / m;
    c[2] += (r[i + 2] as number) / m;
  }
  const h = Math.hypot(n[0], n[2]) || 1;
  const e1: [number, number, number] = [n[2] / h, 0, -n[0] / h];
  let e2: [number, number, number] = [
    n[1] * e1[2] - n[2] * e1[1],
    n[2] * e1[0] - n[0] * e1[2],
    n[0] * e1[1] - n[1] * e1[0],
  ];
  if (e2[1] < 0) e2 = [-e2[0], -e2[1], -e2[2]];
  return { c, e1, e2 };
}

type P2 = [number, number];

/** Sutherland–Hodgman 반평면 a·p ≤ k(볼록 영역 — 오목 대상도 결과 면적은 맞다). */
function clipHalf(poly: readonly P2[], ax: number, ay: number, k: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i] as P2;
    const q = poly[(i + 1) % poly.length] as P2;
    const dp = ax * p[0] + ay * p[1] - k;
    const dq = ax * q[0] + ay * q[1] - k;
    if (dp <= 0) out.push(p);
    if (dp < 0 !== dq < 0 && dp !== 0 && dq !== 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function area2(p: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length] as P2;
    a += (p[i] as P2)[0] * q[1] - q[0] * (p[i] as P2)[1];
  }
  return Math.abs(a) / 2;
}

/** 다각형 − 사각형[ua,ub]×[vlo,vhi] = 왼쪽·오른쪽·위·아래 조각(겹침 없음). */
export function subtractRect(poly: readonly P2[], ua: number, ub: number, vlo: number, vhi: number): P2[][] {
  const mid = clipHalf(clipHalf(poly, -1, 0, -ua), 1, 0, ub);
  const parts = [
    clipHalf(poly, 1, 0, ua),
    clipHalf(poly, -1, 0, -ub),
    clipHalf(mid, 0, -1, -vhi),
    clipHalf(mid, 0, 1, vlo),
  ];
  return parts.filter((p) => p.length >= 3 && area2(p) > 1e-4);
}

interface Cut {
  ua: number;
  ub: number;
  vlo: number;
  vhi: number;
}

/** 벽 면(외곽 고리) 수평 u 구간별 회랑 판정 → 잘라 낼 사각형(u·v = 기저 좌표). */
function wallCuts(pts: readonly P2[], b: Basis, cor: RailCorridor): Cut[] {
  let [u0, u1] = [Infinity, -Infinity];
  for (const p of pts) [u0, u1] = [Math.min(u0, p[0]), Math.max(u1, p[0])];
  const cuts: Cut[] = [];
  let cur: { ua: number; ub: number; y0: number; y1: number } | undefined;
  const flush = () => {
    if (!cur) return;
    const k = b.e2[1] || 1;
    // 진짜 경계는 마지막 안쪽 표본과 다음 바깥 표본 사이 → 한 간격 + 여유만큼 넓힌다.
    cuts.push({
      ua: cur.ua - STEP_M - PAD_M,
      ub: cur.ub + STEP_M + PAD_M,
      vlo: (cur.y0 - BAND_BELOW_M - b.c[1]) / k,
      vhi: (cur.y1 + BAND_ABOVE_M - b.c[1]) / k,
    });
    cur = undefined;
  };
  for (let u = u0; u <= u1 + 1e-6; u += STEP_M) {
    const y = cor.railY(b.c[0] + b.e1[0] * u, b.c[2] + b.e1[2] * u);
    if (y === undefined) flush();
    else if (cur) [cur.ub, cur.y0, cur.y1] = [u, Math.min(cur.y0, y), Math.max(cur.y1, y)];
    else cur = { ua: u, ub: u, y0: y, y1: y };
  }
  flush();
  return cuts;
}

const to2 = (r: readonly number[], b: Basis): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < r.length; i += 3) {
    const d = [(r[i] as number) - b.c[0], (r[i + 1] as number) - b.c[1], (r[i + 2] as number) - b.c[2]] as const;
    out.push([d[0] * b.e1[0] + d[2] * b.e1[2], d[0] * b.e2[0] + d[1] * b.e2[1] + d[2] * b.e2[2]]);
  }
  return out;
};

const to3 = (p: readonly P2[], b: Basis): number[] =>
  p.flatMap(([u, v]) => [0, 1, 2].map((k) => (b.c[k] as number) + (b.e1[k] as number) * u + (b.e2[k] as number) * v));

/** 벽 면 1개 → 잘린 조각 면들(자를 것 없으면 null). 구멍은 자른 면에서 버린다(벽 구멍은 드물다). */
function cutWall(s: SurfaceRecord, cor: RailCorridor): SurfaceRecord[] | null {
  const ring = s.ringsWF[0];
  if (!ring || ring.length < 9) return null;
  const b = basisOf(ring, newell(ring));
  const pts = to2(ring, b);
  const cuts = wallCuts(pts, b, cor);
  if (cuts.length === 0) return null;
  let pieces: P2[][] = [pts];
  for (const c of cuts) pieces = pieces.flatMap((p) => subtractRect(p, c.ua, c.ub, c.vlo, c.vhi));
  return pieces.map((p) => ({ kind: s.kind, ...(s.gmlId ? { gmlId: s.gmlId } : {}), ringsWF: [to3(p, b)] }));
}

/** 지붕 표본 간격(m) — 회랑 폭(2 × 반폭)보다 충분히 작게. */
const ROOF_STEP_M = 1;

/**
 * 지붕·비스듬한 부속물: 면을 xz 격자(1 m)·꼭짓점으로 표본(높이 = 평면식)해 하나라도 선로 회랑의 차량 외형(레일 −1.5 ~ +ENVELOPE_M) 안이면
 * 면째 뺀다. 승강장만 덮는 차양은 유지(선로 회랑만 본다).
 */
function inEnvelope(s: SurfaceRecord, cor: RailCorridor): boolean {
  const r = s.ringsWF[0] ?? [];
  if (r.length < 9) return false;
  const n = newell(r);
  if (Math.abs(n[1]) < 1e-3) return false;
  const [cx, cy, cz] = [r[0] as number, r[1] as number, r[2] as number];
  const yAt = (x: number, z: number) => cy - (n[0] * (x - cx) + n[2] * (z - cz)) / n[1];
  const hit = (x: number, z: number) => {
    const ry = cor.railY(x, z, false);
    const y = yAt(x, z);
    return ry !== undefined && y >= ry - BAND_BELOW_M && y <= ry + ENVELOPE_M;
  };
  const xz: number[] = [];
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < r.length; i += 3) {
    xz.push(r[i] as number, r[i + 2] as number);
    [x0, x1] = [Math.min(x0, r[i] as number), Math.max(x1, r[i] as number)];
    [z0, z1] = [Math.min(z0, r[i + 2] as number), Math.max(z1, r[i + 2] as number)];
  }
  for (let i = 0; i < xz.length; i += 2) if (hit(xz[i] as number, xz[i + 1] as number)) return true;
  if (!cor.near(x0, z0, x1, z1)) return false;
  for (let x = x0 + ROOF_STEP_M / 2; x < x1; x += ROOF_STEP_M)
    for (let z = z0 + ROOF_STEP_M / 2; z < z1; z += ROOF_STEP_M) if (inRingXZ(x, z, xz) && hit(x, z)) return true;
  return false;
}

export interface WallCutStats {
  buildings: number;
  wallsCut: number;
  facesDropped: number;
}

/** 건물 1동 → 회랑 벽을 잘라 낸 레코드(바뀐 것 없으면 같은 객체). */
export function cutRailWalls(b: BuildingRecord, cor: RailCorridor, stats?: WallCutStats): BuildingRecord {
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const s of b.surfaces)
    for (const r of s.ringsWF)
      for (let i = 0; i < r.length; i += 3) {
        [x0, x1] = [Math.min(x0, r[i] as number), Math.max(x1, r[i] as number)];
        [z0, z1] = [Math.min(z0, r[i + 2] as number), Math.max(z1, r[i + 2] as number)];
      }
  const m = CORRIDOR_HALF_M;
  if (!Number.isFinite(x0) || !cor.near(x0 - m, z0 - m, x1 + m, z1 + m)) return b;
  let changed = false;
  const out: SurfaceRecord[] = [];
  for (const s of b.surfaces) {
    if (s.kind !== 'wall' && s.kind !== 'installation' && s.kind !== 'roof') {
      out.push(s);
      continue;
    }
    const n = newell(s.ringsWF[0] ?? []);
    const vertical = Math.abs(n[1]) < WALL_NY && s.kind !== 'roof';
    if (vertical) {
      const cut = cutWall(s, cor);
      if (cut) {
        changed = true;
        if (stats) stats.wallsCut++;
        out.push(...cut);
        continue;
      }
    } else if (inEnvelope(s, cor)) {
      changed = true;
      if (stats) stats.facesDropped++;
      continue;
    }
    out.push(s);
  }
  if (!changed) return b;
  if (stats) stats.buildings++;
  return { ...b, surfaces: out };
}
