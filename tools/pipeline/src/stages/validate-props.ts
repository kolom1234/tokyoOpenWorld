// 소품 차도 검사(M07 사전 ⓪): L0 셀 props.inst의 지상 소품이 PLATEAU 차도 폴리곤(carriageway·crosswalk·other — 보행면 우선, 건물 발자국 제외) 위면 오류.
// 예외: 맨홀(차도 위가 정상)·벽면/옥상 간판(지상 아님), 보도 없는 길의 가장자리(가장 가까운 비차도 = 건물·공지가 ≤ EDGE_M, 그 거리에 보도 없음 —
// 생활도로 전주·자판기). 연석 오프셋: 보도 위 길가 기둥(신호·표지·전주·가로등)이 차도에서 < CURB_BACK_M면 curbTight(오류). see docs/04-data-pipeline.md §4.6
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellIdString, unpackCellKey } from '@sanpo/core';
import { gunzip, PROP_TYPE, parseProps, readCellsIndex, readTkc } from '@sanpo/tile-format';
import { readNdjsonGz } from '../lib/ndjson-gz.ts';
import type { BuildingRecord, RoadRecord } from '../readers/plateau/types.ts';
import { CURB_BACK_M, EDGE_M, nearestSide, ROADSIDE_SEARCH_M, type SiteTest } from './derive/props/curb.ts';
import { insideRings, roadIndex } from './derive/roads.ts';

const CELL = 256;
const BUCKET_M = 16;

/** 검사 제외: 차도 위가 정상(맨홀) 또는 지상이 아님(벽면·옥상 간판). */
const SKIP = new Set<number>([PROP_TYPE.manhole, PROP_TYPE.signProjecting, PROP_TYPE.signRooftop]);
/** 길가 기둥(연석 뒤 오프셋 대상). */
export const CURB_POLES = new Set<number>([
  PROP_TYPE.signalVehicle,
  PROP_TYPE.signalPedestrian,
  PROP_TYPE.signStop,
  PROP_TYPE.utilityPole,
  PROP_TYPE.streetLamp,
  PROP_TYPE.busStop,
]);
const TYPE_NAME = new Map<number, string>(Object.entries(PROP_TYPE).map(([k, v]) => [v, k]));

export interface PropRoadSample {
  cell: string;
  type: string;
  at: [number, number];
  /** 가장 가까운 비차도(m, ROADSIDE_SEARCH_M 안에 없으면 −1) — curbTight면 가장 가까운 차도. */
  edgeM: number;
  /** 그 거리에 보도가 있었나(= 연석 뒤로 갔어야 했다). */
  walk: boolean;
}

export interface PropRoadReport {
  cells: number;
  /** 검사한 지상 소품. */
  checked: number;
  /** 차도 위(오류). */
  onRoad: number;
  byType: Record<string, number>;
  /** 보도 없는 길가(허용). */
  roadsideNoWalk: number;
  /** 보도 위 길가 기둥 중 연석 뒤 < CURB_BACK_M(오류). */
  curbTight: number;
  curbTightByType: Record<string, number>;
  curbPoles: number;
  samples: PropRoadSample[];
}

/** 건물 지면 링 색인(16 m 버킷, WF). */
function buildingTest(buildings: readonly BuildingRecord[]): (x: number, z: number) => boolean {
  const rings: (readonly (readonly number[])[])[] = [];
  const buckets = new Map<string, number[]>();
  for (const b of buildings)
    for (const s of b.surfaces) {
      if (s.kind !== 'ground') continue;
      const o = s.ringsWF[0] ?? [];
      let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
      for (let i = 0; i < o.length; i += 3) {
        x0 = Math.min(x0, o[i] as number);
        x1 = Math.max(x1, o[i] as number);
        z0 = Math.min(z0, o[i + 2] as number);
        z1 = Math.max(z1, o[i + 2] as number);
      }
      const id = rings.push(s.ringsWF) - 1;
      for (let bz = Math.floor(z0 / BUCKET_M); bz <= Math.floor(z1 / BUCKET_M); bz++)
        for (let bx = Math.floor(x0 / BUCKET_M); bx <= Math.floor(x1 / BUCKET_M); bx++) {
          const k = `${bx},${bz}`;
          const list = buckets.get(k);
          if (list) list.push(id);
          else buckets.set(k, [id]);
        }
    }
  return (x, z) => {
    for (const id of buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(z / BUCKET_M)}`) ?? [])
      if (insideRings(rings[id] as readonly (readonly number[])[], x, z)) return true;
    return false;
  };
}

function around<T>(dir: string, ix: number, iz: number, cache: Map<string, T[]>): T[] {
  const out: T[] = [];
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const f = join(dir, `L0_${ix + dx}_${iz + dz}.ndjson.gz`);
      let list = cache.get(f);
      if (!list) {
        list = existsSync(f) ? readNdjsonGz<T>(f) : [];
        cache.set(f, list);
      }
      out.push(...list);
    }
  return out;
}

function tally(m: Record<string, number>, name: string): void {
  m[name] = (m[name] ?? 0) + 1;
}

function checkOne(r: PropRoadReport, t: SiteTest, cell: string, typeId: number, x: number, z: number): void {
  r.checked++;
  const name = TYPE_NAME.get(typeId) ?? String(typeId);
  const side = t.side(x, z);
  if (side === 'walk') {
    if (!CURB_POLES.has(typeId)) return;
    r.curbPoles++;
    const near = nearestSide(t, [x, z], (s) => s === 'road', CURB_BACK_M - 0.02, 0.05);
    if (near.d < 0) return;
    r.curbTight++;
    tally(r.curbTightByType, name);
    if (r.samples.length < 60) r.samples.push({ cell, type: name, at: [x, z], edgeM: near.d, walk: true });
    return;
  }
  if (side !== 'road') return;
  const edge = nearestSide(t, [x, z], (s) => s !== 'road', ROADSIDE_SEARCH_M);
  if (edge.d >= 0 && edge.d <= EDGE_M && !edge.walk) {
    r.roadsideNoWalk++;
    return;
  }
  r.onRoad++;
  tally(r.byType, name);
  if (r.samples.length < 60) r.samples.push({ cell, type: name, at: [x, z], edgeM: edge.d, walk: edge.walk });
}

function emptyReport(): PropRoadReport {
  return {
    cells: 0,
    checked: 0,
    onRoad: 0,
    byType: {},
    roadsideNoWalk: 0,
    curbTight: 0,
    curbTightByType: {},
    curbPoles: 0,
    samples: [],
  };
}

/** `data/build/<buildId>`의 L0 셀 전부. normalizedDir = data/normalized(도로 폴리곤·건물 발자국). */
export async function checkPropsOnRoad(buildDir: string, normalizedDir: string): Promise<PropRoadReport> {
  const r = emptyReport();
  const idxR = readCellsIndex(new Uint8Array(readFileSync(join(buildDir, 'cells.idx'))));
  if (!idxR.ok) return r;
  const roadCache = new Map<string, RoadRecord[]>();
  const bldCache = new Map<string, BuildingRecord[]>();
  for (const key of idxR.value.keys()) {
    const { level, ix, iz } = unpackCellKey(key);
    if (level !== 0) continue;
    const tkc = readTkc(new Uint8Array(readFileSync(join(buildDir, 'L0', String(ix), `${iz}.tkc`))));
    const sec = tkc.ok ? tkc.value.section('props.inst') : undefined;
    if (!sec) continue;
    const raw = await gunzip(sec);
    const batches = raw.ok ? parseProps(raw.value) : undefined;
    if (!batches?.ok) continue;
    r.cells++;
    const roads = roadIndex(around<RoadRecord>(join(normalizedDir, 'roads'), ix, iz, roadCache));
    const inBuilding = buildingTest(around<BuildingRecord>(join(normalizedDir, 'buildings'), ix, iz, bldCache));
    const t: SiteTest = { side: (x, z) => (inBuilding(x, z) ? 'none' : roads.classify(x, z)) };
    const cell = cellIdString(key);
    for (const b of batches.value) {
      if (SKIP.has(b.typeId)) continue;
      for (let k = 0; k < b.transforms.length; k += 5)
        checkOne(
          r,
          t,
          cell,
          b.typeId,
          (b.transforms[k] as number) + ix * CELL,
          (b.transforms[k + 2] as number) + iz * CELL,
        );
    }
    if (roadCache.size > 48) roadCache.clear();
    if (bldCache.size > 48) bldCache.clear();
  }
  return r;
}
