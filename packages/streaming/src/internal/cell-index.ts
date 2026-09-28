// cells.idx 조회(존재 여부·바이트 수·레벨별 목록·범위). 파싱은 @sanpo/tile-format. see docs/05-tile-format.md §5, docs/06-world-streaming.md §10
import { type CellKey, type CellLevel, mapResult, type Result, unpackCellKey } from '@sanpo/core';
import { type CellsIndex, type CellsIndexRecord, readCellsIndex, type TkcError } from '@sanpo/tile-format';

/** 레벨별 셀 인덱스 범위(포함). */
export interface IndexExtent {
  minIx: number;
  maxIx: number;
  minIz: number;
  maxIz: number;
}

export interface CellIndex {
  /** 전체 셀 수(모든 레벨). */
  readonly size: number;
  has(key: CellKey): boolean;
  get(key: CellKey): CellsIndexRecord | undefined;
  /** .tkc 바이트 수(대역폭 추정용). 없는 셀은 undefined. */
  byteLength(key: CellKey): number | undefined;
  /** 레벨의 셀 키, 파일 순서(iz, ix 오름차순). */
  keysAt(level: CellLevel): readonly CellKey[];
  /** 레벨의 인덱스 범위. 그 레벨에 셀이 없으면 undefined. */
  extentAt(level: CellLevel): IndexExtent | undefined;
}

function growExtent(e: IndexExtent | undefined, ix: number, iz: number): IndexExtent {
  if (!e) return { minIx: ix, maxIx: ix, minIz: iz, maxIz: iz };
  e.minIx = Math.min(e.minIx, ix);
  e.maxIx = Math.max(e.maxIx, ix);
  e.minIz = Math.min(e.minIz, iz);
  e.maxIz = Math.max(e.maxIz, iz);
  return e;
}

/** 파싱된 cells.idx(Map)를 조회 구조로 감싼다. */
export function createCellIndex(map: CellsIndex): CellIndex {
  const keys: CellKey[][] = [[], [], [], []];
  const extents: (IndexExtent | undefined)[] = [undefined, undefined, undefined, undefined];
  for (const key of map.keys()) {
    const { level, ix, iz } = unpackCellKey(key);
    keys[level]?.push(key);
    extents[level] = growExtent(extents[level], ix, iz);
  }
  return {
    size: map.size,
    has: (key) => map.has(key),
    get: (key) => map.get(key),
    byteLength: (key) => map.get(key)?.byteLength,
    keysAt: (level) => keys[level] ?? [],
    extentAt: (level) => extents[level],
  };
}

/** cells.idx 바이트 → CellIndex. 형식 오류는 TkcError. */
export function parseCellIndex(buf: ArrayBuffer | Uint8Array): Result<CellIndex, TkcError> {
  return mapResult(readCellsIndex(buf), createCellIndex);
}
