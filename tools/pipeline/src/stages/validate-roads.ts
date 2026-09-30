// M05-T01 수락 검사: 무작위 교차로 50곳(PLATEAU 車道交差部 TrafficArea:1020 중심을 25 m 격자로 묶은 대표점, 시드 결정론) 반경 30 m 안에서
// 보도 바깥 가장자리(roads.mesh 치마 윗변, _SURF 1 세로 면)와 지형(terrain.mesh 실제 삼각형) 간극 < 2 cm,
// 연석(_SURF 7 세로 면) 아래 끝이 차도 쪽 지형보다 아래(틈 없음)인지 0.25 m 간격으로 잰다. see docs/roadmap/M05.md M05-T01
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellIdString, createRng, packCellKey } from '@sanpo/core';
import { readTkc } from '@sanpo/tile-format';
import { decodeGlb } from '../lib/gltf.ts';
import { type Mesh, terrainLookup } from '../lib/mesh-lookup.ts';
import { readNdjsonGz } from '../lib/ndjson-gz.ts';
import type { RoadRecord } from '../readers/plateau/types.ts';
import { TOP_OFFSET_M } from './derive/sidewalks.ts';

export const GAP_LIMIT_M = 0.02;
const INTERSECTIONS = 50;
const RADIUS_M = 30;
const CLUSTER_M = 25;
const STEP_M = 0.25;
/** 가장자리 바깥 탐침(m) — 간극 = 가장자리 선에서의 수직 거리(5 cm면 바깥 경사 × 5 cm가 섞였다). */
const PROBE_M = 0.02;
const CELL = 256;
/** 車道交差部(PLATEAU TrafficArea_function 1020) — 횡단보도는 tran에 없다(OSM, M05-T02). */
const INTERSECTION_CODE = 'TrafficArea:1020';

export interface RoadGapReport {
  intersections: number;
  edgeSamples: number;
  maxGapM: number;
  over: number;
  curbSamples: number;
  curbUncovered: number;
  worst: { at: [number, number]; gapM: number }[];
  /** 교차로별 최대 간극(m, 선택 순서) — 교차로 단위 합격 = 최대 < 2 cm. */
  perIntersection: number[];
  /** 최대 간극 ≥ 2 cm인 교차로 수. */
  intersectionsOver: number;
  /** ≥ 2 cm 표본 분포: 가장자리가 지형보다 위(뜸)·아래(지형이 덮음), 크기 구간 < 5 cm·< 15 cm·< 1 m·≥ 1 m. */
  hist: { above: number; below: number; lt5: number; lt15: number; lt100: number; ge100: number };
}

/** 세로 면 정점 xz 키(0.1 mm). */
const xzKey = (x: number, z: number): string => `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`;

function faceNormal(P: readonly number[][]): number[] {
  const [A, B, C] = P as [number[], number[], number[]];
  const u = [0, 1, 2].map((k) => (B[k] as number) - (A[k] as number));
  const w = [0, 1, 2].map((k) => (C[k] as number) - (A[k] as number));
  return [
    (u[1] as number) * (w[2] as number) - (u[2] as number) * (w[1] as number),
    (u[2] as number) * (w[0] as number) - (u[0] as number) * (w[2] as number),
    (u[0] as number) * (w[1] as number) - (u[1] as number) * (w[0] as number),
  ];
}

/**
 * 세로 사각형(|n.y| < 0.2, _SURF = surf)의 윗변·아랫변 조각 + 바깥 법선. 같은 xz에 쌓인 정점 중 가장 높은(낮은) 것이 윗점(아랫점) —
 * 삼각형 안 y만 보면 경사(12 %)에서 대각선(한쪽 윗점–다른 쪽 아랫점)을 변으로 오인한다.
 */
export function verticalEdges(m: Mesh, surf: number, which: 'top' | 'bottom') {
  const tris: { P: number[][]; n: number[] }[] = [];
  const ext = new Map<string, number>();
  for (let tri = 0; tri < m.idx.length / 3; tri++) {
    const v = [0, 1, 2].map((k) => m.idx[tri * 3 + k] as number);
    if (m.surf?.[v[0] as number] !== surf) continue;
    const P = v.map((i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]] as number[]);
    const n = faceNormal(P);
    const len = Math.hypot(...n);
    if (len === 0 || Math.abs((n[1] as number) / len) > 0.2) continue;
    tris.push({ P, n });
    for (const p of P) {
      const k = xzKey(p[0] as number, p[2] as number);
      const y = p[1] as number;
      const cur = ext.get(k);
      ext.set(k, cur === undefined ? y : which === 'top' ? Math.max(cur, y) : Math.min(cur, y));
    }
  }
  const out: { a: number[]; b: number[]; n: [number, number] }[] = [];
  for (const { P, n } of tris) {
    const pick = P.filter(
      (p) => Math.abs((p[1] as number) - (ext.get(xzKey(p[0] as number, p[2] as number)) as number)) < 1e-4,
    );
    if (pick.length !== 2) continue;
    const [a, b] = pick as [number[], number[]];
    if (Math.hypot((a[0] as number) - (b[0] as number), (a[2] as number) - (b[2] as number)) < 1e-3) continue;
    const h = Math.hypot(n[0] as number, n[2] as number);
    out.push({ a, b, n: [(n[0] as number) / h, (n[2] as number) / h] });
  }
  return out;
}

/** 교차로 면 중심 → 25 m 격자 묶음 대표점(WF) → 시드 셔플 50개. */
export function pickIntersections(crosswalks: readonly [number, number][], seed: number, count = INTERSECTIONS) {
  const groups = new Map<string, [number, number]>();
  for (const [x, z] of crosswalks) {
    const k = `${Math.floor(x / CLUSTER_M)},${Math.floor(z / CLUSTER_M)}`;
    if (!groups.has(k)) groups.set(k, [x, z]);
  }
  const all = [...groups.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const rng = createRng(seed);
  for (let i = all.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    [all[i], all[j]] = [all[j] as [number, number], all[i] as [number, number]];
  }
  return all.slice(0, count);
}

function crosswalkCentroids(normalizedDir: string, cells: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  for (const id of cells) {
    const f = join(normalizedDir, 'roads', `${id}.ndjson.gz`);
    if (!existsSync(f)) continue;
    for (const r of readNdjsonGz<RoadRecord>(f)) {
      if (r.functionCode !== INTERSECTION_CODE && r.function !== 'crosswalk') continue;
      const o = r.polygonWF[0] ?? [];
      let [x, z] = [0, 0];
      for (let i = 0; i < o.length; i += 3) [x, z] = [x + (o[i] as number), z + (o[i + 2] as number)];
      out.push([x / (o.length / 3), z / (o.length / 3)]);
    }
  }
  return out;
}

interface CellMeshes {
  ox: number;
  oz: number;
  terrainAt: (x: number, z: number) => number | undefined;
  roads: Mesh;
}

/** 양자화 위치(KHR_mesh_quantization) → 셀 로컬 m(노드 이동·스케일). */
function dequantized(
  q: ArrayLike<number>,
  g: { translation: readonly number[]; scale: readonly number[] },
): Float64Array {
  const out = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++)
    out[i] = (q[i] as number) * (g.scale[i % 3] as number) + (g.translation[i % 3] as number);
  return out;
}

async function loadCell(buildDir: string, ix: number, iz: number): Promise<CellMeshes | undefined> {
  const f = join(buildDir, 'L0', String(ix), `${iz}.tkc`);
  if (!existsSync(f)) return undefined;
  const r = readTkc(new Uint8Array(readFileSync(f)));
  if (!r.ok) return undefined;
  const t = r.value.section('terrain.mesh');
  const rd = r.value.section('roads.mesh');
  if (!t || !rd) return undefined;
  const td = await decodeGlb(t);
  const rdd = await decodeGlb(rd);
  const tp = td.primitives[0];
  const rp = rdd.primitives[0];
  if (!tp || !rp) return undefined;
  const terrain: Mesh = { pos: dequantized(tp.attributes.POSITION?.array ?? [], td), idx: tp.indices };
  const roads: Mesh = {
    pos: dequantized(rp.attributes.POSITION?.array ?? [], rdd),
    idx: rp.indices,
    surf: rp.attributes._SURF?.array ?? [],
  };
  const ground = terrainLookup(terrain);
  const tops = terrainLookup(upFacing(roads));
  // 보이는 면 = 지형과 (다른) 보도 윗면 중 높은 것 — PLATEAU 보도 폴리곤끼리 겹치면 가장자리 바깥이 이웃 보도 윗면이다.
  const terrainAt = (x: number, z: number): number | undefined => {
    const g = ground(x, z);
    const t = tops(x, z);
    return g === undefined ? undefined : t === undefined ? g : Math.max(g, t - TOP_OFFSET_M);
  };
  return { ox: ix * CELL, oz: iz * CELL, terrainAt, roads };
}

/** 위를 향한 삼각형(보도 윗면)만. */
function upFacing(m: Mesh): Mesh {
  const idx: number[] = [];
  for (let t = 0; t < m.idx.length / 3; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.idx[t * 3 + k] as number) * 3) as [number, number, number];
    const p = (v: number, o: number): number => m.pos[v + o] as number;
    const ny = (p(b, 2) - p(a, 2)) * (p(c, 0) - p(a, 0)) - (p(b, 0) - p(a, 0)) * (p(c, 2) - p(a, 2));
    const area = Math.hypot(p(b, 0) - p(a, 0), p(b, 2) - p(a, 2)) * Math.hypot(p(c, 0) - p(a, 0), p(c, 2) - p(a, 2));
    if (area > 0 && Math.abs(ny) / area > 0.05)
      idx.push(m.idx[t * 3] as number, m.idx[t * 3 + 1] as number, m.idx[t * 3 + 2] as number);
  }
  return { pos: m.pos, idx };
}

/** 선분 a→b를 STEP_M 간격 표본(끝점 포함). */
function* samples(a: number[], b: number[]): Generator<number[]> {
  const len = Math.hypot((b[0] as number) - (a[0] as number), (b[2] as number) - (a[2] as number));
  const n = Math.max(1, Math.ceil(len / STEP_M));
  for (let i = 0; i <= n; i++)
    yield [0, 1, 2].map((k) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * (i / n));
}

/** 표본 위치 → 반경 안 교차로 번호들(교차로 없음 = [−1], 모두 잰다). */
type NearFn = (x: number, z: number) => number[];

function measureCell(c: CellMeshes, near: NearFn, rep: RoadGapReport): void {
  for (const e of verticalEdges(c.roads, 1, 'top')) {
    for (const p of samples(e.a, e.b)) {
      const [x, y, z] = p as [number, number, number];
      const hits = near(x + c.ox, z + c.oz);
      if (hits.length === 0) continue;
      const t = c.terrainAt(x + e.n[0] * PROBE_M, z + e.n[1] * PROBE_M);
      if (t === undefined) continue;
      const signed = y - TOP_OFFSET_M - t;
      const gap = Math.abs(signed);
      rep.edgeSamples++;
      for (const i of hits) if (i >= 0) rep.perIntersection[i] = Math.max(rep.perIntersection[i] ?? 0, gap);
      if (gap > rep.maxGapM) rep.maxGapM = gap;
      if (gap >= GAP_LIMIT_M) {
        rep.over++;
        const h = rep.hist;
        if (signed > 0) h.above++;
        else h.below++;
        if (gap < 0.05) h.lt5++;
        else if (gap < 0.15) h.lt15++;
        else if (gap < 1) h.lt100++;
        else h.ge100++;
        rep.worst.push({ at: [x + c.ox, z + c.oz], gapM: signed });
        rep.worst.sort((a, b) => Math.abs(b.gapM) - Math.abs(a.gapM));
        if (rep.worst.length > 10) rep.worst.length = 10;
      }
    }
  }
  for (const e of verticalEdges(c.roads, 7, 'bottom')) {
    for (const p of samples(e.a, e.b)) {
      const [x, y, z] = p as [number, number, number];
      if (near(x + c.ox, z + c.oz).length === 0) continue;
      const t = c.terrainAt(x + e.n[0] * PROBE_M, z + e.n[1] * PROBE_M);
      if (t === undefined) continue;
      rep.curbSamples++;
      if (t < y - 1e-3) rep.curbUncovered++;
    }
  }
}

/**
 * 빌드 디렉터리의 L0 셀 → 교차로(정규화 횡단보도, 없으면 모든 셀 전체) 반경 30 m 안 간극 측정.
 * normalizedDir가 없거나 횡단보도가 없으면 모든 보도 가장자리를 잰다(intersections = 0).
 */
export async function checkRoadGaps(
  buildDir: string,
  normalizedDir: string | undefined,
  seed = 0x5a4f,
): Promise<RoadGapReport> {
  const rep: RoadGapReport = {
    hist: { above: 0, below: 0, lt5: 0, lt15: 0, lt100: 0, ge100: 0 },
    perIntersection: [],
    intersectionsOver: 0,
    intersections: 0,
    edgeSamples: 0,
    maxGapM: 0,
    over: 0,
    curbSamples: 0,
    curbUncovered: 0,
    worst: [],
  };
  const l0 = join(buildDir, 'L0');
  if (!existsSync(l0)) return rep;
  const cells: [number, number][] = [];
  for (const ix of readdirSync(l0))
    for (const f of readdirSync(join(l0, ix))) cells.push([Number(ix), Number(f.replace('.tkc', ''))]);
  const ids = cells.map(([ix, iz]) => cellIdString(packCellKey(0, ix, iz)));
  const picks = normalizedDir ? pickIntersections(crosswalkCentroids(normalizedDir, ids), seed) : [];
  rep.intersections = picks.length;
  rep.perIntersection = picks.map(() => 0);
  const near: NearFn = (x, z) =>
    picks.length === 0 ? [-1] : picks.flatMap(([px, pz], i) => (Math.hypot(px - x, pz - z) <= RADIUS_M ? [i] : []));
  const want = new Set(
    picks.length === 0
      ? cells.map(([ix, iz]) => `${ix},${iz}`)
      : picks.flatMap(([x, z]) =>
          [-1, 0, 1].flatMap((dz) =>
            [-1, 0, 1].map(
              (dx) => `${Math.floor((x + dx * RADIUS_M) / CELL)},${Math.floor((z + dz * RADIUS_M) / CELL)}`,
            ),
          ),
        ),
  );
  for (const [ix, iz] of cells) {
    if (!want.has(`${ix},${iz}`)) continue;
    const c = await loadCell(buildDir, ix, iz);
    if (c) measureCell(c, near, rep);
  }
  rep.intersectionsOver = rep.perIntersection.filter((g) => g >= GAP_LIMIT_M).length;
  rep.perIntersection = rep.perIntersection.map((g) => Math.round(g * 1000) / 1000);
  return rep;
}
