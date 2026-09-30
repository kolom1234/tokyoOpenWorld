// 도로 분류(M05-T01): PLATEAU TrafficArea 폴리곤(셀 + 8-이웃, normalize가 셀 경계에서 자른 조각) → 성형용 1 m 래스터(차도 0·보행 1·없음 7)와
// 벡터 점 분류(연석 판정 — 1 m 래스터보다 정확). 차도 = carriageway·crosswalk·other, 보행 = sidewalk·island(04 §4.3). see docs/04-data-pipeline.md §4.3
import type { RoadRecord } from '../../readers/plateau/types.ts';
import { SURF, surfaceGrid } from '../build/surface-class.ts';
import type { LocalGrid } from './grid.ts';

export const ROAD_CLASS = { road: SURF.asphalt, walk: SURF.sidewalk, none: SURF.plaza } as const;
export type RoadSide = 'road' | 'walk' | 'none';

/** 보행면(보도·교통섬) — 연석으로 올린다. */
export function isWalk(r: Pick<RoadRecord, 'function'>): boolean {
  return r.function === 'sidewalk' || r.function === 'island';
}

/** 창(셀 로컬, 원점 WF originX/Z) 래스터: 뒤가 이김(차도 → 보행) — surfaceGrid와 같은 규칙. */
export function roadRaster(roads: readonly RoadRecord[], originX: number, originZ: number, g: LocalGrid): Uint8Array {
  return surfaceGrid(roads, originX + g.x0, originZ + g.z0, g.n);
}

/** 짝-홀 규칙(모든 링) — 구멍 포함 다각형 안쪽. */
export function insideRings(rings: readonly (readonly number[])[], x: number, z: number): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length / 3;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 3] as number;
      const zi = r[i * 3 + 2] as number;
      const xj = r[j * 3] as number;
      const zj = r[j * 3 + 2] as number;
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
  }
  return inside;
}

const BUCKET_M = 16;

export interface RoadIndex {
  /** WF 점이 어느 도로 면 안인지(보행 우선). */
  classify(x: number, z: number): RoadSide;
}

/** 16 m 버킷 공간 색인. */
export function roadIndex(roads: readonly RoadRecord[]): RoadIndex {
  const buckets = new Map<string, number[]>();
  roads.forEach((r, id) => {
    const o = r.polygonWF[0] ?? [];
    let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
    for (let i = 0; i < o.length; i += 3) {
      x0 = Math.min(x0, o[i] as number);
      x1 = Math.max(x1, o[i] as number);
      z0 = Math.min(z0, o[i + 2] as number);
      z1 = Math.max(z1, o[i + 2] as number);
    }
    for (let bz = Math.floor(z0 / BUCKET_M); bz <= Math.floor(z1 / BUCKET_M); bz++) {
      for (let bx = Math.floor(x0 / BUCKET_M); bx <= Math.floor(x1 / BUCKET_M); bx++) {
        const k = `${bx},${bz}`;
        const list = buckets.get(k);
        if (list) list.push(id);
        else buckets.set(k, [id]);
      }
    }
  });
  return {
    classify(x, z) {
      let side: RoadSide = 'none';
      for (const id of buckets.get(`${Math.floor(x / BUCKET_M)},${Math.floor(z / BUCKET_M)}`) ?? []) {
        const r = roads[id] as RoadRecord;
        if (!insideRings(r.polygonWF, x, z)) continue;
        if (isWalk(r)) return 'walk';
        side = 'road';
      }
      return side;
    },
  };
}
