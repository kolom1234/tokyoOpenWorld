// SAX 파서가 모은 건물·도로 컨텍스트 → 정규화 레코드(LOD 선택 규칙). see docs/04-data-pipeline.md §4.2
import { roadFunctionOf, type TrafficAreaType } from './codes.ts';
import type { BridgeRecord, BuildingRecord, RingsWF, RoadRecord, SurfaceRecord } from './types.ts';

export interface BuildingCtx {
  gmlId: string;
  buildingId: string | null;
  measuredHeightM: number | null;
  storeys: number | null;
  storeysBelow: number | null;
  usage: string | null;
  byLod: Map<number, SurfaceRecord[]>;
  /** brid:Bridge(M05-T08)이면 레이어 'bridges'. */
  bridge?: boolean;
}

export interface AreaCtx {
  gmlId: string;
  type: TrafficAreaType;
  code: string | null;
  byLod: Map<number, RingsWF[]>;
}

export interface RoadCtx {
  /** type 'Road' = 도로 전체면(LOD1 대체용). */
  area: AreaCtx;
  areas: AreaCtx[];
}

/** 건물: 면이 있는 최고 LOD(3 > 2 > 1) 하나만 기록. 면이 없으면 null(통계에 누락으로 잡힘). */
export function finishBuilding(b: BuildingCtx, source: string): BuildingRecord | BridgeRecord | null {
  for (const lod of [3, 2, 1] as const) {
    const surfaces = b.byLod.get(lod);
    if (!surfaces || surfaces.length === 0) continue;
    return {
      layer: b.bridge ? 'bridges' : 'buildings',
      gmlId: b.gmlId,
      buildingId: b.buildingId,
      lod,
      measuredHeightM: b.measuredHeightM,
      storeys: b.storeys,
      storeysBelow: b.storeysBelow,
      usage: b.usage,
      surfaces,
      source,
    };
  }
  return null;
}

/** 도로: LOD3 TrafficArea > LOD2 > LOD1(Road 전체면). 도로 1개 안에서 최고 LOD만 낸다(저 LOD는 같은 면의 중복 표현). */
export function finishRoad(r: RoadCtx, source: string): RoadRecord[] {
  let maxLod = 0;
  for (const a of r.areas) for (const lod of a.byLod.keys()) maxLod = Math.max(maxLod, lod);
  const lod = (maxLod >= 2 ? maxLod : 1) as 1 | 2 | 3;
  const areas = maxLod >= 2 ? r.areas : [r.area];
  const out: RoadRecord[] = [];
  for (const a of areas) {
    const polys = a.byLod.get(lod) ?? [];
    polys.forEach((polygonWF, i) => {
      out.push({
        layer: 'roads',
        id: polys.length > 1 ? `${a.gmlId}:${i}` : a.gmlId,
        roadId: r.area.gmlId,
        lod,
        function: roadFunctionOf(a.type, a.code),
        functionCode: `${a.type}:${a.code ?? '?'}`,
        polygonWF,
        source,
      });
    });
  }
  return out;
}
