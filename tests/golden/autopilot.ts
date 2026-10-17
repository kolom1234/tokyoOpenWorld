// 주행 봇 자동 운전(M08-T02 — tests/golden 전용): 셀 lanes.bin(AI 교통과 같은 데이터)으로 차선 그래프(노드 키로 셀 간 연결) → 무작위 경로(직진 선호,
// 중심 반경 안) → 순수 추종(앞 6 m) 조향 + 목표 속력 + 앞 정지선 적·황이면 정지. 출력 = 누를 키(W·S·A·D). 순수 함수 — Node(Playwright)에서 돈다.
import { packCellKey } from '../../packages/core/src/index.ts';
import { LANE_KIND, LANE_NO_SIGNAL, parseLanes } from '../../packages/tile-format/src/index.ts';

export interface RouteLane {
  id: string;
  kind: number;
  signal: number;
  from: number;
  to: number;
  /** WF xz 점. */
  pts: [number, number][];
  length: number;
}

export interface LaneGraph {
  lanes: RouteLane[];
  byFrom: Map<number, RouteLane[]>;
}

/** 셀(ix, iz) → lanes.bin 바이트 목록 → 그래프. */
export function buildGraph(cells: { ix: number; iz: number; bytes: Uint8Array }[]): LaneGraph {
  const lanes: RouteLane[] = [];
  for (const c of cells) {
    const r = parseLanes(c.bytes);
    if (!r.ok) continue;
    const g = r.value;
    const L = g.lanes;
    for (let i = 0; i < L.id.length; i++) {
      if (L.kind[i] === LANE_KIND.bus) continue;
      const o = L.ptOffset[i] as number;
      const n = L.ptCount[i] as number;
      const pts: [number, number][] = [];
      for (let k = 0; k < n; k++)
        pts.push([
          c.ix * 256 + (g.pointsLocal[(o + k) * 3] as number),
          c.iz * 256 + (g.pointsLocal[(o + k) * 3 + 2] as number),
        ]);
      let length = 0;
      for (let k = 1; k < n; k++)
        length += Math.hypot((pts[k]?.[0] ?? 0) - (pts[k - 1]?.[0] ?? 0), (pts[k]?.[1] ?? 0) - (pts[k - 1]?.[1] ?? 0));
      lanes.push({
        id: `${c.ix},${c.iz}:${L.id[i]}`,
        kind: L.kind[i] as number,
        signal: L.signal[i] as number,
        from: g.nodes.key[L.fromNode[i] as number] as number,
        to: g.nodes.key[L.toNode[i] as number] as number,
        pts,
        length,
      });
    }
  }
  const byFrom = new Map<number, RouteLane[]>();
  for (const l of lanes) byFrom.set(l.from, [...(byFrom.get(l.from) ?? []), l]);
  return { lanes, byFrom };
}

export const cellKey = (ix: number, iz: number): number => packCellKey(0, ix, iz);

const heading = (l: RouteLane, end: boolean): number => {
  const p = end ? l.pts.slice(-2) : l.pts.slice(0, 2);
  const [a, b] = [p[0] as [number, number], p[1] as [number, number]];
  return Math.atan2(b[0] - a[0], b[1] - a[1]);
};

/** 다음 차선: 중심 반경 안에서 직진에 가까운 것 우선(rng 0..1로 가끔 회전). */
export function nextLane(
  g: LaneGraph,
  l: RouteLane,
  center: [number, number],
  radius: number,
  rng: number,
): RouteLane | undefined {
  const cands = (g.byFrom.get(l.to) ?? []).filter((c) => {
    const e = c.pts[c.pts.length - 1] as [number, number];
    return Math.hypot(e[0] - center[0], e[1] - center[1]) < radius;
  });
  if (cands.length === 0) return (g.byFrom.get(l.to) ?? [])[0];
  const h = heading(l, true);
  const sorted = cands.sort(
    (a, b) => Math.abs(Math.sin((heading(a, false) - h) / 2)) - Math.abs(Math.sin((heading(b, false) - h) / 2)),
  );
  return rng < 0.6
    ? sorted[0]
    : sorted[Math.min(sorted.length - 1, 1 + (Math.floor(rng * 10) % (sorted.length - 1 || 1)))];
}

export interface CarNow {
  x: number;
  z: number;
  yaw: number;
  kmh: number;
}

/** 경로(차선 목록) 위 가장 가까운 점 → 앞 lookahead m 점. 반환 = 목표 점·지금 차선 남은 거리·지금 차선 순번. */
export function pursuit(
  route: RouteLane[],
  car: CarNow,
  lookahead: number,
): { target: [number, number]; lane: number; toEnd: number } {
  let best = { d: Number.POSITIVE_INFINITY, lane: 0, s: 0 };
  let base = 0;
  route.forEach((l, li) => {
    for (let k = 1; k < l.pts.length; k++) {
      const a = l.pts[k - 1] as [number, number];
      const b = l.pts[k] as [number, number];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((car.x - a[0]) * dx + (car.z - a[1]) * dz) / (len * len)));
      const d = Math.hypot(a[0] + dx * t - car.x, a[1] + dz * t - car.z);
      const segStart = base + segOffset(l, k);
      if (d < best.d) best = { d, lane: li, s: segStart + len * t };
    }
    base += l.length;
  });
  const startOf = route.slice(0, best.lane).reduce((s, l) => s + l.length, 0);
  const toEnd = startOf + (route[best.lane]?.length ?? 0) - best.s;
  return { target: pointAt(route, best.s + lookahead), lane: best.lane, toEnd };
}

function segOffset(l: RouteLane, k: number): number {
  let s = 0;
  for (let i = 1; i < k; i++)
    s += Math.hypot((l.pts[i]?.[0] ?? 0) - (l.pts[i - 1]?.[0] ?? 0), (l.pts[i]?.[1] ?? 0) - (l.pts[i - 1]?.[1] ?? 0));
  return s;
}

function pointAt(route: RouteLane[], s: number): [number, number] {
  let acc = 0;
  for (const l of route)
    for (let k = 1; k < l.pts.length; k++) {
      const a = l.pts[k - 1] as [number, number];
      const b = l.pts[k] as [number, number];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + len >= s) {
        const t = len > 0 ? (s - acc) / len : 0;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      acc += len;
    }
  const last = route[route.length - 1];
  return (last?.pts[last.pts.length - 1] ?? [0, 0]) as [number, number];
}

/** 키 결정: 조향(목표 방위 오차 ± 0.1 rad), 속력(목표 ±), 정지(stop = 정지선 앞에서 서야 함). */
export function keysFor(
  car: CarNow,
  target: [number, number],
  wantKmh: number,
  stopInM: number | undefined,
): Record<'KeyW' | 'KeyS' | 'KeyA' | 'KeyD', boolean> {
  const want = Math.atan2(-(target[0] - car.x), -(target[1] - car.z));
  const err = Math.atan2(Math.sin(want - car.yaw), Math.cos(want - car.yaw));
  const v = car.kmh / 3.6;
  const mustStop = stopInM !== undefined && stopInM < (v * v) / (2 * 2.5) + 4;
  return {
    KeyA: err > 0.1,
    KeyD: err < -0.1,
    KeyW: !mustStop && car.kmh < wantKmh - 2,
    // 3 km/h 아래에서 S를 누르면 후진이 된다 — 그 아래는 놓아 정지 유지 제동에 맡긴다.
    KeyS: mustStop ? car.kmh > 3 : car.kmh > wantKmh + 4,
  };
}

export { LANE_NO_SIGNAL };
