// 셀 빌드 테스트용 합성 입력: 결정론적 DEM 창, 박스 건물 레코드. see docs/04-data-pipeline.md §4.4
import type { CellBoundsWF } from '@sanpo/geo';
import type { BuildingRecord, SurfaceRecord } from '../src/readers/plateau/types.ts';
import type { DemWindow } from '../src/stages/build/dem-window.ts';

/** 완만한 언덕 + 결정론적 잔물결(1 cm 단위). 경계 [min, max] 양끝 포함, ± margin. */
export function syntheticDem(b: CellBoundsWF, margin: number): DemWindow {
  const x0 = b.minX - margin;
  const z0 = b.minZ - margin;
  const width = b.maxX + margin - x0 + 1;
  const height = b.maxZ + margin - z0 + 1;
  const values = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const x = x0 + c;
      const z = z0 + r;
      const ripple = (((x * 73856093) ^ (z * 19349663)) >>> 0) % 7;
      values[r * width + c] = 35 + 6 * Math.sin(x / 41) + 4 * Math.cos(z / 29) + ripple * 0.01;
    }
  }
  return { x0, z0, width, height, values };
}

function ring(pts: [number, number, number][]): number[] {
  return pts.flat();
}

/** WF 박스 건물(바닥 y0, 높이 h). 면: 벽 4 + 지붕 + 바닥(ground, 메시 제외 대상). 외향 CCW. */
export function boxBuilding(gmlId: string, x: number, z: number, w: number, d: number, y0: number, h: number) {
  const [x1, z1, y1] = [x + w, z + d, y0 + h];
  const s = (kind: SurfaceRecord['kind'], pts: [number, number, number][]): SurfaceRecord => ({
    kind,
    ringsWF: [ring(pts)],
  });
  const surfaces: SurfaceRecord[] = [
    s('roof', [
      [x, y1, z],
      [x, y1, z1],
      [x1, y1, z1],
      [x1, y1, z],
    ]),
    s('ground', [
      [x, y0, z],
      [x1, y0, z],
      [x1, y0, z1],
      [x, y0, z1],
    ]),
    s('wall', [
      [x, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x, y1, z1],
    ]), // 남(+Z)
    s('wall', [
      [x1, y0, z],
      [x, y0, z],
      [x, y1, z],
      [x1, y1, z],
    ]), // 북(−Z)
    s('wall', [
      [x1, y0, z1],
      [x1, y0, z],
      [x1, y1, z],
      [x1, y1, z1],
    ]), // 동(+X)
    s('wall', [
      [x, y0, z],
      [x, y0, z1],
      [x, y1, z1],
      [x, y1, z],
    ]), // 서(−X)
  ];
  const rec: BuildingRecord = {
    layer: 'buildings',
    gmlId,
    buildingId: null,
    lod: 2,
    measuredHeightM: h,
    storeys: null,
    storeysBelow: null,
    usage: '401',
    surfaces,
    source: 'plateau-test',
  };
  return rec;
}
