// 차 부르기 연석 자리(M08-T01): 연석 쪽 차선(laneIdx 0)만, 교차로(차선 끝) 9 m 안 제외, 진행 방향 왼쪽으로 비킴, 방향 = 진행 방향, 반경 밖 = 없음.
import { packCellKey } from '@sanpo/core';
import { LANE_KIND, type LaneGraphChunk } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { curbSpotInChunk, findCurbSpot } from '../src/vehicles/curb-spot.ts';

/** 북쪽(−Z)으로 가는 3.5 m 차선 두 개(x = 100 연석·103.5 바깥), z 200 → 100. */
function chunk(): LaneGraphChunk {
  const pts = new Float32Array([100, 2, 200, 100, 2, 100, 103.5, 2, 200, 103.5, 2, 100]);
  return {
    nodes: { key: new Uint32Array(0), posLocal: new Float32Array(0) },
    lanes: {
      id: new Uint32Array([1, 2]),
      fromNode: new Uint32Array(2),
      toNode: new Uint32Array(2),
      kind: new Uint8Array([LANE_KIND.road, LANE_KIND.road]),
      turn: new Uint8Array(2),
      speedKmh: new Uint8Array([40, 40]),
      laneIdx: new Uint8Array([0, 1]),
      signal: new Uint32Array(2),
      ptOffset: new Uint32Array([0, 2]),
      ptCount: new Uint16Array([2, 2]),
      widthCm: new Uint16Array([350, 350]),
    },
    pointsLocal: pts,
  };
}

describe('curb spot (M08-T01 summon)', () => {
  it('kerb lane only, shifted to the left of travel, facing travel direction', () => {
    const s = curbSpotInChunk(chunk(), 0, 0, { x: 110, y: 2, z: 150 });
    expect(s).toBeDefined();
    // 북쪽 진행의 왼쪽 = −X: 중심 100 − (1.75 − 1.13) = 99.38.
    expect(s?.posWF.x).toBeCloseTo(99.38, 2);
    expect(s?.posWF.z).toBeCloseTo(150, 5);
    expect(s?.yawRad).toBeCloseTo(0, 5);
    expect(s?.posWF.y).toBeCloseTo(2, 5);
  });

  it('keeps 9 m away from the lane ends (intersections)', () => {
    const s = curbSpotInChunk(chunk(), 0, 0, { x: 100, y: 2, z: 99 });
    expect(s?.posWF.z).toBeCloseTo(109, 5);
  });

  it('findCurbSpot searches the 3×3 cells around and respects the radius', async () => {
    const g = chunk();
    const load = (key: number) => Promise.resolve(key === packCellKey(0, 1, 0) ? g : null);
    const near = await findCurbSpot(load, { x: 256 + 120, y: 2, z: 150 });
    expect(near?.posWF.x).toBeCloseTo(256 + 99.38, 2);
    expect(await findCurbSpot(load, { x: 256 + 200, y: 2, z: 150 })).toBeUndefined();
  });
});
