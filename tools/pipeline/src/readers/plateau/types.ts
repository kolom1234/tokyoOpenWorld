// PLATEAU 리더 공통 계약: 정규화 레코드 타입 + `PlateauReader` 인터페이스(구현 교체 가능). see docs/04-data-pipeline.md §4.2, docs/adr/0007-plateau-reader.md

/** 건물 면 종류. `installation` = BuildingInstallation(발코니·옥탑 설비 등) 기하. */
export type SurfaceKind = 'roof' | 'wall' | 'ground' | 'closure' | 'installation';

/** 도로 면 기능(게임 레이어용 축약). 원 코드는 `functionCode`에 보존. */
export type RoadFunction = 'carriageway' | 'sidewalk' | 'island' | 'crosswalk' | 'other';

/** 링 좌표: WF(m) `[x0, y0, z0, x1, …]`, 닫힘 중복점 제거, 0번 = 외곽, 1.. = 구멍. */
export type RingsWF = number[][];

export interface SurfaceRecord {
  kind: SurfaceKind;
  /** 원천 gml:id(면 단위, Polygon 또는 상위 테마면). 없으면 생략. */
  gmlId?: string;
  ringsWF: RingsWF;
  /** 링별 `[u0, v0, u1, …]`(ringsWF와 같은 정점 순서). 텍스처가 있을 때만. */
  uv?: number[][];
  /** 텍스처 이미지 경로(원천 gml 파일 기준 상대경로, 예: "53393596_bldg_6697_appearance/x.jpg"). */
  tex?: string;
}

export interface BuildingRecord {
  layer: 'buildings';
  gmlId: string;
  /** uro:buildingID(예: "13113-bldg-1234"), 없으면 null. */
  buildingId: string | null;
  lod: 1 | 2 | 3;
  measuredHeightM: number | null;
  storeys: number | null;
  storeysBelow: number | null;
  /** Building_usage 코드(예: "401"). 코드 → 명칭은 codelists로 해석(표시 단계). */
  usage: string | null;
  surfaces: SurfaceRecord[];
  source: string;
}

export interface RoadRecord {
  layer: 'roads';
  /** TrafficArea/AuxiliaryTrafficArea의 gml:id. LOD1 대체 시 Road의 gml:id. */
  id: string;
  roadId: string;
  lod: 1 | 2 | 3;
  function: RoadFunction;
  /** 원 코드: "TrafficArea:1000", "AuxiliaryTrafficArea:3000", "Road:9020" 형식. */
  functionCode: string;
  polygonWF: RingsWF;
  source: string;
}

/** 교량(PLATEAU brid, M05-T08): 건물과 같은 면 구조 — 상판 윗면(OuterFloorSurface) = roof, 구조재·난간(BridgeConstructionElement·Installation) = installation. */
export interface BridgeRecord extends Omit<BuildingRecord, 'layer'> {
  layer: 'bridges';
}

export type NormalizedFeature = BuildingRecord | RoadRecord | BridgeRecord;

export interface PlateauReadOptions {
  /** `data/sources.lock.json`의 소스 ID(레코드 `source`에 기록). */
  sourceId: string;
}

/** 구현: A안 `nusamai`(외부 CLI), B안 `citygml-sax`(스트리밍 파서). ADR-0007 채택안 = citygml-sax. */
export interface PlateauReader {
  readonly name: 'nusamai' | 'citygml-sax';
  /** CityGML 파일 1개(bldg 또는 tran)를 읽어 정규화 레코드를 원천 순서대로 낸다. */
  read(file: string, opts: PlateauReadOptions): AsyncIterable<NormalizedFeature>;
}
