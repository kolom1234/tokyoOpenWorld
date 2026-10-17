// 카셰어·공유자전거 거점(M08-T02·T03 — cell meta `interactables`): 위치만 OSM에서(브랜드는 게임의 가상 이름 — 실제 운영사·로고 없음).
// 카셰어 = amenity=car_sharing 점(셀 소유) → 건물 안이면 가까운 열린 땅(차도·보도·건물 아님 — 주차장·광장)으로, 없으면 그대로(런타임이 연석으로 옮김);
//          점이 셀에 없으면 amenity=parking 노면 주차장 면(공용·150–20,000 m²)의 중심(면 안·건물 아님).
// 공유자전거 = amenity=bicycle_rental 점(보도·광장 위면 그대로, 차도면 가까운 비차도로). yaw = 가장 가까운 차도 쪽을 바라봄(게임 규약: 전방 = (−sin, −cos)).
// 셀당 상한·서로 띄우기(결정론 — OSM id 순). see docs/roadmap/M08.md M08-T02·T03
import type { InteractableRecord } from '@sanpo/tile-format';
import type { OsmRecord } from '../normalize-osm.ts';
import type { RoadSide } from './roads.ts';

type V2 = [number, number];

export interface ShareSpotCtx {
  /** 셀 원점 WF. 출력 posLocal = 셀 로컬. */
  ox: number;
  oz: number;
  /** WF 점 도로 분류(보행 우선). */
  classify(x: number, z: number): RoadSide;
  /** 건물 발자국 안(WF). */
  inBuilding(x: number, z: number): boolean;
  /** 표면 높이(셀 로컬, 없으면 undefined). */
  surfaceAt(x: number, z: number): number | undefined;
}

/** 셀당 상한·같은 종류 사이 최소 거리(m). */
const MAX_CAR = 2;
const MAX_BIKE = 3;
const MIN_GAP_M = 60;
/** 열린 땅 찾기 반경(m)·주차장 면 면적 범위(m²). */
const OPEN_SEARCH_M = 25;
const LOT_MIN_M2 = 150;
const LOT_MAX_M2 = 20_000;

const owns = (c: ShareSpotCtx, p: V2): boolean =>
  p[0] >= c.ox && p[0] < c.ox + 256 && p[1] >= c.oz && p[1] < c.oz + 256;

/** 차도 쪽 방향(16방위 × 0.5 m 걸음, 20 m 안) → 게임 yaw(전방 −Z 규약). 없으면 0. */
export function yawTowardRoad(c: ShareSpotCtx, p: V2): number {
  for (let d = 0.5; d <= 20; d += 0.5)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      if (c.classify(p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d) === 'road')
        return Math.atan2(-Math.cos(a), -Math.sin(a));
    }
  return 0;
}

/** 조건을 만족하는 가장 가까운 점(링 1 m 걸음, 16방위). */
function nearest(c: ShareSpotCtx, p: V2, ok: (x: number, z: number) => boolean, maxM: number): V2 | undefined {
  if (ok(p[0], p[1])) return p;
  for (let d = 1; d <= maxM; d++)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
      if (ok(q[0], q[1])) return q;
    }
  return undefined;
}

function inRing(ring: readonly number[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const [xi, zi, xj, zj] = [ring[i] as number, ring[i + 1] as number, ring[j] as number, ring[j + 1] as number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function ringCentroidArea(ring: readonly number[]): { c: V2; area: number } {
  let a = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const f = (ring[j] as number) * (ring[i + 1] as number) - (ring[i] as number) * (ring[j + 1] as number);
    a += f;
    cx += ((ring[j] as number) + (ring[i] as number)) * f;
    cz += ((ring[j + 1] as number) + (ring[i + 1] as number)) * f;
  }
  return a === 0
    ? { c: [ring[0] ?? 0, ring[1] ?? 0], area: 0 }
    : { c: [cx / (3 * a), cz / (3 * a)], area: Math.abs(a / 2) };
}

const isLot = (t: Record<string, string>): boolean =>
  t.amenity === 'parking' &&
  !['underground', 'multi-storey', 'rooftop'].includes(t.parking ?? '') &&
  !['private', 'no'].includes(t.access ?? '');

/** 카셰어 후보(WF 점): car_sharing 점, 없으면 노면 주차장 면 중심. */
function carCandidates(c: ShareSpotCtx, osm: readonly OsmRecord[]): { id: string; p: V2 }[] {
  const open = (x: number, z: number) => c.classify(x, z) === 'none' && !c.inBuilding(x, z);
  const pts = osm
    .filter((r) => r.geom === 'point' && r.tags.amenity === 'car_sharing' && r.rings[0])
    .map((r) => ({ id: r.id, p: [r.rings[0]?.[0] ?? 0, r.rings[0]?.[1] ?? 0] as V2 }))
    .filter((s) => owns(c, s.p))
    .map((s) => ({ id: s.id, p: nearest(c, s.p, open, OPEN_SEARCH_M) ?? s.p }));
  if (pts.length > 0) return pts;
  return osm
    .filter((r) => r.geom === 'polygon' && isLot(r.tags) && r.rings[0])
    .map((r) => ({ id: r.id, ring: r.rings[0] as number[] }))
    .map(({ id, ring }) => ({ id, ring, ...ringCentroidArea(ring) }))
    .filter((l) => l.area >= LOT_MIN_M2 && l.area <= LOT_MAX_M2 && owns(c, l.c))
    .map((l) => ({ id: l.id, p: nearest(c, l.c, (x, z) => inRing(l.ring, x, z) && !c.inBuilding(x, z), 15) }))
    .filter((l): l is { id: string; p: V2 } => l.p !== undefined);
}

/** 공유자전거 후보: bicycle_rental 점(차도면 가까운 비차도로). */
function bikeCandidates(c: ShareSpotCtx, osm: readonly OsmRecord[]): { id: string; p: V2 }[] {
  const offRoad = (x: number, z: number) => c.classify(x, z) !== 'road' && !c.inBuilding(x, z);
  return osm
    .filter((r) => r.geom === 'point' && r.tags.amenity === 'bicycle_rental' && r.rings[0])
    .map((r) => ({ id: r.id, p: [r.rings[0]?.[0] ?? 0, r.rings[0]?.[1] ?? 0] as V2 }))
    .filter((s) => owns(c, s.p))
    .map((s) => ({ id: s.id, p: nearest(c, s.p, offRoad, 12) }))
    .filter((s): s is { id: string; p: V2 } => s.p !== undefined);
}

/** id 순으로 서로 MIN_GAP_M 띄워 max개. */
function spread(list: { id: string; p: V2 }[], max: number): { id: string; p: V2 }[] {
  const out: { id: string; p: V2 }[] = [];
  for (const s of [...list].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (out.length >= max) break;
    if (out.every((o) => Math.hypot(o.p[0] - s.p[0], o.p[1] - s.p[1]) >= MIN_GAP_M)) out.push(s);
  }
  return out;
}

export function shareSpots(c: ShareSpotCtx, osm: readonly OsmRecord[]): InteractableRecord[] {
  const rec = (kind: 'carShare' | 'bikeDock', prefix: string, radius: number) => (s: { id: string; p: V2 }) => {
    const lx = s.p[0] - c.ox;
    const lz = s.p[1] - c.oz;
    const y = c.surfaceAt(lx, lz) ?? 0;
    const r: InteractableRecord = {
      id: `${prefix}-${s.id}`,
      kind,
      posLocal: [Math.round(lx * 100) / 100, Math.round(y * 100) / 100, Math.round(lz * 100) / 100],
      yaw: Math.round(yawTowardRoad(c, s.p) * 1000) / 1000,
      radius,
    };
    return r;
  };
  return [
    ...spread(carCandidates(c, osm), MAX_CAR).map(rec('carShare', 'share', 4)),
    ...spread(bikeCandidates(c, osm), MAX_BIKE).map(rec('bikeDock', 'bike', 2.5)),
  ];
}
