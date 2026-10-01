// 건물 발자국 래스터(M05-T01 지형 성형 "건물 아래 평탄화", 04 §4.3): 지면(GroundSurface) 링 → 창 격자, 값 = 지면 링 최저점
// (벽·지하 부속물은 지하 통로·지하층까지 내려가 −4 m 구덩이를 만들었다).
// 겹치면 낮은 값. 발자국 밖 = NaN. 셀 + 8-이웃 건물을 넣어 여유 샘플도 이웃 셀과 같게. see docs/04-data-pipeline.md §4.3
import type { BuildingRecord, RingsWF } from '../../readers/plateau/types.ts';
import { rasterizeRings } from '../build/surface-class.ts';
import type { LocalGrid } from './grid.ts';

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
