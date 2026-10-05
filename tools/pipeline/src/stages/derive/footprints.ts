// 건물 발자국 래스터(M05-T01 지형 성형 "건물 아래 평탄화", 04 §4.3): 지면(GroundSurface) 링 → 창 격자, 값 = 지면 링 최저점
// (벽·지하 부속물은 지하 통로·지하층까지 내려가 −4 m 구덩이를 만들었다).
// 겹치면 낮은 값. 발자국 밖 = NaN. 셀 + 8-이웃 건물을 넣어 여유 샘플도 이웃 셀과 같게. see docs/04-data-pipeline.md §4.3
import type { BuildingRecord, RingsWF } from '../../readers/plateau/types.ts';
import { rasterizeRings } from '../build/surface-class.ts';
import type { LocalGrid } from './grid.ts';
import { insideRings } from './roads.ts';

/** 평탄화 입력(건물 레코드를 줄인 것 — 이웃 셀 캐시용). */
export interface FootprintSource {
  minY: number;
  ground: RingsWF[];
}

export function footprintSources(buildings: readonly BuildingRecord[]): FootprintSource[] {
  const out: FootprintSource[] = [];
  for (const b of buildings) {
    const ground = b.surfaces.filter((s) => s.kind === 'ground').map((s) => s.ringsWF);
    let minY = Number.POSITIVE_INFINITY;
    for (const rings of ground)
      for (const r of rings) for (let i = 1; i < r.length; i += 3) minY = Math.min(minY, r[i] as number);
    if (Number.isFinite(minY) && ground.length > 0) out.push({ minY, ground });
  }
  return out;
}

export function footprintGrid(
  sources: readonly FootprintSource[],
  originX: number,
  originZ: number,
  g: LocalGrid,
): Float32Array {
  const out = new Float32Array(g.n * g.n).fill(Number.NaN);
  for (const b of sources) {
    for (const rings of b.ground) {
      rasterizeRings(rings, g.n, originX + g.x0, originZ + g.z0, (k) => {
        const cur = out[k] as number;
        out[k] = Number.isNaN(cur) ? b.minY : Math.min(cur, b.minY);
      });
    }
  }
  return out;
}

const RING_BUCKET_M = 16;

/** 지면 링 정밀 시험(WF, 16 m 버킷) — 1 m 래스터는 경계 ±0.7 m를 건물로 본다(소품 연석 판정, ADR-0068). */
export function footprintRingTest(sources: readonly FootprintSource[]): (x: number, z: number) => boolean {
  const rings: RingsWF[] = [];
  const buckets = new Map<string, number[]>();
  for (const b of sources)
    for (const g of b.ground) {
      const o = g[0] ?? [];
      let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
      for (let i = 0; i < o.length; i += 3) {
        x0 = Math.min(x0, o[i] as number);
        x1 = Math.max(x1, o[i] as number);
        z0 = Math.min(z0, o[i + 2] as number);
        z1 = Math.max(z1, o[i + 2] as number);
      }
      const id = rings.push(g) - 1;
      for (let bz = Math.floor(z0 / RING_BUCKET_M); bz <= Math.floor(z1 / RING_BUCKET_M); bz++)
        for (let bx = Math.floor(x0 / RING_BUCKET_M); bx <= Math.floor(x1 / RING_BUCKET_M); bx++) {
          const k = `${bx},${bz}`;
          const list = buckets.get(k);
          if (list) list.push(id);
          else buckets.set(k, [id]);
        }
    }
  return (x, z) => {
    for (const id of buckets.get(`${Math.floor(x / RING_BUCKET_M)},${Math.floor(z / RING_BUCKET_M)}`) ?? [])
      if (insideRings(rings[id] as RingsWF, x, z)) return true;
    return false;
  };
}
