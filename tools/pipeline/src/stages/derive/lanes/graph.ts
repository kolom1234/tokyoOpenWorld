// 차로 그래프(M06-T05, ADR-0065): OSM 간선 차도 선(trunk·primary·secondary·tertiary + _link — 고가·지하·고속도로 제외) → 공유 꼭짓점(1 cm 키)에서 나눈 가장자리 + 교차점.
// 노드 id가 정규화에서 빠져 있어 좌표로 위상을 복원한다(같은 OSM 노드 = 같은 WF 좌표). see docs/04-data-pipeline.md §4.3(레인 그래프), docs/10-simulation.md §5.1
import { hash32 } from '@sanpo/core';
import type { OsmRecord } from '../../normalize-osm.ts';

const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary']);
/** 10 §5.1: maxspeed 없으면 등급별(km/h). */
const DEFAULT_SPEED: Readonly<Record<string, number>> = { trunk: 50, primary: 50, secondary: 40, tertiary: 30 };

export interface RoadProps {
  /** 1 = 선 방향만, −1 = 반대만, 0 = 양방향. */
  oneway: -1 | 0 | 1;
  /** 선 방향·반대 방향 차로 수(일방통행이면 한쪽만 > 0). */
  lanesF: number;
  lanesB: number;
  speedKmh: number;
  cls: string;
}

export interface Edge {
  id: number;
  wayId: string;
  /** WF xz 꺾은선(선 방향). */
  pts: [number, number][];
  a: string;
  b: string;
  props: RoadProps;
}

export interface Junction {
  key: string;
  hash: number;
  x: number;
  z: number;
  /** 닿는 가장자리 끝(atStart = 가장자리 a 끝). */
  ends: { edge: number; atStart: boolean }[];
}

const num = (v: string | undefined): number | undefined => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** 차도 태그 → 방향·차로 수·제한속도(차로 대상 아님 = undefined). */
export function roadProps(r: OsmRecord): RoadProps | undefined {
  const t = r.tags;
  const link = (t.highway ?? '').endsWith('_link');
  const cls = (t.highway ?? '').replace(/_link$/, '');
  if (r.geom !== 'line' || !MAJOR.has(cls)) return undefined;
  if (t.tunnel !== undefined || (t.bridge !== undefined && (t.layer ?? '0') !== '0') || Number(t.layer ?? 0) !== 0)
    return undefined;
  const ow = t.oneway === 'yes' || t.oneway === '1' || t.oneway === 'true' ? 1 : t.oneway === '-1' ? -1 : 0;
  const total = num(t.lanes);
  let lanesF: number;
  let lanesB: number;
  if (ow !== 0) {
    const n = total ?? (link ? 1 : cls === 'tertiary' ? 1 : 2);
    [lanesF, lanesB] = ow === 1 ? [n, 0] : [0, n];
  } else {
    lanesF = num(t['lanes:forward']) ?? (total ? Math.max(1, Math.ceil(total / 2)) : 1);
    lanesB = num(t['lanes:backward']) ?? (total ? Math.max(1, Math.floor(total / 2)) : 1);
  }
  const ms = num((t.maxspeed ?? '').replace(/\s*km\/h$/, ''));
  return {
    oneway: ow,
    lanesF: Math.min(lanesF, 6),
    lanesB: Math.min(lanesB, 6),
    speedKmh: ms ?? DEFAULT_SPEED[cls] ?? 30,
    cls,
  };
}

const keyOf = (x: number, z: number): string => `${Math.round(x * 100)},${Math.round(z * 100)}`;

/** 선들 → 가장자리(공유 꼭짓점·선 끝에서 나눔) + 교차점. */
export function buildGraph(ways: readonly OsmRecord[]): { edges: Edge[]; junctions: Map<string, Junction> } {
  const use = new Map<string, number>();
  const roads: { r: OsmRecord; props: RoadProps; pts: [number, number][] }[] = [];
  for (const r of [...ways].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const props = roadProps(r);
    const xz = r.rings[0] ?? [];
    if (!props || xz.length < 4) continue;
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) pts.push([xz[i] as number, xz[i + 1] as number]);
    roads.push({ r, props, pts });
    for (const [i, p] of pts.entries()) {
      const k = keyOf(p[0], p[1]);
      use.set(k, (use.get(k) ?? 0) + (i === 0 || i === pts.length - 1 ? 2 : 1));
    }
  }
  const edges: Edge[] = [];
  const junctions = new Map<string, Junction>();
  const junction = (p: [number, number]): Junction => {
    const k = keyOf(p[0], p[1]);
    let j = junctions.get(k);
    if (!j) {
      j = { key: k, hash: hash32(Math.round(p[0] * 100), Math.round(p[1] * 100)), x: p[0], z: p[1], ends: [] };
      junctions.set(k, j);
    }
    return j;
  };
  for (const { r, props, pts } of roads) {
    let start = 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i] as [number, number];
      if (i < pts.length - 1 && (use.get(keyOf(p[0], p[1])) ?? 0) < 2) continue;
      const seg = pts.slice(start, i + 1);
      const ja = junction(seg[0] as [number, number]);
      const jb = junction(p);
      const id = hash32(r.id, start);
      edges.push({ id, wayId: r.id, pts: seg, a: ja.key, b: jb.key, props });
      ja.ends.push({ edge: edges.length - 1, atStart: true });
      jb.ends.push({ edge: edges.length - 1, atStart: false });
      start = i;
    }
  }
  return { edges, junctions };
}
