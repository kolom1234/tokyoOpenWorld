// 2D 지도 타일 계약(M10-T03, 05 §1 `global/map.pmtiles`): Mapbox Vector Tile 2.1 레이어·피처 + PMTiles v3 아카이브. api.ts가 재수출한다(400줄 제한으로 분리).

/** MVT 기하 종류(1 점·2 선·3 면). */
export type MvtGeomType = 1 | 2 | 3;

/** 피처 하나: 좌표 = 타일 정수 좌표(0…extent, 버퍼로 바깥 허용). 선·면은 부분(링) 목록, 각 부분 = [x0, y0, x1, y1, …]. 면의 첫 링 = 바깥(화면 좌표 시계 방향). */
export interface MvtFeature {
  type: MvtGeomType;
  geometry: number[][];
  properties: Record<string, string | number | boolean>;
  id?: number;
}

export interface MvtLayer {
  name: string;
  /** 기본 4096. */
  extent: number;
  features: MvtFeature[];
}

/** PMTiles v3 머리말(필요한 부분). */
export interface PmtilesHeader {
  minZoom: number;
  maxZoom: number;
  /** 경위도 ×1e7 아님 — 도 단위. */
  bounds: { west: number; south: number; east: number; north: number };
  center: { lon: number; lat: number; zoom: number };
  tileType: 'mvt' | 'png' | 'unknown';
  tileCompression: 'none' | 'gzip';
  tiles: number;
}

/** 메모리에 올린 PMTiles 아카이브(파일 전체 — MVP 지도는 수 MB). */
export interface PmtilesArchive {
  readonly header: PmtilesHeader;
  /** 압축 해제한 타일 바이트(없으면 undefined). */
  tile(z: number, x: number, y: number): Promise<Uint8Array | undefined>;
  /** 메타데이터 JSON(레이어 목록·출처). */
  readonly metadata: Record<string, unknown>;
}

export interface PmtilesTileInput {
  z: number;
  x: number;
  y: number;
  /** 압축 전 MVT 바이트. */
  data: Uint8Array;
}
