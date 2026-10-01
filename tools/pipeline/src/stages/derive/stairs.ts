// 교량 계단(M05-T08): OSM `highway=steps` 선 중 한 끝 이상이 PLATEAU 교량 상판에 닿고 두 끝 높이(상판 또는 지형)가 0.5 m 이상 다른 것 → 계단 명세.
// 두 끝 모두 지형인 계단(공원 비탈 등)은 지형이 이미 이어진 경사라 건드리지 않는다. 소유 = 선 중점이 있는 셀(이웃과 중복 없음). see ADR-0056
import type { BridgeRecord } from '../../readers/plateau/types.ts';
import type { OsmRecord } from '../normalize-osm.ts';

export interface StairSpec {
  id: string;
  /** WF xz 꺾은선(아래 → 위 순서로 정렬). */
  path: [number, number][];
  /** 아래·위 끝 WF 높이. */
  y0: number;
  y1: number;
  width: number;
  /** 위 끝 너머 착지판 길이(m) — 상판 안까지 + 0.5(landingOf). */
  landing: number;
}

/** 상판 면(거의 수평 지붕 = OuterFloorSurface) 목록: xz 링 + 평균 높이. */
export interface Deck {
  ring: [number, number][];
  y: number;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** 교량 레코드 → 상판 면(법선 y ≥ 0.9 — 비탈 램프는 제외). */
export function decksOf(bridges: readonly BridgeRecord[]): Deck[] {
  const out: Deck[] = [];
  for (const b of bridges)
    for (const s of b.surfaces) {
      const r = s.kind === 'roof' ? s.ringsWF[0] : undefined;
      if (!r || r.length < 9) continue;
      const ring: [number, number][] = [];
      let [y, lo, hi] = [0, Infinity, -Infinity];
      for (let i = 0; i < r.length; i += 3) {
        ring.push([r[i] as number, r[i + 2] as number]);
        y += r[i + 1] as number;
        lo = Math.min(lo, r[i + 1] as number);
        hi = Math.max(hi, r[i + 1] as number);
      }
      if (hi - lo > 1.5) continue;
      const xs = ring.map((p) => p[0]);
      const zs = ring.map((p) => p[1]);
      out.push({
        ring,
        y: y / ring.length,
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        z0: Math.min(...zs),
        z1: Math.max(...zs),
      });
    }
  return out;
}

function segDist(px: number, pz: number, a: [number, number], b: [number, number]): number {
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.min(1, Math.max(0, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

/** 점에서 snap(m) 안에 있는 가장 높은 상판 높이(면 안이거나 가장자리에서 snap 이내). */
export function deckHeightAt(decks: readonly Deck[], x: number, z: number, snap = 2): number | undefined {
  let best: number | undefined;
  for (const d of decks) {
    if (x < d.x0 - snap || x > d.x1 + snap || z < d.z0 - snap || z > d.z1 + snap) continue;
    let inside = false;
    let near = Infinity;
    for (let i = 0, j = d.ring.length - 1; i < d.ring.length; j = i++) {
      const [a, c] = [d.ring[i] as [number, number], d.ring[j] as [number, number]];
      if (a[1] > z !== c[1] > z && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0]) inside = !inside;
      near = Math.min(near, segDist(x, z, a, c));
    }
    if (inside || near <= snap) best = best === undefined ? d.y : Math.max(best, d.y);
  }
  return best;
}

const ownedBy = (o: { x0: number; z0: number }, p: [number, number]) =>
  p[0] >= o.x0 && p[0] < o.x0 + 256 && p[1] >= o.z0 && p[1] < o.z0 + 256;

interface StepLine {
  id: string;
  path: [number, number][];
  width: number;
}

/** 지상 계단 선(`highway=steps`, 지하·실내 제외) → xz 꺾은선 + 폭(태그 없으면 2 m, ≤ 8 m). */
function stepLines(osm: readonly OsmRecord[]): StepLine[] {
  const out: StepLine[] = [];
  for (const r of osm) {
    const t = r.tags;
    if (r.geom !== 'line' || t.highway !== 'steps' || t.tunnel === 'yes' || t.indoor !== undefined) continue;
    if (Number.parseFloat(t.layer ?? '0') < 0 || t.level?.startsWith('-')) continue;
    const line = r.rings[0];
    if (!line || line.length < 4) continue;
    const path: [number, number][] = [];
    for (let i = 0; i + 1 < line.length; i += 2) path.push([line[i] as number, line[i + 1] as number]);
    const w = Number.parseFloat(t.width ?? '');
    out.push({ id: r.id, path, width: Number.isFinite(w) && w > 0.8 ? Math.min(w, 8) : 2 });
  }
  return out;
}

/** 계단 높이 상한(m) — 보도육교·역 데크는 4–8 m. 넘으면 고가도로 상판 등 다른 교량에 잘못 붙은 것(시부야 수도고 31 m). */
export const STAIR_MAX_RISE_M = 10;

/** 높이 차 0.5 m 이상·상한 이하·평균 경사 45° 이하(수평 길이 ≥ 높이). */
function plausible(h: number, path: readonly [number, number][]): boolean {
  let l = 0;
  for (let i = 0; i + 1 < path.length; i++)
    l += Math.hypot(
      (path[i + 1] as [number, number])[0] - (path[i] as [number, number])[0],
      (path[i + 1] as [number, number])[1] - (path[i] as [number, number])[1],
    );
  return h >= 0.5 && h <= STAIR_MAX_RISE_M && h <= l;
}

/** 셀이 가진 높이 계단(cell 없으면 소유 무관 — 교량 면 걷어내기용 이웃 포함 계단). groundAt = WF 지면 높이(못 찾으면 undefined). */
export function stairsOf(
  osm: readonly OsmRecord[],
  decks: readonly Deck[],
  groundAt: (x: number, z: number) => number | undefined,
  cell?: { x0: number; z0: number },
): StairSpec[] {
  const out: StairSpec[] = [];
  for (const { id, path, width } of stepLines(osm)) {
    if (cell && !ownedBy(cell, path[Math.floor(path.length / 2)] as [number, number])) continue;
    const [a, b] = [path[0] as [number, number], path[path.length - 1] as [number, number]];
    const [da, db] = [deckHeightAt(decks, a[0], a[1]), deckHeightAt(decks, b[0], b[1])];
    if (da === undefined && db === undefined) continue;
    const [ha, hb] = [da ?? groundAt(a[0], a[1]), db ?? groundAt(b[0], b[1])];
    if (ha === undefined || hb === undefined || !plausible(Math.abs(hb - ha), path)) continue;
    const up = hb > ha;
    const [y0, y1] = [Math.min(ha, hb), Math.max(ha, hb)];
    const ordered = up ? path : [...path].reverse();
    const cut = (up ? db : da) !== undefined ? cutAtDeck(ordered, decks, y1, y1 - y0) : ordered;
    out.push({ id, path: cut, y0, y1, width, landing: landingOf(cut, decks, y1) });
  }
  return out;
}

/**
 * 위 끝에서 진행 방향으로 높이 y1 상판 안까지 거리 + 0.5 m(착지판 — OSM 끝점이 상판 가장자리 밖이어도 틈 없이 잇는다). 2 m 안에 상판이 없으면(옆에 닿는 끝) 0.5 m.
 * 상판 너머로 튀어나오지 않게 짧게 — 걷어내기 범위(carvedBy)도 여기까지.
 */
export function landingOf(path: readonly [number, number][], decks: readonly Deck[], y1: number): number {
  const [p, q] = [path[path.length - 2] as [number, number], path[path.length - 1] as [number, number]];
  const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
  const [dx, dz] = [(q[0] - p[0]) / l, (q[1] - p[1]) / l];
  for (let t = 0; t <= 2; t += CUT_STEP_M)
    if ((deckHeightAt(decks, q[0] + dx * t, q[1] + dz * t, 0) ?? -Infinity) >= y1 - 0.3) return t + 0.5;
  return 0.5;
}

/** 상판 안쪽 판정 간격(m). */
const CUT_STEP_M = 0.25;

/**
 * 꺾은선(아래 → 위)을 높이 y1 상판 안에 처음 들어가는 곳에서 자른다(아래 끝에서 minLen 이후 — 경사 상한). OSM 선 끝이 상판 안쪽 깊이 들어가면
 * 계단 윗부분이 상판 밑을 지나 머리가 걸린다(新都心歩道橋 3.8 m).
 */
export function cutAtDeck(
  path: readonly [number, number][],
  decks: readonly Deck[],
  y1: number,
  minLen: number,
): [number, number][] {
  const out: [number, number][] = [path[0] as [number, number]];
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [a, b] = [path[i] as [number, number], path[i + 1] as [number, number]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = CUT_STEP_M; t < l; t += CUT_STEP_M) {
      if (acc + t < Math.max(0.5, minLen)) continue;
      const p: [number, number] = [a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l];
      if ((deckHeightAt(decks, p[0], p[1], 0) ?? -Infinity) >= y1 - 0.3) return [...out, p];
    }
    out.push(b);
    acc += l;
  }
  return out;
}

/** 셀 교량·계단 입력(assemble CellBuildInput 일부). */
export interface WalkwaySources {
  bridges?: readonly BridgeRecord[];
  bridgesAround?: readonly BridgeRecord[];
  osm?: readonly OsmRecord[];
  stepsAround?: readonly OsmRecord[];
  groundAround?: (x: number, z: number) => number | undefined;
}

/**
 * 교량·높이 계단(M05-T08): 셀 교량 + 셀이 가진 계단(끝점 = 이웃 포함 교량 상판 또는 셀 지형 terrainAt(로컬)) + 교량 면을 걷어낼 통로
 * (이웃 셀 계단 포함, 지면 = 영역 DEM groundAround — 같은 판정이라 만들지 않는 계단은 걷어내지 않는다). o = 셀 원점 WF.
 */
export function walkwaysOf(
  input: WalkwaySources,
  o: readonly [number, number, number],
  terrainAt: (x: number, z: number) => number | undefined,
): { bridges: readonly BridgeRecord[]; stairs: StairSpec[]; corridors: StairSpec[] } {
  const decks = decksOf(input.bridgesAround ?? input.bridges ?? []);
  const groundWF = (x: number, z: number) => terrainAt(x - o[0], z - o[2]);
  const stairs = stairsOf(input.osm ?? [], decks, groundWF, { x0: o[0], z0: o[2] });
  const corridors = input.bridges?.length
    ? stairsOf(input.stepsAround ?? input.osm ?? [], decks, input.groundAround ?? groundWF)
    : [];
  return { bridges: input.bridges ?? [], stairs, corridors };
}
