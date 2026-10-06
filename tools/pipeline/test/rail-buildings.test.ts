// M07-T04 선로 위 건물: 바닥 다각형이 선로 표본 ≥ 3개(6 m)를 덮으면 충돌 제외, 낮은 운수·불명 용도(≤ 12 m) = 승강장 지붕 → 렌더 제외. 옆 건물은 그대로.
import type { RailNetwork } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { BuildingRecord } from '../src/readers/plateau/types.ts';
import { trackBuildings } from '../src/stages/build/rail-buildings.ts';

const n = 801;
const points = new Float32Array(n * 3);
for (let k = 0; k < n; k++) points.set([0, 10, -k * 0.5], k * 3);
const net = {
  lines: [],
  tracks: [{ id: 't', line: 'l', heading: 'n', ptOffset: 0, ptCount: n, lengthM: 400, stepM: 0.5, stops: [] }],
  stations: [],
  platforms: [],
  points,
  speed: new Float32Array(n),
  flags: new Uint8Array(n),
} as unknown as RailNetwork;

const bldg = (
  id: string,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  usage: string,
  h: number,
): BuildingRecord => ({
  layer: 'buildings',
  gmlId: id,
  buildingId: null,
  lod: 2,
  measuredHeightM: h,
  storeys: null,
  storeysBelow: null,
  usage,
  surfaces: [{ kind: 'ground', ringsWF: [[x0, 10, z0, x1, 10, z0, x1, 10, z1, x0, 10, z1, x0, 10, z0]] }],
  source: 's',
});

describe('track buildings', () => {
  it('drops colliders over the track and hides low station canopies', () => {
    const r = trackBuildings(
      [
        bldg('canopy', -5, 5, -150, -50, '431', 6),
        bldg('station', -10, 10, -300, -200, '431', 20),
        bldg('beside', 3, 20, -150, -50, '401', 30),
        bldg('corner', -2, 2, -1, 0, '431', 6),
      ],
      net,
    );
    expect([...r.colliderSkip].sort()).toEqual(['canopy', 'station']);
    expect([...r.renderSkip]).toEqual(['canopy']);
    expect(trackBuildings([bldg('canopy', -5, 5, -150, -50, '431', 6)], undefined).colliderSkip.size).toBe(0);
  });
});
