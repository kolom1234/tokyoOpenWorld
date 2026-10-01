// OSM 점 소품(M05-T03): 가로등·우체통·자판기·자전거 거치대·벤치·공중전화·휴지통·버스 정류장·볼라드·정지 표지(highway=stop).
// 차도 위 점은 가장 가까운 보도(≤ 6 m)로 옮기고, 정면 = 가장 가까운 차도 쪽(없으면 결정론 난수). see ADR-0051
import type { PropTypeName } from '@sanpo/tile-format';
import type { OsmRecord } from '../../normalize-osm.ts';
import { type PlaceCtx, place, rngFor, towardRoad, type V2, yawOf } from './context.ts';

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

/** 차도 위면 가장 가까운 보도 점(≤ 6 m, 16방위 0.5 m 간격). 보도가 없으면 그대로. */
function offCarriageway(c: PlaceCtx, p: V2): V2 {
  if (c.roads.classify(p[0], p[1]) !== 'road') return p;
  for (let d = 0.5; d <= 6; d += 0.5) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      const q: V2 = [p[0] + Math.cos(a) * d, p[1] + Math.sin(a) * d];
      if (c.roads.classify(q[0], q[1]) === 'walk') return q;
    }
  }
  return p;
}

export function placePoints(c: PlaceCtx, osm: readonly OsmRecord[]): number {
  let n = 0;
  for (const r of osm) {
    const p0 = r.rings[0];
    if (r.geom !== 'point' || !p0) continue;
    const type = pointType(r.tags);
    if (!type) continue;
    const rng = rngFor(c, 'point', r.id);
    const p = offCarriageway(c, [p0[0] as number, p0[1] as number]);
    const face = towardRoad(c, p);
    const yaw = face ? yawOf(face) : rng.next() * 2 * Math.PI;
    if (type === 'bicycleRack') {
      // 거치대 모듈 perPoint개를 정면과 수직으로 나란히.
      const per = Number(c.catalog.types.bicycleRack.place?.perPoint ?? 3);
      const gap = Number(c.catalog.types.bicycleRack.place?.gapM ?? 0.7);
      const side: V2 = face ? [face[1], -face[0]] : [1, 0];
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * gap;
        if (place(c, type, [p[0] + side[0] * o, p[1] + side[1] * o], yaw)) n++;
      }
    } else if (place(c, type, p, yaw)) n++;
  }
  return n;
}
