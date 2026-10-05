// 차선 그래프(10 §5.1, M06-T05 — ADR-0065): 셀 lanes.bin 청크 → 전역 차선(WF 점·누적 길이) + 노드(키로 셀 간 병합 — 교차로 안·셀 경계 포털).
// 다음 차선 = 끝 노드에서 나가는 차선. 교차로 = 연결로로 이어진 노드 묶음(우회전 대향 직진 판정용). 셀을 빼면 그 셀 차선을 지우고 지운 번호를 돌려준다.
import { LANE_KIND, LANE_NO_SIGNAL, type LaneGraphChunk } from '@sanpo/tile-format';

export interface Lane {
  idx: number;
  cell: number;
  from: number;
  to: number;
  kind: number;
  turn: number;
  /** m/s. */
  speed: number;
  laneIdx: number;
  signal: number;
  /** WF xyz 점·누적 길이(m). */
  pts: Float32Array;
  cum: Float32Array;
  length: number;
}

interface Node {
  key: number;
  x: number;
  y: number;
  z: number;
  outs: Set<number>;
  ins: Set<number>;
  refs: number;
}

export interface LanePoint {
  x: number;
  y: number;
  z: number;
  /** 진행 방향(xz 단위). */
  dx: number;
  dz: number;
}

export interface LaneGraph {
  readonly lanes: readonly (Lane | undefined)[];
  addCell(cell: number, g: LaneGraphChunk, originWF: { x: number; y: number; z: number }): number;
  /** 셀 차선 제거 → 지운 차선 번호. */
  removeCell(cell: number): number[];
  successors(lane: Lane): Lane[];
  predecessors(lane: Lane): Lane[];
  pointAt(lane: Lane, s: number, out?: LanePoint): LanePoint;
  /** 노드 위치. */
  node(i: number): { x: number; y: number; z: number } | undefined;
  stats(): { lanes: number; nodes: number; cells: number };
}

interface Store {
  lanes: (Lane | undefined)[];
  free: number[];
  nodes: (Node | undefined)[];
  nodeByKey: Map<number, number>;
}

function nodeOf(st: Store, key: number, x: number, y: number, z: number): number {
  let i = st.nodeByKey.get(key);
  if (i === undefined) {
    i = st.nodes.length;
    st.nodes.push({ key, x, y, z, outs: new Set(), ins: new Set(), refs: 0 });
    st.nodeByKey.set(key, i);
  }
  return i;
}

/** 청크 k번 차선 → WF 점·누적 길이. */
function lanePoints(
  g: LaneGraphChunk,
  k: number,
  o: { x: number; y: number; z: number },
): { pts: Float32Array; cum: Float32Array } {
  const off = g.lanes.ptOffset[k] as number;
  const n = g.lanes.ptCount[k] as number;
  const pts = new Float32Array(n * 3);
  const cum = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    pts[p * 3] = (g.pointsLocal[(off + p) * 3] as number) + o.x;
    pts[p * 3 + 1] = (g.pointsLocal[(off + p) * 3 + 1] as number) + o.y;
    pts[p * 3 + 2] = (g.pointsLocal[(off + p) * 3 + 2] as number) + o.z;
    if (p > 0)
      cum[p] =
        (cum[p - 1] as number) +
        Math.hypot(
          (pts[p * 3] as number) - (pts[p * 3 - 3] as number),
          (pts[p * 3 + 2] as number) - (pts[p * 3 - 1] as number),
        );
  }
  return { pts, cum };
}

function addLane(
  st: Store,
  cell: number,
  g: LaneGraphChunk,
  k: number,
  o: { x: number; y: number; z: number },
): number {
  const L = g.lanes;
  const { pts, cum } = lanePoints(g, k, o);
  const nodeAt = (ni: number) =>
    nodeOf(
      st,
      g.nodes.key[ni] as number,
      (g.nodes.posLocal[ni * 3] as number) + o.x,
      (g.nodes.posLocal[ni * 3 + 1] as number) + o.y,
      (g.nodes.posLocal[ni * 3 + 2] as number) + o.z,
    );
  const idx = st.free.pop() ?? st.lanes.length;
  const lane: Lane = {
    idx,
    cell,
    from: nodeAt(L.fromNode[k] as number),
    to: nodeAt(L.toNode[k] as number),
    kind: L.kind[k] as number,
    turn: L.turn[k] as number,
    speed: (L.speedKmh[k] as number) / 3.6,
    laneIdx: L.laneIdx[k] as number,
    signal: L.signal[k] ?? LANE_NO_SIGNAL,
    pts,
    cum,
    length: Math.max(0.01, cum[cum.length - 1] ?? 0),
  };
  st.lanes[idx] = lane;
  for (const ni of [lane.from, lane.to]) (st.nodes[ni] as Node).refs++;
  (st.nodes[lane.from] as Node).outs.add(idx);
  (st.nodes[lane.to] as Node).ins.add(idx);
  return idx;
}

export function createLaneGraph(): LaneGraph {
  const st: Store = { lanes: [], free: [], nodes: [], nodeByKey: new Map() };
  const { lanes, free, nodes, nodeByKey } = st;
  const cells = new Map<number, number[]>();
  return {
    lanes,
    addCell(cell, g, o) {
      if (cells.has(cell)) return 0;
      const ids: number[] = [];
      for (let k = 0; k < g.lanes.id.length; k++) ids.push(addLane(st, cell, g, k, o));
      cells.set(cell, ids);
      return ids.length;
    },
    removeCell(cell) {
      const ids = cells.get(cell) ?? [];
      for (const i of ids) {
        const l = lanes[i];
        if (!l) continue;
        for (const ni of [l.from, l.to]) {
          const nd = nodes[ni] as Node;
          nd.outs.delete(i);
          nd.ins.delete(i);
          if (--nd.refs <= 0) {
            nodeByKey.delete(nd.key);
            nodes[ni] = undefined;
          }
        }
        lanes[i] = undefined;
        free.push(i);
      }
      cells.delete(cell);
      return ids;
    },
    successors: (l) => [...((nodes[l.to] as Node | undefined)?.outs ?? [])].map((i) => lanes[i] as Lane),
    predecessors: (l) => [...((nodes[l.from] as Node | undefined)?.ins ?? [])].map((i) => lanes[i] as Lane),
    pointAt(l, s, out = { x: 0, y: 0, z: 0, dx: 1, dz: 0 }) {
      const n = l.cum.length;
      let k = 1;
      while (k < n - 1 && (l.cum[k] as number) < s) k++;
      const s0 = l.cum[k - 1] as number;
      const seg = Math.max(1e-6, (l.cum[k] as number) - s0);
      const t = Math.min(Math.max((s - s0) / seg, 0), 1);
      const a = (k - 1) * 3;
      const b = k * 3;
      const P = l.pts;
      out.x = (P[a] as number) + ((P[b] as number) - (P[a] as number)) * t;
      out.y = (P[a + 1] as number) + ((P[b + 1] as number) - (P[a + 1] as number)) * t;
      out.z = (P[a + 2] as number) + ((P[b + 2] as number) - (P[a + 2] as number)) * t;
      out.dx = ((P[b] as number) - (P[a] as number)) / seg;
      out.dz = ((P[b + 2] as number) - (P[a + 2] as number)) / seg;
      return out;
    },
    node: (i) => nodes[i],
    stats: () => ({ lanes: lanes.filter(Boolean).length, nodes: nodeByKey.size, cells: cells.size }),
  };
}

export const isConnector = (l: Lane): boolean => l.kind === LANE_KIND.connector;
