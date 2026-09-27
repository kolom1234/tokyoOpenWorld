// WF 사각형 → 위경도 외접 상자. 파이프라인 원천 조회(fetch) 범위 산출용. see docs/04-data-pipeline.md, docs/modules/geo.md
import type { CellBoundsWF, LonLatBBox } from '../api.ts';
import { wfToLonLat } from './transforms.ts';

// WF 직사각형은 위경도에서 약간 굽은 사각형이다(수렴각 ≈ 0.08°). 변마다 표본을 찍어 극값이 변 중간에 있어도 잡는다.
const SAMPLES_PER_EDGE = 16;
// 표본 사이 누락분·반올림을 덮는 여유(도). 1e-7° ≈ 1 cm.
const PAD_DEG = 1e-7;

/** WF XZ 사각형을 완전히 덮는 최소 위경도 상자(+1 cm 여유). */
export function lonLatBBoxOfWF(b: CellBoundsWF): LonLatBBox {
  if (!(b.maxX > b.minX && b.maxZ > b.minZ)) {
    throw new RangeError(`lonLatBBoxOfWF: empty bounds ${JSON.stringify(b)}`);
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  const visit = (x: number, z: number): void => {
    const ll = wfToLonLat({ x, y: 0, z });
    west = Math.min(west, ll.lon);
    east = Math.max(east, ll.lon);
    south = Math.min(south, ll.lat);
    north = Math.max(north, ll.lat);
  };
  for (let i = 0; i <= SAMPLES_PER_EDGE; i++) {
    const t = i / SAMPLES_PER_EDGE;
    const x = b.minX + (b.maxX - b.minX) * t;
    const z = b.minZ + (b.maxZ - b.minZ) * t;
    visit(x, b.minZ);
    visit(x, b.maxZ);
    visit(b.minX, z);
    visit(b.maxX, z);
  }
  return { west: west - PAD_DEG, south: south - PAD_DEG, east: east + PAD_DEG, north: north + PAD_DEG };
}
