// 지형 표면 분류(M03-T06, 05 §4 `_SURF`): PLATEAU 도로 폴리곤(TrafficArea) → 셀 1 m 격자(257²) 분류 래스터.
// 차도·횡단보도 = 0 asphalt, 보도·교통섬 = 1 sidewalk, 나머지 = 7 plaza(녹지·흙은 식생·토지이용 데이터가 들어오는 M05에서).
// 이웃 셀 도로까지 넣어 경계 샘플을 같은 입력으로 분류한다(이음새 일치). 도로 메시·연석은 M05-T01.
import type { RoadRecord } from '../../readers/plateau/types.ts';

export const SURF = { asphalt: 0, sidewalk: 1, grass: 2, soil: 3, gravel: 4, water: 5, ballast: 6, plaza: 7 } as const;

/** 칠하는 순서(뒤가 이김): 차도 → 횡단보도 → 교통섬 → 보도. */
const PRIORITY: readonly [RoadRecord['function'], number][] = [
  ['carriageway', SURF.asphalt],
  ['other', SURF.asphalt],
  ['crosswalk', SURF.asphalt],
  ['island', SURF.sidewalk],
  ['sidewalk', SURF.sidewalk],
];

/** 행 z(셀 로컬 m)와 링들의 교차 x 목록(짝-홀 규칙용, 정렬). 수평 변 무시, 반열림 구간으로 꼭짓점 중복 방지. */
function crossings(rings: readonly (readonly number[])[], z: number, ox: number, oz: number): number[] {
  const xs: number[] = [];
  for (const r of rings) {
    const n = r.length / 3;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const az = (r[i * 3 + 2] as number) - oz;
      const bz = (r[j * 3 + 2] as number) - oz;
      if (az === bz || z < Math.min(az, bz) || z >= Math.max(az, bz)) continue;
      const ax = (r[i * 3] as number) - ox;
      const bx = (r[j * 3] as number) - ox;
      xs.push(ax + ((z - az) / (bz - az)) * (bx - ax));
    }
  }
  return xs.sort((a, b) => a - b);
}

/** 링(WF xyz)을 n×n 격자(원점 WF ox·oz, 1 m, 행 = z)에 짝-홀 규칙으로 긁어 덮이는 샘플 번호마다 visit. */
export function rasterizeRings(
  rings: readonly (readonly number[])[],
  n: number,
  ox: number,
  oz: number,
  visit: (k: number) => void,
): void {
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  for (const r of rings)
    for (let i = 2; i < r.length; i += 3) {
      zMin = Math.min(zMin, (r[i] as number) - oz);
      zMax = Math.max(zMax, (r[i] as number) - oz);
    }
  for (let z = Math.max(0, Math.ceil(zMin)); z <= Math.min(n - 1, Math.floor(zMax)); z++) {
    const xs = crossings(rings, z, ox, oz);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] as number));
      const x1 = Math.min(n - 1, Math.floor(xs[k + 1] as number));
      for (let x = x0; x <= x1; x++) visit(z * n + x);
    }
  }
}

/** 셀 원점(WF x, z)의 n×n(1 m 간격, 행 = z) 분류 격자. roads = 이 셀과 이웃 셀의 도로 조각. */
export function surfaceGrid(roads: readonly RoadRecord[], originX: number, originZ: number, n = 257): Uint8Array {
  const grid = new Uint8Array(n * n).fill(SURF.plaza);
  for (const [fn, v] of PRIORITY) {
    for (const r of roads) {
      if (r.function === fn)
        rasterizeRings(r.polygonWF, n, originX, originZ, (k) => {
          grid[k] = v;
        });
    }
  }
  return grid;
}
