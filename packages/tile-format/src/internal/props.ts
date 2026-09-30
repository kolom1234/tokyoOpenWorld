// props.inst(gzip 해제 후) 인코더/디코더(05 §4, M05-T03): 반복 {u16 typeId, u16 pad, u32 count, f32[count × 5] (x, y, z, yawRad, scale — 셀 로컬)} — 끝까지.
// typeId = PROP_TYPE(모르는 종류는 디코드는 하고 소비자가 무시 — 전방 호환). 거부: 길이 부족(truncated), 비유한 값·count 0(corrupt).
import type { Result } from '@sanpo/core';
import { ok } from '@sanpo/core';
import { type PropBatch, type TkcError, TkcErrorCode } from '../api.ts';
import { allFinite, ByteReader, ByteWriter, fail } from './bytes.ts';

const HEADER_BYTES = 8;
const FLOATS = 5;

export function writeProps(batches: readonly PropBatch[]): Uint8Array {
  const w = new ByteWriter();
  for (const b of batches) {
    const count = b.transforms.length / FLOATS;
    if (!Number.isInteger(count) || count === 0)
      throw new RangeError(`writeProps: type ${b.typeId} transforms length ${b.transforms.length}`);
    if (!allFinite(b.transforms)) throw new RangeError(`writeProps: type ${b.typeId} has non-finite values`);
    w.u16(b.typeId);
    w.u16(0);
    w.u32(count);
    w.f32s(b.transforms);
  }
  return w.finish();
}

export function parseProps(bytes: Uint8Array): Result<PropBatch[], TkcError> {
  const r = new ByteReader(bytes);
  const out: PropBatch[] = [];
  while (r.remaining() > 0) {
    if (r.remaining() < HEADER_BYTES) return fail(TkcErrorCode.Truncated, 'props.inst: batch header');
    const typeId = r.u16();
    r.skip(2);
    const count = r.u32();
    if (count === 0) return fail(TkcErrorCode.Corrupt, 'props.inst: empty batch');
    if (r.remaining() < count * FLOATS * 4)
      return fail(TkcErrorCode.Truncated, `props.inst: type ${typeId} needs ${count} transforms`);
    const transforms = r.f32s(count * FLOATS);
    if (!allFinite(transforms)) return fail(TkcErrorCode.Corrupt, `props.inst: type ${typeId} non-finite`);
    out.push({ typeId, transforms });
  }
  return ok(out);
}
