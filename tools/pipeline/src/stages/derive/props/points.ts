// OSM 점 소품(M05-T03): 가로등·우체통·자판기·자전거 거치대·벤치·공중전화·휴지통·버스 정류장·볼라드·정지 표지(highway=stop).
// 차도 위 점은 가장 가까운 비차도 쪽으로 정착(보도 = 연석 뒤, 보도 없는 길 = 가장자리 — `curb.ts`, M07 사전 ⓪: 넓은 간선 한가운데 공중전화),
// 정면 = 가장 가까운 차도 쪽(없으면 결정론 난수). see ADR-0051
import type { PropTypeName } from '@sanpo/tile-format';
import type { OsmRecord } from '../../normalize-osm.ts';
import { type PlaceCtx, place, rngFor, towardRoad, type V2, yawOf } from './context.ts';
import { settleSite, siteTest } from './curb.ts';

/** OSM 태그 → 소품 종류. */
export function pointType(t: Record<string, string>): PropTypeName | undefined {
  if (t.highway === 'street_lamp') return 'streetLamp';
  if (t.highway === 'bus_stop') return 'busStop';
  if (t.highway === 'stop') return 'signStop';
  if (t.barrier === 'bollard') return 'bollard';
  switch (t.amenity) {
    case 'post_box':
      return 'postBox';
    case 'vending_machine':
      return 'vendingMachine';
    case 'bicycle_parking':
      return 'bicycleRack';
    case 'bench':
      return 'bench';
    case 'telephone':
      return 'phoneBooth';
    case 'waste_basket':
      return 'wasteBasket';
    default:
      return undefined;
  }
}

export function placePoints(c: PlaceCtx, osm: readonly OsmRecord[]): number {
  let n = 0;
  const t = siteTest(c);
  for (const r of osm) {
    const p0 = r.rings[0];
    if (r.geom !== 'point' || !p0) continue;
    const type = pointType(r.tags);
    if (!type) continue;
    const rng = rngFor(c, 'point', r.id);
    const p = settleSite(t, [p0[0] as number, p0[1] as number]);
    const face = towardRoad(c, p);
    const yaw = face ? yawOf(face) : rng.next() * 2 * Math.PI;
    if (type === 'bicycleRack') {
      // 거치대 모듈 perPoint개를 정면과 수직으로 나란히.
      const per = Number(c.catalog.types.bicycleRack.place?.perPoint ?? 3);
      const gap = Number(c.catalog.types.bicycleRack.place?.gapM ?? 0.7);
      const side: V2 = face ? [face[1], -face[0]] : [1, 0];
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * gap;
        if (place(c, type, settleSite(t, [p[0] + side[0] * o, p[1] + side[1] * o]), yaw)) n++;
      }
    } else if (place(c, type, p, yaw)) n++;
  }
  return n;
}
