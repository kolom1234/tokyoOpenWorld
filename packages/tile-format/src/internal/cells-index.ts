// cells.idx 인코더/디코더 + .tkc 파일 hash32. 레코드 16 B, (level, iz, ix) 오름차순. see docs/05-tile-format.md §5
import { type CellLevel, packCellKey, type Result } from '@sanpo/core';
import {
  CELLS_INDEX_MAGIC,
  type CellsIndex,
  type CellsIndexEntry,
  type CellsIndexRecord,
  type TkcError,
  TkcErrorCode,
} from '../api.ts';
import { asBytes, ByteReader, ByteWriter, fail } from './bytes.ts';
import { xxh64Low32 } from './xxh64.ts';

const HEADER_BYTES = 8;
const RECORD_BYTES = 16;
const U16_MAX = 0xffff;
const U32_MAX = 0xffff_ffff;
const I16_MIN = -32768;
const I16_MAX = 32767;

function compareEntry(a: CellsIndexEntry, b: CellsIndexEntry): number {
  return a.level - b.level || a.iz - b.iz || a.ix - b.ix;
}

const intIn = (v: number, lo: number, hi: number): boolean => Number.isInteger(v) && v >= lo && v <= hi;

function assertEntry(e: CellsIndexEntry): void {
  const good =
    intIn(e.level, 0, 3) &&
    intIn(e.ix, I16_MIN, I16_MAX) &&
    intIn(e.iz, I16_MIN, I16_MAX) &&
    intIn(e.flags, 0, U16_MAX) &&
    intIn(e.byteLength, 0, U32_MAX) &&
    intIn(e.hash32, 0, U32_MAX);
  if (!good) throw new RangeError(`writeCellsIndex: invalid entry L${e.level}_${e.ix}_${e.iz}`);
}

/** 항목을 (level, iz, ix)로 정렬해 직렬화. 중복 셀·범위 밖 필드는 프로그래밍 오류(throw). */
export function writeCellsIndex(entries: readonly CellsIndexEntry[]): Uint8Array {
  const sorted = [...entries].sort(compareEntry);
  const w = new ByteWriter();
  w.u32(CELLS_INDEX_MAGIC);
  w.u32(sorted.length);
  let prev: CellsIndexEntry | undefined;
  for (const e of sorted) {
    assertEntry(e);
    if (prev && compareEntry(prev, e) === 0)
      throw new RangeError(`writeCellsIndex: duplicate L${e.level}_${e.ix}_${e.iz}`);
    w.u8(e.level);
    w.u8(0);
    w.i16(e.ix);
    w.i16(e.iz);
    w.u16(e.flags);
    w.u32(e.byteLength);
    w.u32(e.hash32);
    prev = e;
  }
  return w.finish();
}

function readRecord(r: ByteReader): CellsIndexEntry {
  const level = r.u8v() as CellLevel;
  r.skip(1);
  const ix = r.i16();
  const iz = r.i16();
  const flags = r.u16();
  const byteLength = r.u32();
  const hash32 = r.u32();
  return { level, ix, iz, flags, byteLength, hash32 };
}

/** cells.idx → Map<CellKey, 레코드>(파일 순서 유지). 길이 불일치·레벨 범위 밖·정렬 위반/중복은 오류. */
export function readCellsIndex(buf: ArrayBuffer | Uint8Array): Result<CellsIndex, TkcError> {
  const r = new ByteReader(asBytes(buf));
  const magic = r.u32();
  const count = r.u32();
  if (r.overrun) return fail(TkcErrorCode.Truncated, 'cells.idx shorter than header');
  if (magic !== CELLS_INDEX_MAGIC) return fail(TkcErrorCode.Magic, `cells.idx magic 0x${magic.toString(16)}`);
  const expected = HEADER_BYTES + count * RECORD_BYTES;
  if (r.u8.byteLength < expected) return fail(TkcErrorCode.Truncated, `cells.idx ${r.u8.byteLength} B < ${expected}`);
  if (r.u8.byteLength > expected) return fail(TkcErrorCode.Range, `cells.idx trailing bytes after ${count} records`);
  const out = new Map<number, CellsIndexRecord>();
  let prev: CellsIndexEntry | undefined;
  for (let i = 0; i < count; i++) {
    const e = readRecord(r);
    if (e.level > 3) return fail(TkcErrorCode.Corrupt, `cells.idx record ${i} level ${e.level}`);
    if (prev && compareEntry(prev, e) >= 0) return fail(TkcErrorCode.Corrupt, `cells.idx record ${i} out of order`);
    out.set(packCellKey(e.level, e.ix, e.iz), { flags: e.flags, byteLength: e.byteLength, hash32: e.hash32 });
    prev = e;
  }
  return { ok: true, value: out };
}

/** cells.idx `hash32` = .tkc 파일 전체 바이트의 XXH64(seed 0) 하위 32비트. */
export function tkcHash32(tkc: Uint8Array): number {
  return xxh64Low32(tkc);
}
