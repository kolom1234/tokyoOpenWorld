// @sanpo/geo 공개 계약(타입·상수). 구현은 internal/*, 재수출은 index.ts. see docs/modules/geo.md, docs/01-architecture.md §7–8
import type { CellLevel } from '@sanpo/core';

/**
 * WF 원점(EPSG:6677, 미터). `x = E − E0`, `z = −(N − N0)`.
 * 변경 금지 — 바꾸면 전체 리빌드 + ADR(docs/01-architecture.md §7). `world.json`과 부팅 시 대조한다.
 */
export const WORLD_ORIGIN = { E0: -12000.0, N0: -37760.0, epsg: 'EPSG:6677' } as const;

/** 레벨별 셀 한 변(미터). L0=256, 부모는 자식 4×4. index = 레벨. */
export const CELL_SIZES = [256, 1024, 4096, 16384] as const;

/** HLOD 한 축당 자식 수(부모 = 자식 4×4). */
export const CELL_FANOUT = 4;

/** 위경도(도, EPSG:6668 JGD2011). */
export interface LonLat {
  lon: number;
  lat: number;
}

/** EPSG:6677 평면직각좌표 IX계(미터) + T.P. 표고(미터). 공식 축 X=북, Y=동 → 이름 있는 필드만 쓴다. */
export interface PrjCoord {
  northing: number;
  easting: number;
  heightTP: number;
}

/** WF XZ 평면 축정렬 경계(미터). min 포함, max 제외. */
export interface CellBoundsWF {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** 위경도 경계 상자(도, EPSG:6668). 원천 데이터 조회(OSM/GSI) 범위용. */
export interface LonLatBBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type { CellLevel };
