// 승강장·정차 위치(M07-T01): OSM 승강장(railway=platform·public_transport=platform 선·면) → 선로 표본에 투영 → 선로 옆(가까운 변 ≤ EDGE_MAX_M)·
// 겹침 ≥ MIN_OVERLAP_M인 승강장 = 정차 후보. 정차 위치 s = 겹침 구간 가운데(편성 중심이 승강장 중심), 문 쪽 = 승강장이 진행 방향 왼쪽(+)/오른쪽(−).
// 역 = 이름이 목록(content/sim/rail-lines.json stations osmNames)과 맞는 OSM 역 점 중 가장 가까운 것(≤ STATION_REACH_M). see docs/10-simulation.md §6.1
import { convexHull, minAreaRect } from '../../../lib/geom2d.ts';
import type { OsmRecord } from '../../normalize-osm.ts';
import type { V2 } from './tracks.ts';

const EDGE_MAX_M = 4.5;
const WIDTH_MAX_M = 15;
const MIN_OVERLAP_M = 60;
const STATION_REACH_M = 450;

export interface StationDef {
  id: string;
  osmNames: string[];
}

export interface TrackStop {
  station: string;
  /** 승강장 겹침 가운데(m, 선로 s). */
  s: number;
  /** 'L' = 진행 방향 왼쪽 문, 'R' = 오른쪽. */
  side: 'L' | 'R';
  platformLengthM: number;
  /** 승강장 최소 면적 사각형 중심을 선로에 투영한 s(정차 위치 독립 검증 — ±2 m). */
  centroidS: number;
}

/** 표본 xyz(등간격) 위 점 투영: s·횡거리(+ 왼쪽, WF −Z = 북 기준 진행 방향). 표본 탐색은 거친 → 세밀 2단. */
export function projector(xyz: Float32Array, step: number) {
  const n = xyz.length / 3;
  const X = (i: number) => xyz[i * 3] as number;
  const Z = (i: number) => xyz[i * 3 + 2] as number;
  return (p: V2): { s: number; lateral: number; dist: number } => {
    let best = 0;
    let bd = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i += 20) {
      const d = (X(i) - p[0]) ** 2 + (Z(i) - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    for (let i = Math.max(0, best - 40); i <= Math.min(n - 1, best + 40); i++) {
      const d = (X(i) - p[0]) ** 2 + (Z(i) - p[1]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const a = Math.max(0, best - 1);
    const b = Math.min(n - 1, best + 1);
    const tx = X(b) - X(a);
    const tz = Z(b) - Z(a);
    const L = Math.hypot(tx, tz) || 1;
    const dx = p[0] - X(best);
    const dz = p[1] - Z(best);
    const along = (dx * tx + dz * tz) / L;
    // 진행 방향 (tx, tz)의 왼쪽 = (tz, −tx)(WF: +X 동, +Z 남 — 북행이면 왼쪽 = 서).
    const lateral = (dx * tz - dz * tx) / L;
    return { s: best * step + along, lateral, dist: Math.sqrt(bd) };
  };
}

function platformRings(recs: readonly OsmRecord[]): { id: string; pts: V2[] }[] {
  const out: { id: string; pts: V2[] }[] = [];
  for (const r of recs) {
    if (r.geom === 'point') continue;
    if (r.tags.railway !== 'platform' && r.tags.public_transport !== 'platform') continue;
    const xz = r.rings[0] ?? [];
    const pts: V2[] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) pts.push([xz[i] as number, xz[i + 1] as number]);
    if (pts.length >= 2) out.push({ id: r.id, pts });
  }
  return out;
}

/** 이름 맞는 OSM 역 점(railway=station·public_transport=station) — 역 id별 위치들. */
export function stationPoints(recs: readonly OsmRecord[], defs: readonly StationDef[]): Map<string, V2[]> {
  const out = new Map<string, V2[]>();
  for (const r of recs) {
    if (r.tags.railway !== 'station' && r.tags.public_transport !== 'station') continue;
    const def = defs.find((d) => d.osmNames.includes((r.tags.name ?? '').replace(/駅$/, '')));
    if (!def) continue;
    const xz = r.rings[0] ?? [];
    let [x, z, n] = [0, 0, 0];
    for (let i = 0; i + 1 < xz.length; i += 2) [x, z, n] = [x + (xz[i] as number), z + (xz[i + 1] as number), n + 1];
    if (n === 0) continue;
    const list = out.get(def.id) ?? [];
    list.push([x / n, z / n]);
    out.set(def.id, list);
  }
  return out;
}

/** 선로 하나의 정차 위치들(s 순). wanted = 이 노선 정차역 id. */
export function trackStops(
  xyz: Float32Array,
  step: number,
  recs: readonly OsmRecord[],
  stations: ReadonlyMap<string, V2[]>,
  wanted: readonly string[],
): TrackStop[] {
  const proj = projector(xyz, step);
  const cands: (TrackStop & { edge: number })[] = [];
  for (const pf of platformRings(recs)) {
    const pr = pf.pts.map(proj);
    const near = pr.filter((q) => Math.abs(q.lateral) <= WIDTH_MAX_M && q.dist <= WIDTH_MAX_M);
    if (near.length < 2) continue;
    const edge = Math.min(...near.map((q) => Math.abs(q.lateral)));
    const same = near.every((q) => Math.sign(q.lateral) === Math.sign(near[0]?.lateral ?? 0));
    if (edge > EDGE_MAX_M || !same) continue;
    const s0 = Math.min(...near.map((q) => q.s));
    const s1 = Math.max(...near.map((q) => q.s));
    if (s1 - s0 < MIN_OVERLAP_M) continue;
    const box = minAreaRect(convexHull(pf.pts));
    const c: V2 = [box.cx, box.cz];
    let station: string | undefined;
    let sd = STATION_REACH_M;
    for (const [id, pts] of stations)
      for (const p of pts) {
        const d = Math.hypot(p[0] - c[0], p[1] - c[1]);
        if (d < sd && wanted.includes(id)) {
          sd = d;
          station = id;
        }
      }
    if (!station) continue;
    const side: 'L' | 'R' = (near[0]?.lateral ?? 0) > 0 ? 'L' : 'R';
    cands.push({ station, s: (s0 + s1) / 2, side, platformLengthM: s1 - s0, centroidS: proj(c).s, edge });
  }
  // 역마다 선로에 가장 붙은 승강장 하나.
  const best = new Map<string, TrackStop & { edge: number }>();
  for (const c of cands) {
    const b = best.get(c.station);
    if (!b || c.edge < b.edge) best.set(c.station, c);
  }
  return [...best.values()].map(({ edge: _, ...t }) => t).sort((a, b) => a.s - b.s);
}
