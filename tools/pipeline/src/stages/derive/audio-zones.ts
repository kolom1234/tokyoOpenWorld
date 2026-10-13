// 셀 audio.json(M09-T04 — ADR-0079, 05 §4·11 §2): 32 m 격자 칸마다 앰비언스 존 종류를 규칙으로 정하고(가상 — 실측 소리 지도 아님) 같은 행의 연속 칸을 직사각형으로 합친다.
// 우선순위: station(승강장·역 60 m) > crossing(보행 신호 기둥 40 m 안 4개+) > park(OSM 공원·녹지 면 / 나무 10그루+) > shopping(간판 3+ / 상점 1층 건물 2+)
// > elevated(고가 선로 표본) > alley(주택·맨션 3동+·평균 15 m 미만) > street(기본 — 존을 쓰지 않음).
// 발음체: 보행 신호 기둥이 4개 이상인 교차로(신호 코드 >> 4)의 기둥마다 signalTone(음향식 신호기 — 큰 교차로만, 셀당 ≤ 96).
import {
  AUDIO_EMITTER,
  type AudioEmitter,
  type AudioZone,
  type AudioZoneKind,
  type AudioZones,
  PROP_TYPE,
  type PropBatch,
  RAIL_FLAG,
  type RailNetwork,
  type Vec3Tuple,
} from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { FACADE_CLASS, FACADE_FLAG, facadeParams } from '../build/facade-params.ts';
import type { OsmRecord } from '../normalize-osm.ts';

export const ZONE_TILE_M = 32;
const CELL_M = 256;
const N = CELL_M / ZONE_TILE_M;
const STATION_R = 60;
const CROSSING_R = 40;
const CROSSING_POLES = 4;
const PARK_TREES = 10;
const SHOP_SIGNS = 3;
const SHOP_BUILDINGS = 2;
const ALLEY_HOMES = 3;
const MAX_EMITTERS = 96;
const STOREY_M = 3.5;
const PARK_TAGS: Readonly<Record<string, readonly string[]>> = {
  leisure: ['park', 'garden', 'playground'],
  landuse: ['grass', 'forest', 'park', 'recreation_ground'],
  natural: ['wood', 'scrub'],
};

export interface AudioZoneInput {
  originWF: Vec3Tuple;
  buildings: readonly BuildingRecord[];
  batches: readonly PropBatch[];
  /** 나무 위치(셀 로컬 xz). */
  trees: readonly (readonly [number, number])[];
  osm: readonly OsmRecord[];
  rail?: RailNetwork;
}

interface Tally {
  peds: number;
  signs: number;
  trees: number;
  shops: number;
  homes: number;
  homeH: number;
  park: boolean;
  station: boolean;
  elevated: boolean;
}

const tileOf = (x: number, z: number): number => {
  const ix = Math.floor(x / ZONE_TILE_M);
  const iz = Math.floor(z / ZONE_TILE_M);
  return ix < 0 || iz < 0 || ix >= N || iz >= N ? -1 : iz * N + ix;
};
const centerOf = (t: number): [number, number] => [
  ((t % N) + 0.5) * ZONE_TILE_M,
  (Math.floor(t / N) + 0.5) * ZONE_TILE_M,
];

function inRing(r: readonly number[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i] as number;
    const zi = r[i + 1] as number;
    const xj = r[j] as number;
    const zj = r[j + 1] as number;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** 소품(보행 신호·간판) 집계 — 신호는 칸 중심 40 m 안 개수. */
function tallyProps(i: AudioZoneInput, t: Tally[]): void {
  for (const b of i.batches) {
    const tr = b.transforms;
    if (b.typeId === PROP_TYPE.signProjecting || b.typeId === PROP_TYPE.signStanding)
      for (let k = 0; k < tr.length; k += 5) {
        const id = tileOf(tr[k] as number, tr[k + 2] as number);
        if (id >= 0) (t[id] as Tally).signs++;
      }
    if (b.typeId !== PROP_TYPE.signalPedestrian) continue;
    for (let k = 0; k < tr.length; k += 5)
      for (let id = 0; id < N * N; id++) {
        const [cx, cz] = centerOf(id);
        if (((tr[k] as number) - cx) ** 2 + ((tr[k + 2] as number) - cz) ** 2 <= CROSSING_R ** 2)
          (t[id] as Tally).peds++;
      }
  }
}

function tallyBuildings(i: AudioZoneInput, t: Tally[]): void {
  const [ox, , oz] = i.originWF;
  for (const b of i.buildings) {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (const s of b.surfaces) {
      const r = s.ringsWF[0];
      if (!r || r.length < 3) continue;
      sx += r[0] as number;
      sz += r[2] as number;
      n++;
    }
    if (n === 0) continue;
    const id = tileOf(sx / n - ox, sz / n - oz);
    if (id < 0) continue;
    const h = b.measuredHeightM ?? 10;
    const fp = facadeParams({
      id: b.gmlId,
      usage: b.usage,
      heightM: h,
      floors: b.storeys ?? Math.max(1, Math.round(h / STOREY_M)),
    });
    const tl = t[id] as Tally;
    if (((fp[3] ?? 0) & FACADE_FLAG.retail) !== 0) tl.shops++;
    if (fp[0] === FACADE_CLASS.mansion || fp[0] === FACADE_CLASS.house) {
      tl.homes++;
      tl.homeH += h;
    }
  }
}

/** 셀(+ 여유) 안 고가 선로 표본(셀 로컬 xz) — 칸마다 전체 표본을 훑지 않게 먼저 거른다. */
function elevatedPoints(rail: RailNetwork, ox: number, oz: number): [number, number][] {
  const out: [number, number][] = [];
  const m = ZONE_TILE_M;
  for (let k = 0; k < rail.flags.length; k++) {
    const f = rail.flags[k] as number;
    if ((f & RAIL_FLAG.bridge) === 0 || (f & RAIL_FLAG.tunnel) !== 0) continue;
    const x = (rail.points[k * 3] as number) - ox;
    const z = (rail.points[k * 3 + 2] as number) - oz;
    if (x >= -m && z >= -m && x <= CELL_M + m && z <= CELL_M + m) out.push([x, z]);
  }
  return out;
}

/** OSM 공원·녹지 면, 역·승강장, 고가 선로. */
function tallyAreas(i: AudioZoneInput, t: Tally[]): void {
  const [ox, , oz] = i.originWF;
  const parks = i.osm.filter(
    (r) => r.geom === 'polygon' && Object.entries(PARK_TAGS).some(([k, v]) => v.includes(r.tags[k] ?? '')),
  );
  const rail = i.rail;
  const elev = rail ? elevatedPoints(rail, ox, oz) : [];
  const r2 = (ZONE_TILE_M * 0.6) ** 2;
  for (let id = 0; id < N * N; id++) {
    const [cx, cz] = centerOf(id);
    const wx = cx + ox;
    const wz = cz + oz;
    const tl = t[id] as Tally;
    tl.park = parks.some((p) => p.rings[0] !== undefined && inRing(p.rings[0], wx, wz));
    tl.elevated = elev.some(([x, z]) => (x - cx) ** 2 + (z - cz) ** 2 <= r2);
    if (!rail) continue;
    tl.station =
      rail.stations.some((s) => (s.posWF[0] - wx) ** 2 + (s.posWF[2] - wz) ** 2 <= STATION_R ** 2) ||
      rail.platforms.some(
        (p) =>
          p.ringXZ.length >= 2 &&
          ((p.ringXZ[0] as number) - wx) ** 2 + ((p.ringXZ[1] as number) - wz) ** 2 <= (STATION_R * 0.8) ** 2,
      );
  }
}

function kindOf(t: Tally): AudioZoneKind {
  if (t.station) return 'station';
  if (t.peds >= CROSSING_POLES) return 'crossing';
  if (t.park || t.trees >= PARK_TREES) return 'park';
  if (t.signs >= SHOP_SIGNS || t.shops >= SHOP_BUILDINGS) return 'shopping';
  if (t.elevated) return 'elevated';
  if (t.homes >= ALLEY_HOMES && t.homeH / t.homes < 15) return 'alley';
  return 'street';
}

/** 같은 행 연속 칸(street 제외) → 직사각형. */
function mergeRows(kinds: readonly AudioZoneKind[]): AudioZone[] {
  const out: AudioZone[] = [];
  for (let iz = 0; iz < N; iz++) {
    let ix = 0;
    while (ix < N) {
      const k = kinds[iz * N + ix] as AudioZoneKind;
      let end = ix + 1;
      while (end < N && kinds[iz * N + end] === k) end++;
      if (k !== 'street') {
        const [x0, x1, z0, z1] = [ix * ZONE_TILE_M, end * ZONE_TILE_M, iz * ZONE_TILE_M, (iz + 1) * ZONE_TILE_M];
        out.push({
          kind: k,
          polygonLocal: [
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
          ],
          y0: -100,
          y1: 1000,
        });
      }
      ix = end;
    }
  }
  return out;
}

/** 음향식 신호: 보행 신호 기둥 4개+ 교차로(code >> 4)의 기둥마다. */
function signalEmitters(batches: readonly PropBatch[]): AudioEmitter[] {
  const byX = new Map<number, AudioEmitter[]>();
  for (const b of batches) {
    if (b.typeId !== PROP_TYPE.signalPedestrian) continue;
    const tr = b.transforms;
    for (let k = 0; k < tr.length; k += 5) {
      const code = Math.round(tr[k + 4] as number);
      if (!(code > 0)) continue;
      const list = byX.get(code >> 4) ?? [];
      list.push({
        kind: AUDIO_EMITTER.signalTone,
        pos: [tr[k] as number, (tr[k + 1] as number) + 2.6, tr[k + 2] as number],
        code,
      });
      byX.set(code >> 4, list);
    }
  }
  return [...byX.values()]
    .filter((l) => l.length >= CROSSING_POLES)
    .flat()
    .slice(0, MAX_EMITTERS);
}

export function deriveAudioZones(i: AudioZoneInput): AudioZones {
  const t: Tally[] = Array.from({ length: N * N }, () => ({
    peds: 0,
    signs: 0,
    trees: 0,
    shops: 0,
    homes: 0,
    homeH: 0,
    park: false,
    station: false,
    elevated: false,
  }));
  tallyProps(i, t);
  for (const [x, z] of i.trees) {
    const id = tileOf(x, z);
    if (id >= 0) (t[id] as Tally).trees++;
  }
  tallyBuildings(i, t);
  tallyAreas(i, t);
  return { zones: mergeRows(t.map(kindOf)), emitters: signalEmitters(i.batches) };
}
