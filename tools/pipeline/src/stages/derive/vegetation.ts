// 식생 면(M05-T04): OSM 녹지 면 → 지형 `_SURF` 덧칠(도로·보도가 아닌 plaza 샘플만) + 나무 채우기용 면 목록.
// 잔디(2) = park·garden·grass·recreation_ground·scrub·meadow, 흙(3, 낙엽층) = forest·wood. 공원 안 숲은 숲이 이긴다(칠하는 순서).
// 셀 OSM 목록 = 셀에 닿는 모든 면(bbox) → 경계 샘플은 이웃 셀과 같은 입력(이음새 일치). see ADR-0052, docs/04-data-pipeline.md §4.3
import { rasterizeRings, SURF } from '../build/surface-class.ts';
import type { OsmRecord } from '../normalize-osm.ts';
import type { LocalGrid } from './grid.ts';

export type GreenKind = 'park' | 'garden' | 'grass' | 'scrub' | 'forest';

/** 녹지 면 종류(없으면 undefined). */
export function greenKind(r: OsmRecord): GreenKind | undefined {
  if (r.geom !== 'polygon') return undefined;
  const t = r.tags;
  if (t.landuse === 'forest' || t.natural === 'wood') return 'forest';
  if (t.natural === 'scrub') return 'scrub';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'recreation_ground') return 'grass';
  if (t.leisure === 'garden') return 'garden';
  if (t.leisure === 'park' || t.landuse === 'park') return 'park';
  return undefined;
}

/** 칠하는 순서(뒤가 이김). */
const PAINT: readonly [GreenKind, number][] = [
  ['park', SURF.grass],
  ['garden', SURF.grass],
  ['grass', SURF.grass],
  ['scrub', SURF.grass],
  ['forest', SURF.soil],
];

/** OSM 링(xz 쌍) → WF xyz 링(y 0) — rasterizeRings 입력. */
export function xyzRings(r: OsmRecord): number[][] {
  return r.rings.map((xz) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) out.push(xz[i] as number, 0, xz[i + 1] as number);
    return out;
  });
}

/** surf(도로 분류 래스터, 창 격자)의 plaza 샘플에 녹지 면을 덧칠한 사본. */
export function paintVegetation(
  surf: Uint8Array,
  osm: readonly OsmRecord[],
  originX: number,
  originZ: number,
  g: LocalGrid,
): Uint8Array {
  const out = surf.slice();
  const greens = osm.map((r) => ({ r, kind: greenKind(r) })).filter((x) => x.kind !== undefined);
  for (const [kind, value] of PAINT) {
    for (const { r, kind: k } of greens) {
      if (k !== kind) continue;
      rasterizeRings(xyzRings(r), g.n, originX + g.x0, originZ + g.z0, (i) => {
        if (surf[i] === SURF.plaza) out[i] = value;
      });
    }
  }
  return out;
}
