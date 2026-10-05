// 차선 그래프 생성(M06-T05, 04 §4.3 "레인 그래프", ADR-0065): 영역(셀 + 8-이웃) OSM 간선 → 가장자리 방향별 차선 중심선(좌측통행 — 양방향 도로는 진행 방향 왼쪽 절반,
// 차로 0 = 연석 쪽) → 교차점(가지 ≥ 3)마다 뒤로 물린 정지선·회전 연결로(직진 차로 대응, 좌회전 = 연석 차로, 우회전 = 안쪽 차로, 유턴 없음) + 정지선 신호 코드 →
// 셀 사각형으로 잘라(경계 = 포털 노드) LaneGraphChunk. 노드 키 = 교차점·차선·방향 해시(셀이 달라도 같은 키 → 런타임 병합).
import { hash32 } from '@sanpo/core';
import { LANE_KIND, LANE_NO_SIGNAL, LANE_TURN, type LaneGraphChunk } from '@sanpo/tile-format';
import type { OsmRecord } from '../normalize-osm.ts';
import { clipRect, connector, densify, offsetLeft, type P2, polyLength, trim } from './lanes/geometry.ts';
import { buildGraph, type Edge, type Junction } from './lanes/graph.ts';

export const LANE_W = 3.0;
/** 차선 점 최대 간격(m) — 높이 = 점마다 지면 표본(M06-T06: 30 m 직선 구간에서 차가 ±0.4–0.7 m 뜨고 묻혔다). */
const HEIGHT_STEP_M = 4;
const STRAIGHT_RAD = (35 * Math.PI) / 180;
/** 이 길이보다 짧은 가장자리(분리 차로 사이 중앙 등)의 끝엔 신호를 두지 않는다 — 앞 교차점에서 이미 같은 신호를 지났다. */
const MEDIAN_M = 8;

export interface LaneDraft {
  id: number;
  fromKey: number;
  toKey: number;
  kind: number;
  turn: number;
  speedKmh: number;
  laneIdx: number;
  signal: number;
  pts: P2[];
}

interface DirLane {
  edge: Edge;
  dir: 1 | -1;
  k: number;
  n: number;
  pts: P2[];
  startKey: number;
  endKey: number;
}

export interface LaneSignals {
  /** 교차점에 신호가 있나(신호 점·신호 횡단 30 m 안). */
  signalized(x: number, z: number): boolean;
  /** 접근 방향(진행 방향 단위) → 차량 신호 코드. */
  code(x: number, z: number, dx: number, dz: number): number;
}

const halfWidth = (e: Edge): number => ((e.props.lanesF + e.props.lanesB) * LANE_W) / 2;

/** 교차점 뒤로 물리는 거리: 가장 넓은 도로 반폭 + (신호면 횡단보도 몫 6 m, 아니면 1.5 m). 가지 ≤ 2 = 0. */
function setbackOf(j: Junction, edges: readonly Edge[], sig: LaneSignals): number {
  if (j.ends.length < 3) return 0;
  const w = Math.max(...j.ends.map((e) => halfWidth(edges[e.edge] as Edge)));
  return Math.min(25, Math.max(4, w + (sig.signalized(j.x, j.z) ? 6 : 1.5)));
}

function dirLanes(e: Edge, dir: 1 | -1, sa: number, sb: number, jA: Junction, jB: Junction): DirLane[] {
  const n = dir === 1 ? e.props.lanesF : e.props.lanesB;
  if (n === 0) return [];
  const oneWay = e.props.oneway !== 0;
  const base = dir === 1 ? e.pts : [...e.pts].reverse();
  const [s0, s1] = dir === 1 ? [sa, sb] : [sb, sa];
  const [j0, j1] = dir === 1 ? [jA, jB] : [jB, jA];
  const L = polyLength(base);
  // 짧은 가장자리: 양 끝 자르기를 줄여 ≥ 1 m 남긴다.
  const k = s0 + s1 > L - 1 ? Math.max(0, (L - 1) / (s0 + s1 || 1)) : 1;
  const out: DirLane[] = [];
  for (let i = 0; i < n; i++) {
    const off = oneWay ? ((n - 1) / 2 - i) * LANE_W : (n - i - 0.5) * LANE_W;
    out.push({
      edge: e,
      dir,
      k: i,
      n,
      pts: trim(offsetLeft(base, off), s0 * k, s1 * k),
      startKey: hash32('out', j0.hash, e.id, dir, i),
      endKey: hash32('in', j1.hash, e.id, dir, i),
    });
  }
  return out;
}

const dirAt = (pts: readonly P2[], end: boolean): P2 => {
  const [a, b] = end ? [pts[pts.length - 2] as P2, pts[pts.length - 1] as P2] : [pts[0] as P2, pts[1] as P2];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
};

/** 들어오는 차선 묶음 → 나가는 묶음 연결로(회전 종류별 차로 대응). */
function connectorsAt(ins: DirLane[], outs: DirLane[], straightOnly: boolean): LaneDraft[] {
  const first = ins[0] as DirLane;
  const o0 = outs[0] as DirLane;
  const din = dirAt(first.pts, true);
  const dout = dirAt(o0.pts, false);
  const cross = din[0] * dout[1] - din[1] * dout[0];
  const ang = Math.atan2(cross, din[0] * dout[0] + din[1] * dout[1]);
  const turn =
    straightOnly || Math.abs(ang) < STRAIGHT_RAD ? LANE_TURN.straight : cross < 0 ? LANE_TURN.left : LANE_TURN.right;
  const pairs: [DirLane, DirLane][] =
    turn === LANE_TURN.straight
      ? ins.map((l) => [l, outs[Math.min(l.k, outs.length - 1)] as DirLane])
      : turn === LANE_TURN.left
        ? [[ins[0] as DirLane, o0]]
        : [[ins[ins.length - 1] as DirLane, outs[outs.length - 1] as DirLane]];
  const vIn = first.edge.props.speedKmh;
  const vOut = o0.edge.props.speedKmh;
  return pairs.map(([a, b]) => ({
    id: hash32('conn', a.endKey, b.startKey),
    fromKey: a.endKey,
    toKey: b.startKey,
    kind: LANE_KIND.connector,
    turn,
    speedKmh: turn === LANE_TURN.straight ? Math.min(vIn, vOut) : turn === LANE_TURN.left ? 20 : 25,
    laneIdx: b.k,
    signal: LANE_NO_SIGNAL,
    pts: connector(a.pts[a.pts.length - 1] as P2, dirAt(a.pts, true), b.pts[0] as P2, dirAt(b.pts, false)),
  }));
}

/** 영역 OSM → 차선·연결로 초안(WF). */
export function buildLaneDrafts(ways: readonly OsmRecord[], sig: LaneSignals): LaneDraft[] {
  const { edges, junctions } = buildGraph(ways);
  const setback = new Map<string, number>();
  for (const j of junctions.values()) setback.set(j.key, setbackOf(j, edges, sig));
  const byIn = new Map<string, DirLane[][]>();
  const byOut = new Map<string, DirLane[][]>();
  const push = (m: Map<string, DirLane[][]>, k: string, v: DirLane[]) => {
    if (v.length > 0) m.set(k, [...(m.get(k) ?? []), v]);
  };
  const drafts: LaneDraft[] = [];
  for (const e of edges) {
    const ja = junctions.get(e.a) as Junction;
    const jb = junctions.get(e.b) as Junction;
    for (const dir of [1, -1] as const) {
      const ls = dirLanes(e, dir, setback.get(e.a) ?? 0, setback.get(e.b) ?? 0, ja, jb);
      if (ls.length === 0) continue;
      const [j0, j1] = dir === 1 ? [ja, jb] : [jb, ja];
      push(byOut, j0.key, ls);
      push(byIn, j1.key, ls);
      for (const l of ls) drafts.push(roadDraft(l, j1, sig));
    }
  }
  for (const j of junctions.values())
    for (const ins of byIn.get(j.key) ?? [])
      for (const outs of byOut.get(j.key) ?? []) {
        const a = ins[0] as DirLane;
        const b = outs[0] as DirLane;
        if (a.edge.id === b.edge.id && a.dir !== b.dir) continue; // 유턴 없음
        drafts.push(...connectorsAt(ins, outs, j.ends.length <= 2));
      }
  return drafts;
}

function roadDraft(l: DirLane, end: Junction, sig: LaneSignals): LaneDraft {
  const d = dirAt(l.pts, true);
  const stop = end.ends.length >= 3 && polyLength(l.pts) >= MEDIAN_M && sig.signalized(end.x, end.z);
  return {
    id: hash32('lane', l.edge.id, l.dir, l.k),
    fromKey: l.startKey,
    toKey: l.endKey,
    kind: LANE_KIND.road,
    turn: LANE_TURN.straight,
    speedKmh: l.edge.props.speedKmh,
    laneIdx: l.k,
    signal: stop ? sig.code(end.x, end.z, d[0], d[1]) : LANE_NO_SIGNAL,
    pts: l.pts,
  };
}

const portalKey = (p: P2, laneId: number): number =>
  hash32('portal', laneId, Math.round(p[0] * 100), Math.round(p[1] * 100));

type LaneCols = Record<keyof LaneGraphChunk['lanes'], number[]>;

function toChunk(nodeKey: number[], nodePos: number[], L: LaneCols, points: number[]): LaneGraphChunk {
  return {
    nodes: { key: Uint32Array.from(nodeKey), posLocal: Float32Array.from(nodePos) },
    lanes: {
      id: Uint32Array.from(L.id),
      fromNode: Uint32Array.from(L.fromNode),
      toNode: Uint32Array.from(L.toNode),
      kind: Uint8Array.from(L.kind),
      turn: Uint8Array.from(L.turn),
      speedKmh: Uint8Array.from(L.speedKmh),
      laneIdx: Uint8Array.from(L.laneIdx),
      signal: Uint32Array.from(L.signal),
      ptOffset: Uint32Array.from(L.ptOffset),
      ptCount: Uint16Array.from(L.ptCount),
      widthCm: Uint16Array.from(L.widthCm),
    },
    pointsLocal: Float32Array.from(points),
  };
}

/** 셀(원점 ox·oz, 256 m)으로 자른 청크(셀 로컬). 높이 = heightAt(WF). 차선이 없으면 null. */
export function cellLanes(
  drafts: readonly LaneDraft[],
  ox: number,
  oz: number,
  heightAt: (x: number, z: number) => number,
): LaneGraphChunk | null {
  const nodeIdx = new Map<number, number>();
  const nodeKey: number[] = [];
  const nodePos: number[] = [];
  const node = (key: number, p: P2): number => {
    let i = nodeIdx.get(key);
    if (i === undefined) {
      i = nodeKey.length;
      nodeIdx.set(key, i);
      nodeKey.push(key);
      nodePos.push(p[0] - ox, heightAt(p[0], p[1]), p[1] - oz);
    }
    return i;
  };
  const L = {
    id: [],
    fromNode: [],
    toNode: [],
    kind: [],
    turn: [],
    speedKmh: [],
    laneIdx: [],
    signal: [],
    ptOffset: [],
    ptCount: [],
    widthCm: [],
  } as LaneCols;
  const points: number[] = [];
  for (const d of drafts)
    for (const piece of clipRect(densify(d.pts, HEIGHT_STEP_M), ox, oz, ox + 256, oz + 256)) {
      const a = piece.pts[0] as P2;
      const b = piece.pts[piece.pts.length - 1] as P2;
      L.id.push(hash32(d.id, Math.round(a[0] * 100), Math.round(a[1] * 100)));
      L.fromNode.push(node(piece.fromStart ? d.fromKey : portalKey(a, d.id), a));
      L.toNode.push(node(piece.toEnd ? d.toKey : portalKey(b, d.id), b));
      L.kind.push(d.kind);
      L.turn.push(d.turn);
      L.speedKmh.push(d.speedKmh);
      L.laneIdx.push(d.laneIdx);
      L.signal.push(piece.toEnd ? d.signal : LANE_NO_SIGNAL);
      L.ptOffset.push(points.length / 3);
      L.ptCount.push(piece.pts.length);
      L.widthCm.push(Math.round(LANE_W * 100));
      for (const p of piece.pts) points.push(p[0] - ox, heightAt(p[0], p[1]), p[1] - oz);
    }
  if (L.id.length === 0) return null;
  return toChunk(nodeKey, nodePos, L, points);
}
