// 카셰어·공유자전거 거점(M08-T02·T03): car_sharing 점(건물 안이면 가까운 열린 땅), 없으면 노면 주차장 면 중심, bicycle_rental 점(차도면 비차도로),
// yaw = 차도 쪽(전방 −Z 규약), 셀 소유·상한·간격, 지하·사유 주차장 제외.
import { describe, expect, it } from 'vitest';
import { footClear, shareSpots, yawTowardRoad } from '../src/stages/derive/share-spots.ts';
import type { OsmRecord } from '../src/stages/normalize-osm.ts';

/** 셀 원점 (0, 0): x < 10 = 차도, 10–14 = 보도, 그 밖 = 열린 땅. 건물 = 50 ≤ x < 70, 50 ≤ z < 70. */
const ctx = {
  ox: 0,
  oz: 0,
  classify: (x: number) => (x < 10 ? 'road' : x < 14 ? 'walk' : 'none') as 'road' | 'walk' | 'none',
  inBuilding: (x: number, z: number) => x >= 50 && x < 70 && z >= 50 && z < 70,
  surfaceAt: () => 31.5,
};
const point = (id: string, x: number, z: number, tags: Record<string, string>): OsmRecord =>
  ({ layer: 'osm', id, geom: 'point', rings: [[x, z]], tags, source: 'osm-kanto' }) as OsmRecord;
const square = (id: string, x0: number, z0: number, s: number, tags: Record<string, string>): OsmRecord =>
  ({
    layer: 'osm',
    id,
    geom: 'polygon',
    rings: [[x0, z0, x0 + s, z0, x0 + s, z0 + s, x0, z0 + s]],
    tags,
    source: 'osm-kanto',
  }) as OsmRecord;

describe('share spots (M08)', () => {
  it('car_sharing inside a building moves to open ground, faces the road (west = yaw +90°)', () => {
    const [s] = shareSpots(ctx, [point('n1', 60, 60, { amenity: 'car_sharing' })]);
    expect(s?.kind).toBe('carShare');
    expect(ctx.inBuilding(s?.posLocal[0] ?? 0, s?.posLocal[2] ?? 0)).toBe(false);
    expect(s?.posLocal[1]).toBe(31.5);
    expect(yawTowardRoad(ctx, [20, 20])).toBeCloseTo(Math.PI / 2, 6);
  });

  it('falls back to a public surface parking lot centroid; skips underground / private lots', () => {
    const lots = [
      square('a1', 100, 100, 20, { amenity: 'parking' }),
      square('a2', 150, 150, 20, { amenity: 'parking', parking: 'underground' }),
      square('a3', 200, 30, 20, { amenity: 'parking', access: 'private' }),
    ];
    const out = shareSpots(ctx, [...lots, square('a0', 100, 180, 20, { amenity: 'parking' })]);
    // 셀당 노면 주차장 1개(id 순).
    expect(out.map((s) => s.id)).toEqual(['share-a0']);
    expect(shareSpots(ctx, lots).map((s) => s.id)).toEqual(['share-a1']);
    expect(shareSpots(ctx, lots)[0]?.posLocal[0]).toBeCloseTo(110, 5);
  });

  it('lot centroid against a building: the whole car footprint (+ driver side) ends up clear', () => {
    // 면 44–76 — 중심(60, 60)이 건물(50–70) 안.
    const [s] = shareSpots(ctx, [square('a9', 44, 44, 32, { amenity: 'parking' })]);
    expect(s).toBeDefined();
    const p: [number, number] = [s?.posLocal[0] ?? 0, s?.posLocal[2] ?? 0];
    const open = (x: number, z: number) => ctx.classify(x) === 'none' && !ctx.inBuilding(x, z);
    expect(footClear(p, s?.yaw ?? 0, { halfLen: 2.6, halfWid: 1.0, side: 1.4 }, open)).toBe(true);
    // 너무 좁은 면(전부 건물 안)은 버린다.
    expect(shareSpots(ctx, [square('a8', 52, 52, 16, { amenity: 'parking' })])).toEqual([]);
  });

  it('bicycle_rental on the road moves off it; cap, spacing and cell ownership', () => {
    const bikes = [
      point('b1', 5, 30, { amenity: 'bicycle_rental' }),
      point('b2', 30, 32, { amenity: 'bicycle_rental' }),
    ];
    const out = shareSpots(ctx, [...bikes, point('b3', 300, 30, { amenity: 'bicycle_rental' })]);
    expect(out.map((s) => s.id)).toEqual(['bike-b1']);
    expect(ctx.classify(out[0]?.posLocal[0] ?? 0)).not.toBe('road');
    const many = Array.from({ length: 8 }, (_, i) => point(`c${i}`, 20 + i * 70, 20, { amenity: 'car_sharing' }));
    expect(shareSpots(ctx, many).filter((s) => s.kind === 'carShare').length).toBe(2);
  });
});
