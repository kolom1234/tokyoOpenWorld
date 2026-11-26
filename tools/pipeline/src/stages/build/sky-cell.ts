// 셀 하늘 가시도 조립(M12-T05, ADR-0110): 지면 = 영역 DEM(groundAround, 셀 밖 포함) 또는 셀 DEM 창(가장자리 클램프) +
// 셀·8-이웃 건물 발자국(꼭대기 높이) → DSM → 지형·도로·건물 인코더가 쓰는 `_SKY` 함수. assemble.ts(400줄 제한)에서 분리.
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { type FootprintSource, footprintSources } from '../derive/footprints.ts';
import type { SkyFn } from './buildings-mesh.ts';
import { type CellWindow, sampleAt } from './dem-window.ts';
import { createSkyField, skyAttribute } from './sky-visibility.ts';

export function cellSky(
  ox: number,
  oz: number,
  w: CellWindow,
  o: {
    buildings: readonly BuildingRecord[];
    footprintsAround?: readonly FootprintSource[] | undefined;
    groundAround?: ((x: number, z: number) => number | undefined) | undefined;
  },
): SkyFn {
  const lo = -w.margin;
  const hi = w.size - 1 + w.margin;
  const local = (x: number, z: number): number =>
    sampleAt(w, Math.min(Math.max(Math.round(x), lo), hi), Math.min(Math.max(Math.round(z), lo), hi));
  const ground = (x: number, z: number): number => o.groundAround?.(x, z) ?? local(x - ox, z - oz);
  const fp = o.footprintsAround ?? footprintSources(o.buildings);
  const field = createSkyField({
    ox,
    oz,
    ground,
    buildings: fp.filter((b) => b.topY !== undefined).map((b) => ({ ground: b.ground, topY: b.topY as number })),
  });
  return (pos, nrm, count, nScale) => skyAttribute(field, pos, nrm, count, { ox, oz }, nScale);
}
