// trees.inst(gzip 해제 후) 인코더/디코더(05 §4, M05-T04): {u32 count} + 레코드 count개 {u8 species, u8 seed, u16 pad, f32 x, y, z(셀 로컬), f32 height, f32 crownR} = 24 B.
// species = TREE_SPECIES(0 금지 — 모르는 번호는 디코드는 하고 소비자가 무시). 거부: 길이 불일치(truncated), species 0·비유한·높이 ≤ 0(corrupt).
import type { Result } from '@sanpo/core';
import { ok } from '@sanpo/core';
import { type TkcError, TkcErrorCode, type TreeBatch, type TreeRecord } from '../api.ts';
import { ByteWriter, fail } from './bytes.ts';

export const TREE_RECORD_BYTES = 24;

export function writeTrees(records: readonly TreeRecord[]): Uint8Array {
  const w = new ByteWriter();
  w.u32(records.length);
  for (const r of records) {
    const v = [r.x, r.y, r.z, r.height, r.crownR];
    if (!v.every(Number.isFinite) || r.height <= 0 || r.species < 1 || r.species > 255)
      throw new RangeError(`writeTrees: bad record ${JSON.stringify(r)}`);
    w.u8(r.species);
    w.u8(r.seed & 0xff);
    w.u16(0);
    for (const x of v) w.f32(x);
  }
  return w.finish();
}

/** i번째 레코드(레코드 버퍼 = 24 B × count). */
export function treeRecordAt(b: TreeBatch, i: number): TreeRecord {
  const dv = new DataView(b.records, i * TREE_RECORD_BYTES, TREE_RECORD_BYTES);
  return {
    species: dv.getUint8(0),
    seed: dv.getUint8(1),
    x: dv.getFloat32(4, true),
    y: dv.getFloat32(8, true),
    z: dv.getFloat32(12, true),
    height: dv.getFloat32(16, true),
    crownR: dv.getFloat32(20, true),
  };
}

export function parseTrees(bytes: Uint8Array): Result<TreeBatch, TkcError> {
  if (bytes.byteLength < 4) return fail(TkcErrorCode.Truncated, 'trees.inst: count');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint32(0, true);
  if (bytes.byteLength !== 4 + count * TREE_RECORD_BYTES)
    return fail(
      TkcErrorCode.Truncated,
      `trees.inst: ${count} records need ${4 + count * TREE_RECORD_BYTES} B, got ${bytes.byteLength}`,
    );
  const records = bytes.slice(4).buffer;
  const batch: TreeBatch = { count, records };
  for (let i = 0; i < count; i++) {
    const r = treeRecordAt(batch, i);
    const v = [r.x, r.y, r.z, r.height, r.crownR];
    if (r.species === 0 || !v.every(Number.isFinite) || r.height <= 0)
      return fail(TkcErrorCode.Corrupt, `trees.inst: record ${i}`);
  }
  return ok(batch);
}
