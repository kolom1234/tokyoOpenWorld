// 선로 조립(M07-T01): OSM 철도 선(노선 이름별, service 없는 본선만) → 끝점 공유로 이은 사슬 → 긴 사슬 = 선로. 방향 = 좌측통행:
// 같은 노선 두 선로 중 북쪽(−Z)으로 갈 때 왼쪽(서쪽) 선로 = 상행·북행, 오른쪽은 뒤집어 남행(점 순서 = 진행 방향). 교량·터널 구간은 꼭짓점 플래그로.
// see docs/04-data-pipeline.md §4.3(철도), docs/10-simulation.md §6.1
import type { OsmRecord } from '../../normalize-osm.ts';

export type V2 = [number, number];

/** 꼭짓점 플래그(rail.bin RAIL_FLAG와 같은 비트). */
export const VERTEX_FLAG = { tunnel: 1, bridge: 2 } as const;

export interface RawTrack {
  /** 노선 id(content/sim/rail-lines.json). */
  line: string;
  /** 'north' | 'south'(또는 노선 정의의 방향 이름은 build에서 붙인다). */
  heading: 'north' | 'south';
  /** WF xz 꼭짓점(진행 방향 순). */
  pts: V2[];
  /** 꼭짓점별 플래그(그 꼭짓점이 속한 way들의 OR — 구간 플래그 = 양 끝 AND). */
  flags: number[];
  /** OSM way id(추적용). */
  ways: string[];
}

const keyOf = (x: number, z: number): string => `${x.toFixed(2)},${z.toFixed(2)}`;

interface Way {
  id: string;
  pts: V2[];
  flag: number;
}

function waysOf(recs: readonly OsmRecord[], names: readonly string[]): Way[] {
  const out: Way[] = [];
  for (const r of recs) {
    if (r.geom !== 'line' || r.tags.service) continue;
    if (!['rail', 'subway', 'light_rail'].includes(r.tags.railway ?? '')) continue;
    const ns = (r.tags.name ?? '').split(';').map((s) => s.trim());
    if (!ns.some((n) => names.includes(n))) continue;
    const xz = r.rings[0] ?? [];
    const pts: V2[] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) pts.push([xz[i] as number, xz[i + 1] as number]);
    if (pts.length < 2) continue;
    const tunnel = r.tags.tunnel && r.tags.tunnel !== 'no' ? VERTEX_FLAG.tunnel : 0;
    const bridge = r.tags.bridge && r.tags.bridge !== 'no' ? VERTEX_FLAG.bridge : 0;
    out.push({ id: r.id, pts, flag: tunnel | bridge });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const heading = (a: V2, b: V2): number => Math.atan2(b[1] - a[1], b[0] - a[0]);
const turn = (h1: number, h2: number): number => {
  const d = Math.abs(h1 - h2) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

/** 끝점 공유로 사슬 잇기(갈림은 가장 곧은 쪽). 반환 = 사슬마다 (점, 플래그, way). */
export function chainWays(ways: readonly Way[]): { pts: V2[]; flags: number[]; ways: string[] }[] {
  const ends = new Map<string, number[]>();
  ways.forEach((w, i) => {
    for (const p of [w.pts[0] as V2, w.pts[w.pts.length - 1] as V2]) {
      const k = keyOf(p[0], p[1]);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Set<number>();
  const chains: { pts: V2[]; flags: number[]; ways: string[] }[] = [];
  const oriented = (i: number, from: V2): V2[] => {
    const w = (ways[i] as Way).pts;
    const f = w[0] as V2;
    return keyOf(f[0], f[1]) === keyOf(from[0], from[1]) ? [...w] : [...w].reverse();
  };
  const grow = (pts: V2[], flags: number[], ids: string[]): void => {
    for (;;) {
      const tail = pts[pts.length - 1] as V2;
      const h = heading(pts[pts.length - 2] as V2, tail);
      const cand = (ends.get(keyOf(tail[0], tail[1])) ?? []).filter((j) => !used.has(j));
      if (cand.length === 0) return;
      const best = cand
        .map((j) => ({ j, p: oriented(j, tail) }))
        .sort((a, b) => turn(h, heading(a.p[0] as V2, a.p[1] as V2)) - turn(h, heading(b.p[0] as V2, b.p[1] as V2)))[0];
      if (!best || turn(h, heading(best.p[0] as V2, best.p[1] as V2)) > Math.PI / 4) return;
      used.add(best.j);
      const w = ways[best.j] as Way;
      flags[flags.length - 1] = (flags[flags.length - 1] as number) | w.flag;
      for (let k = 1; k < best.p.length; k++) {
        pts.push(best.p[k] as V2);
        flags.push(w.flag);
      }
      ids.push(w.id);
    }
  };
  for (let i = 0; i < ways.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const w = ways[i] as Way;
    const pts = [...w.pts];
    const flags = w.pts.map(() => w.flag);
    const ids = [w.id];
    grow(pts, flags, ids);
    pts.reverse();
    flags.reverse();
    ids.reverse();
    grow(pts, flags, ids);
    chains.push({ pts, flags, ways: ids });
  }
  return chains;
}

export const lengthOf = (pts: readonly V2[]): number => {
  let n = 0;
  for (let i = 1; i < pts.length; i++)
    n += Math.hypot((pts[i] as V2)[0] - (pts[i - 1] as V2)[0], (pts[i] as V2)[1] - (pts[i - 1] as V2)[1]);
  return n;
};

/** 사슬을 남 → 북(z 감소)으로 돌린다. */
function northward(c: { pts: V2[]; flags: number[]; ways: string[] }) {
  const a = c.pts[0] as V2;
  const b = c.pts[c.pts.length - 1] as V2;
  if (a[1] >= b[1]) return c;
  return { pts: [...c.pts].reverse(), flags: [...c.flags].reverse(), ways: [...c.ways].reverse() };
}

/** 점 p가 꺾은선(남 → 북) 진행 방향의 왼쪽이면 +(가장 가까운 구간의 외적 부호 × 거리). */
export function signedOffset(line: readonly V2[], p: V2): number {
  let best = Number.POSITIVE_INFINITY;
  let sign = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as V2;
    const b = line[i] as V2;
    const ux = b[0] - a[0];
    const uz = b[1] - a[1];
    const L2 = ux * ux + uz * uz || 1;
    const t = Math.min(Math.max(((p[0] - a[0]) * ux + (p[1] - a[1]) * uz) / L2, 0), 1);
    const d = Math.hypot(p[0] - a[0] - ux * t, p[1] - a[1] - uz * t);
    if (d < best) {
      best = d;
      // WF: +X 동, +Z 남(−Z 북). 진행 방향 u의 왼쪽 = (uz, −ux) — 북행이면 서. 횡거리 = d · 왼쪽 = uz·dx − ux·dz.
      sign = Math.sign(uz * (p[0] - a[0]) - ux * (p[1] - a[1]));
    }
  }
  return sign * best;
}

/**
 * 노선 이름들 → 선로(최소 길이 이상 사슬). 두 개 이상이면 첫 사슬 기준 왼쪽 = 북행(좌측통행), 오른쪽 = 남행(뒤집음).
 * 하나뿐이면(단선·종착 구간) 북행 하나.
 */
export function buildTracks(
  recs: readonly OsmRecord[],
  line: string,
  names: readonly string[],
  minLengthM = 300,
): RawTrack[] {
  const chains = chainWays(waysOf(recs, names))
    .filter((c) => lengthOf(c.pts) >= minLengthM)
    .map(northward)
    .sort((a, b) => lengthOf(b.pts) - lengthOf(a.pts));
  const ref = chains[0];
  if (!ref) return [];
  return chains.map((c) => {
    const mid = c.pts[Math.floor(c.pts.length / 2)] as V2;
    const left = c === ref ? leftOfOthers(ref, chains) : signedOffset(ref.pts, mid) > 0;
    if (left) return { line, heading: 'north' as const, ...c };
    return {
      line,
      heading: 'south' as const,
      pts: [...c.pts].reverse(),
      flags: [...c.flags].reverse(),
      ways: [...c.ways].reverse(),
    };
  });
}

/** 기준 사슬이 다른 사슬들보다 왼쪽인가(다른 사슬 중점이 기준의 오른쪽이면 기준 = 왼쪽). */
function leftOfOthers(ref: { pts: V2[] }, chains: readonly { pts: V2[] }[]): boolean {
  const others = chains.filter((c) => c !== ref);
  if (others.length === 0) return true;
  const o = others[0] as { pts: V2[] };
  return signedOffset(ref.pts, o.pts[Math.floor(o.pts.length / 2)] as V2) < 0;
}
