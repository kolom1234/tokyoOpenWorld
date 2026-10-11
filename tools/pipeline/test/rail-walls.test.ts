// ⓪ M09 사전(ADR-0075): 역 건물 선로 구간 벽 잘라내기 — 선로를 가로지르는 벽은 레일 띠만 뚫리고, 옆 벽·높은 지붕·승강장 위 차양 지붕은 그대로.
import { RAIL_FLAG, type RailNetwork } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { BuildingRecord, SurfaceRecord } from '../src/readers/plateau/types.ts';
import {
  BAND_ABOVE_M,
  BAND_BELOW_M,
  CORRIDOR_HALF_M,
  cutRailWalls,
  railCorridor,
  subtractRect,
} from '../src/stages/build/rail-walls.ts';

const RAIL_Y = 10;
/** x = 0을 따라 북쪽(−z)으로 400 m 직선 선로(0.5 m 표본), 마지막 100 m는 터널. */
function net(platform = false): RailNetwork {
  const n = 801;
  const points = new Float32Array(n * 3);
  const flags = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    points.set([0, RAIL_Y, -k * 0.5], k * 3);
    if (k >= 600) flags[k] = RAIL_FLAG.tunnel;
  }
  return {
    lines: [],
    tracks: [{ id: 't', line: 'l', heading: 'n', ptOffset: 0, ptCount: n, lengthM: 400, stepM: 0.5, stops: [] }],
    stations: [],
    platforms: platform ? [{ id: 'p', ringXZ: [3, -100, 9, -100, 9, -150, 3, -150], topY: RAIL_Y + 1.1 }] : [],
    points,
    speed: new Float32Array(n),
    flags,
  } as unknown as RailNetwork;
}

const quad = (kind: SurfaceRecord['kind'], ring: number[]): SurfaceRecord => ({ kind, ringsWF: [ring] });
/** x0..x1 · z0..z1 상자(바닥 y0, 높이 h) — 벽 4개(바깥 법선) + 지붕. */
function box(id: string, x0: number, x1: number, z0: number, z1: number, y0: number, h: number): BuildingRecord {
  const y1 = y0 + h;
  return {
    layer: 'buildings',
    gmlId: id,
    buildingId: null,
    lod: 2,
    measuredHeightM: h,
    storeys: null,
    storeysBelow: null,
    usage: '431',
    surfaces: [
      quad('ground', [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1]),
      quad('wall', [x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]), // 남쪽(+z)
      quad('wall', [x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0]), // 북쪽(−z)
      quad('wall', [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1]), // 동쪽
      quad('wall', [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0]), // 서쪽
      quad('roof', [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0]),
    ],
    source: 's',
  };
}

function wallArea(b: BuildingRecord): number {
  let a = 0;
  for (const s of b.surfaces) {
    if (s.kind !== 'wall') continue;
    const r = s.ringsWF[0] as number[];
    const m = r.length / 3;
    const v = (i: number, k: number) => r[(i % m) * 3 + k] as number;
    let [nx, ny, nz] = [0, 0, 0];
    for (let i = 0; i < m; i++) {
      nx += v(i, 1) * v(i + 1, 2) - v(i, 2) * v(i + 1, 1);
      ny += v(i, 2) * v(i + 1, 0) - v(i, 0) * v(i + 1, 2);
      nz += v(i, 0) * v(i + 1, 1) - v(i, 1) * v(i + 1, 0);
    }
    a += Math.hypot(nx, ny, nz) / 2;
  }
  return a;
}

describe('rail wall cut', () => {
  it('subtractRect keeps the area outside the rectangle', () => {
    const sq: [number, number][] = [
      [-10, 0],
      [10, 0],
      [10, 20],
      [-10, 20],
    ];
    const parts = subtractRect(sq, -2, 2, -1, 8);
    const area = (p: [number, number][]) =>
      Math.abs(
        p.reduce((s, a, i) => {
          const q = p[(i + 1) % p.length] as [number, number];
          return s + a[0] * q[1] - q[0] * a[1];
        }, 0),
      ) / 2;
    expect(parts.reduce((s, p) => s + area(p), 0)).toBeCloseTo(400 - 4 * 8, 6);
  });

  it('opens a portal in walls crossing the track and keeps side walls and the roof', () => {
    const cor = railCorridor(net());
    const b = box('st', -15, 15, -80, -40, RAIL_Y, 20);
    const out = cutRailWalls(b, cor);
    // 남·북 벽(선로 가로지름)에 폭 2 × (반폭 + 여유) × 띠(레일 −1.5 ~ +6.5, 땅 = 레일 높이라 0 ~ 6.5) 구멍.
    const hole = 2 * (CORRIDOR_HALF_M + 0.25) * BAND_ABOVE_M;
    expect(wallArea(b) - wallArea(out)).toBeGreaterThan(2 * hole * 0.97);
    expect(wallArea(b) - wallArea(out)).toBeLessThan(2 * hole * 1.12);
    expect(out.surfaces.filter((s) => s.kind === 'roof')).toHaveLength(1);
    // 동·서 벽(선로에서 15 m)은 그대로.
    const allX = (s: SurfaceRecord, x: number) => (s.ringsWF[0] as number[]).every((v, i) => i % 3 !== 0 || v === x);
    expect(out.surfaces.filter((s) => s.kind === 'wall' && allX(s, 15))).toHaveLength(1);
    expect(out.surfaces.filter((s) => s.kind === 'wall' && allX(s, -15))).toHaveLength(1);
    // 레일 아래 1.5 m까지 뚫린다(낮은 땅).
    const low = box('low', -15, 15, -80, -40, RAIL_Y - 4, 24);
    const lowHole = wallArea(low) - wallArea(cutRailWalls(low, cor));
    expect(lowHole).toBeGreaterThan(2 * 2 * (CORRIDOR_HALF_M + 0.25) * (BAND_ABOVE_M + BAND_BELOW_M) * 0.97);
  });

  it('drops roofs inside the train envelope only, keeps platform canopies, ignores tunnels and far buildings', () => {
    const cor = railCorridor(net(true));
    const shed = box('shed', -4, 12, -140, -110, RAIL_Y, 4); // 지붕 = 레일 + 4 m(차량 외형 안)
    const shedOut = cutRailWalls(shed, cor);
    expect(shedOut.surfaces.some((s) => s.kind === 'roof')).toBe(false);
    const canopy = box('canopy', 4, 8, -140, -110, RAIL_Y, 4.5); // 승강장 위 차양(선로 회랑 밖)
    const canopyOut = cutRailWalls(canopy, cor);
    expect(canopyOut.surfaces.filter((s) => s.kind === 'roof')).toHaveLength(1);
    expect(wallArea(canopyOut)).toBeLessThan(wallArea(canopy) * 0.05); // 승강장 띠 벽은 모두 잘림 → 떠 있는 지붕
    const tunnel = box('tunnel', -15, 15, -380, -340, RAIL_Y, 20);
    expect(cutRailWalls(tunnel, cor)).toBe(tunnel);
    const far = box('far', 20, 40, -80, -40, RAIL_Y, 20);
    expect(cutRailWalls(far, cor)).toBe(far);
  });
});
