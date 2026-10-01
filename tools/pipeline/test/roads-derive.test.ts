// M05-T01 도로 파생: 격자 도구, 지형 성형(차도 횡단경사·보도 띠·비도로 섞기·건물 평탄화·허용 오차), 연석 판정, 보도 윗면, 가장자리 새기기, 간극 검사 도구.
import { describe, expect, it } from 'vitest';
import type { RoadRecord } from '../src/readers/plateau/types.ts';
import { addEdges, CURB_SINK_M, classifyEdges, SKIRT_M } from '../src/stages/derive/curbs.ts';
import { burnOuterEdges, outerEdgesAround } from '../src/stages/derive/edge-burn.ts';
import { bilinear, discOffsets, type LocalGrid, maskedBoxMean, nearestIn } from '../src/stages/derive/grid.ts';
import { ROAD_CLASS, roadIndex, roadRaster } from '../src/stages/derive/roads.ts';
import { addWalkTop, emptyMesh, TOP_OFFSET_M, topWriter } from '../src/stages/derive/sidewalks.ts';
import { CROSSFALL, CURB_M, shapeGround, TOL_DEFAULT_M, TOL_TIGHT_M } from '../src/stages/derive/terrain-shape.ts';
import { pickIntersections, verticalEdges } from '../src/stages/validate-roads.ts';

const rect = (id: string, fn: RoadRecord['function'], x0: number, z0: number, x1: number, z1: number): RoadRecord => ({
  layer: 'roads',
  id,
  roadId: 'r',
  lod: 3,
  function: fn,
  functionCode: fn === 'sidewalk' ? 'TrafficArea:2000' : 'TrafficArea:1000',
  // CCW(위에서) 외곽 링, y = 0.
  polygonWF: [[x0, 0, z0, x0, 0, z1, x1, 0, z1, x1, 0, z0]],
  source: 'plateau-shibuya',
});

/** 60×60 창(로컬 −10…49): 차도 x 0–20, 동쪽 보도 x 20–26, 그 밖 비도로. DEM = 10 m 평지. */
function scene() {
  const grid: LocalGrid = { x0: -10, z0: -10, n: 60 };
  const roads = [rect('c', 'carriageway', 0, -10, 20, 50), rect('s', 'sidewalk', 20, -10, 26, 50)];
  const cls = roadRaster(roads, 0, 0, grid);
  const dem = new Float32Array(grid.n * grid.n).fill(10);
  const flat = new Float32Array(grid.n * grid.n).fill(Number.NaN);
  return { grid, roads, cls, dem, flat };
}

const at = (g: LocalGrid, a: Float32Array, x: number, z: number): number => a[(z - g.z0) * g.n + (x - g.x0)] as number;

describe('derive grid', () => {
  it('orders disc offsets by distance then (dz, dx) and finds the nearest mask sample', () => {
    const o = discOffsets(1.5);
    expect(Array.from(o.d)).toEqual([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2].map(Math.fround));
    expect([o.dj[0], o.di[0]]).toEqual([-1, 0]);
    const mask = new Uint8Array(25);
    mask[2 * 5 + 4] = 1;
    expect(nearestIn(5, 2, 2, mask, discOffsets(3))).toBe(14);
    expect(nearestIn(5, 0, 0, mask, discOffsets(1))).toBe(-1);
  });

  it('averages only masked samples and interpolates bilinearly', () => {
    const v = Float32Array.from([0, 10, 20, 30]);
    const m = Uint8Array.from([1, 1, 0, 1]);
    expect(Array.from(maskedBoxMean(v, m, 2, 1))).toEqual([
      Math.fround(40 / 3),
      Math.fround(40 / 3),
      20,
      Math.fround(40 / 3),
    ]);
    expect(bilinear({ x0: 0, z0: 0, n: 2 }, v, 0.5, 0.5)).toBeCloseTo(15, 9);
  });
});

describe('terrain shaping', () => {
  it('crowns the carriageway at 2 %, raises the sidewalk outer band by 0.15 m and blends off-road ground', () => {
    const { grid, cls, dem, flat } = scene();
    const s = shapeGround(grid, dem, cls, flat);
    expect(at(grid, Float32Array.from(cls), 10, 20)).toBe(ROAD_CLASS.road);
    // 차도 가장자리(보도 옆 x = 19: 비차도까지 1 m) = 2 cm, 중앙(x = 10: 10 m → 상한 0.15).
    expect(at(grid, s.ground, 19, 20)).toBeCloseTo(10 + CROSSFALL, 5);
    expect(at(grid, s.ground, 10, 20)).toBeCloseTo(10.15, 5);
    // 보도 샘플 x = 20–26: 바깥 띠(x = 26 — 비도로 x = 27에서 1.5 m 안) = D + 0.15, 나머지(연석 쪽·안쪽) = D(보도 메시가 덮음).
    expect(at(grid, s.ground, 21, 20)).toBeCloseTo(10, 5);
    expect(at(grid, s.ground, 24, 20)).toBeCloseTo(10, 5);
    expect(at(grid, s.ground, 26, 20)).toBeCloseTo(10 + CURB_M, 5);
    // 비도로: 보도에서 1.5 m 안 = 보도 윗면, 4 m 밖 = DEM.
    expect(at(grid, s.ground, 27, 20)).toBeCloseTo(10 + CURB_M, 5);
    expect(at(grid, s.ground, 31, 20)).toBeCloseTo(10, 5);
    expect(at(grid, s.top, 28, 20)).toBeCloseTo(10 + CURB_M, 5);
    expect(at(grid, s.tol, 25, 20)).toBe(Math.fround(TOL_TIGHT_M)); // 바깥 띠 둘레
    expect(at(grid, s.tol, 21, 20)).toBe(Math.fround(TOL_DEFAULT_M)); // 보도 안쪽(메시가 덮음)
    expect(at(grid, s.tol, 40, 20)).toBe(Math.fround(TOL_DEFAULT_M));
  });

  it('flattens building footprints only deep inside and within 1 m of the shaped ground', () => {
    const { grid, cls, dem, flat } = scene();
    for (let z = 30; z < 40; z++) for (let x = 30; x < 45; x++) flat[(z - grid.z0) * grid.n + (x - grid.x0)] = 9.5;
    flat[(35 - grid.z0) * grid.n + (40 - grid.x0)] = 7; // 지하 모델링 지면: 3 m 아래 → 그대로
    const s = shapeGround(grid, dem, cls, flat);
    expect(at(grid, s.ground, 35, 35)).toBeCloseTo(9.5, 5);
    expect(at(grid, s.ground, 30, 35)).toBeCloseTo(10, 5); // 가장자리(1.5 m 안)
    expect(at(grid, s.ground, 40, 35)).toBeCloseTo(10, 5);
  });
});

describe('curbs, sidewalk tops and edge burn', () => {
  it('classifies sidewalk edges: carriageway side = curb, open sides = outer, sidewalk neighbour = internal', () => {
    const { roads } = scene();
    const withNeighbour = [...roads, rect('s2', 'sidewalk', 20, 50, 26, 60)];
    const stats = { curbM: 0, outerM: 0 };
    const edges = classifyEdges(roads[1] as RoadRecord, 0, 0, roadIndex(withNeighbour), stats);
    expect(stats.curbM).toBeCloseTo(60, 6); // x = 20 변
    expect(stats.outerM).toBeCloseTo(60 + 6, 6); // x = 26 변 + 남쪽 끝(z = −10), 북쪽 끝은 이웃 보도와 내부
    const curb = edges.find((e) => e.kind === 'curb');
    expect(curb?.out[0]).toBeCloseTo(-1, 9); // 차도(서쪽)를 향함
    const m = emptyMesh();
    addEdges(
      m,
      edges,
      () => 10.15,
      () => 10,
    );
    const ys = m.pos.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(10 - CURB_SINK_M, 6);
    expect(Math.max(...ys)).toBeCloseTo(10.15 + TOP_OFFSET_M, 6);
    expect(ys.some((y) => Math.abs(y - (10.15 + TOP_OFFSET_M - SKIRT_M)) < 1e-6)).toBe(true);
  });

  it('triangulates sidewalk tops upward on a 4 m clip grid at top height + offset', () => {
    const m = emptyMesh();
    const w = topWriter(m, (x) => 10 + 0.01 * x, 1);
    addWalkTop(m, w, rect('s', 'sidewalk', 20, -10, 26, 50), 0, 0);
    let area = 0;
    for (let t = 0; t < m.idx.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => (m.idx[t + k] as number) * 3) as [number, number, number];
      const p = (v: number, o: number): number => m.pos[v + o] as number;
      const cross = (p(b, 2) - p(a, 2)) * (p(c, 0) - p(a, 0)) - (p(b, 0) - p(a, 0)) * (p(c, 2) - p(a, 2));
      expect(cross).toBeGreaterThan(0); // 위에서 CCW
      area += cross / 2;
    }
    expect(area).toBeCloseTo(6 * 60, 6);
    for (let v = 0; v < m.pos.length / 3; v++)
      expect(m.pos[v * 3 + 1]).toBeCloseTo(10 + 0.01 * (m.pos[v * 3] as number) + TOP_OFFSET_M, 9);
  });

  it('burns ground just outside outer edges to the edge top height', () => {
    const { grid, roads, cls, dem, flat } = scene();
    const s = shapeGround(grid, dem, cls, flat);
    s.top.fill(11); // 가장자리 윗면을 구별되게
    const burned = burnOuterEdges(s, outerEdgesAround(roads, roadIndex(roads), 0, 0, s));
    expect(burned).toBeGreaterThan(0);
    expect(at(grid, s.ground, 27, 20)).toBeCloseTo(11, 5); // 바깥 1 m 안
    expect(at(grid, s.ground, 29, 20)).toBeLessThan(11); // 1 m 밖(섞기 그대로)
  });
});

describe('road gap check helpers', () => {
  it('picks the same shuffled intersections for the same seed, one per 25 m cluster', () => {
    const pts: [number, number][] = [
      [1, 1],
      [2, 2],
      [100, 1],
      [200, 50],
    ];
    const a = pickIntersections(pts, 7);
    expect(a).toEqual(pickIntersections(pts, 7));
    expect(a).toHaveLength(3);
  });

  it('finds skirt top edges on sloped quads without taking the diagonal', () => {
    // 경사 12 %(1 m 조각) 치마 사각형: 윗변 (0, 10.00)→(1, 10.12), 깊이 0.12 → 대각선 한쪽 끝 높이가 반대쪽 윗점과 같다.
    const pos = [0, 10, 0, 1, 10.12, 0, 1, 10.0, 0, 0, 9.88, 0];
    const mesh = { pos, idx: [0, 1, 2, 0, 2, 3], surf: [1, 1, 1, 1] };
    const tops = verticalEdges(mesh, 1, 'top');
    expect(tops).toHaveLength(1);
    expect([tops[0]?.a[1], tops[0]?.b[1]].sort()).toEqual([10, 10.12]);
  });
});
