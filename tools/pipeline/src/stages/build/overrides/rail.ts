// 선로 메시(M07-T01, ADR-0070): global/rail.bin 표본 중 이 셀 것(터널 제외) → overrides.mesh 랜드마크 스트림(`_LMAT`):
// 도상(자갈 사다리꼴, 지면 −0.05 → +0.25), 침목(콘크리트 0.6 m 간격), 레일 2줄(짙은 강판, 궤간 = 노선), 가선주(50 m — 진행 방향 왼쪽 = 좌측통행 바깥)·
// 가동 브래킷·전차선(레일 위 5.2 m), 교량 = 도상 밑 콘크리트 상판. 셀 소유 = 표본 xz가 셀 안. 충돌 없음(열차는 키네마틱, 도상은 낮다).
// see docs/04-data-pipeline.md §4.3(철도 — "선로·도상·가선주 메시는 셀에")
import { RAIL_FLAG, type RailNetwork } from '@sanpo/tile-format';
import type { Vec3 } from '../../../lib/triangulate.ts';
import { RAIL_TOP_M } from '../../derive/rail/splines.ts';
import { box, face, type LStream, norm, sweep } from './geom.ts';
import { LMAT } from './spec.ts';

const CELL = 256;
const SLEEPER_EVERY_M = 0.6;
const MAST_EVERY_M = 50;
const WIRE_H = 5.2;
/** 표본 간격 묶음(2 m — 도상·레일·전차선 꺾은선). */
const STRIDE = 4;

export interface RailMeshStats {
  tracks: number;
  meters: number;
  tris: number;
}

/** 셀 안(터널 아님) 표본 구간들: [시작, 끝] 전역 표본 번호. */
function runsInCell(net: RailNetwork, t: RailNetwork['tracks'][number], ox: number, oz: number): [number, number][] {
  const runs: [number, number][] = [];
  let a = -1;
  for (let k = t.ptOffset; k < t.ptOffset + t.ptCount; k++) {
    const x = net.points[k * 3] as number;
    const z = net.points[k * 3 + 2] as number;
    const ok =
      x >= ox && x < ox + CELL && z >= oz && z < oz + CELL && ((net.flags[k] as number) & RAIL_FLAG.tunnel) === 0;
    if (ok && a < 0) a = k;
    if (!ok && a >= 0) {
      if (k - 1 > a) runs.push([a, k - 1]);
      a = -1;
    }
  }
  if (a >= 0 && t.ptOffset + t.ptCount - 1 > a) runs.push([a, t.ptOffset + t.ptCount - 1]);
  return runs;
}

/** 표본 k의 셀 로컬 위치·진행 방향 단위·왼쪽 단위(수평). */
function frame(net: RailNetwork, k: number, lo: number, hi: number, ox: number, oz: number) {
  const P = (q: number): Vec3 => [
    (net.points[q * 3] as number) - ox,
    net.points[q * 3 + 1] as number,
    (net.points[q * 3 + 2] as number) - oz,
  ];
  const p = P(k);
  const a = P(Math.max(lo, k - 1));
  const b = P(Math.min(hi, k + 1));
  const t = norm([b[0] - a[0], 0, b[2] - a[2]]);
  // 진행 방향 왼쪽(WF +Z 남): (tz, 0, −tx).
  const left: Vec3 = [t[2], 0, -t[0]];
  return { p, t, left };
}

const off = (p: Vec3, d: Vec3, s: number, dy = 0): Vec3 => [p[0] + d[0] * s, p[1] + dy, p[2] + d[2] * s];

function ballastAndDeck(out: LStream, net: RailNetwork, lo: number, hi: number, ox: number, oz: number): void {
  const ks: number[] = [];
  for (let k = lo; k < hi; k += STRIDE) ks.push(k);
  ks.push(hi);
  for (let i = 0; i + 1 < ks.length; i++) {
    const A = frame(net, ks[i] as number, lo, hi, ox, oz);
    const B = frame(net, ks[i + 1] as number, lo, hi, ox, oz);
    const g = -RAIL_TOP_M;
    // 도상: 윗면(반폭 1.25, 지면 +0.25) + 비탈(반폭 1.6, 지면 −0.05).
    const top = (F: typeof A, sd: number): Vec3 => off(F.p, F.left, sd * 1.25, g + 0.25);
    const foot = (F: typeof A, sd: number): Vec3 => off(F.p, F.left, sd * 1.6, g - 0.05);
    face(out, [top(A, -1), top(B, -1), top(B, 1), top(A, 1)], LMAT.gravel);
    face(out, [foot(A, 1), top(A, 1), top(B, 1), foot(B, 1)], LMAT.gravel);
    face(out, [foot(B, -1), top(B, -1), top(A, -1), foot(A, -1)], LMAT.gravel);
    const bridge = ((net.flags[ks[i] as number] as number) & RAIL_FLAG.bridge) !== 0;
    if (!bridge) continue;
    // 교량 상판(폭 4.4, 두께 1.0) 옆·밑면.
    const deck = (F: typeof A, sd: number, dy: number): Vec3 => off(F.p, F.left, sd * 2.2, g - 0.05 + dy);
    face(out, [deck(A, 1, -1), deck(A, 1, 0), deck(B, 1, 0), deck(B, 1, -1)], LMAT.concrete);
    face(out, [deck(B, -1, -1), deck(B, -1, 0), deck(A, -1, 0), deck(A, -1, -1)], LMAT.concrete);
    face(out, [deck(A, -1, -1), deck(A, 1, -1), deck(B, 1, -1), deck(B, -1, -1)], LMAT.concrete);
  }
}

function sleepersRailsWire(
  out: LStream,
  net: RailNetwork,
  lo: number,
  hi: number,
  ox: number,
  oz: number,
  gauge: number,
) {
  const every = Math.max(1, Math.round(SLEEPER_EVERY_M / 0.5));
  for (let k = lo; k <= hi; k += every) {
    const F = frame(net, k, lo, hi, ox, oz);
    box(out, off(F.p, F.left, 0, -0.29), [2.0, 0.14, 0.2], Math.atan2(F.t[0], F.t[2]), LMAT.concrete);
  }
  for (const sd of [-1, 1]) {
    const path: Vec3[] = [];
    for (let k = lo; k <= hi; k += STRIDE) {
      const F = frame(net, k, lo, hi, ox, oz);
      path.push(off(F.p, F.left, sd * (gauge / 2 + 0.035), -0.075));
    }
    if (path.length >= 2) sweep(out, path, 0.07, 0.15, LMAT.steel_dark);
  }
  const wire: Vec3[] = [];
  for (let k = lo; k <= hi; k += STRIDE * 2)
    wire.push(frame(net, k, lo, hi, ox, oz).p.map((v, i) => (i === 1 ? v + WIRE_H : v)) as Vec3);
  if (wire.length >= 2) sweep(out, wire, 0.04, 0.04, LMAT.steel_dark);
}

function masts(
  out: LStream,
  net: RailNetwork,
  t: RailNetwork['tracks'][number],
  lo: number,
  hi: number,
  ox: number,
  oz: number,
) {
  const step = Math.round(MAST_EVERY_M / t.stepM);
  for (let k = lo; k <= hi; k++) {
    if ((k - t.ptOffset) % step !== 0) continue;
    if (((net.flags[k] as number) & RAIL_FLAG.bridge) !== 0) continue;
    const F = frame(net, k, lo, hi, ox, oz);
    const base = off(F.p, F.left, 2.7, -RAIL_TOP_M);
    box(out, base, [0.3, RAIL_TOP_M + WIRE_H + 1.4, 0.3], 0, LMAT.steel_dark);
    // 가동 브래킷: 기둥 위쪽에서 선로 중심까지.
    sweep(out, [off(F.p, F.left, 2.6, WIRE_H + 0.9), off(F.p, F.left, 0, WIRE_H + 0.3)], 0.08, 0.08, LMAT.steel_dark);
  }
}

/** 셀 하나(원점 WF ox, oz)의 선로 메시를 out에. gauge = 노선별(m). */
export function emitRail(out: LStream, net: RailNetwork | undefined, ox: number, oz: number): RailMeshStats {
  const st: RailMeshStats = { tracks: 0, meters: 0, tris: 0 };
  if (!net) return st;
  const before = out.tris;
  const plain = out.plainUv;
  out.plainUv = true;
  const gauge = new Map(net.lines.map((l) => [l.id, l.gaugeM]));
  for (const t of net.tracks) {
    const runs = runsInCell(net, t, ox, oz);
    if (runs.length > 0) st.tracks++;
    for (const [lo, hi] of runs) {
      st.meters += (hi - lo) * t.stepM;
      ballastAndDeck(out, net, lo, hi, ox, oz);
      sleepersRailsWire(out, net, lo, hi, ox, oz, gauge.get(t.line) ?? 1.067);
      masts(out, net, t, lo, hi, ox, oz);
    }
  }
  out.plainUv = plain;
  st.tris = out.tris - before;
  return st;
}
