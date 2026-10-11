// lights.bin(gzip 해제 후) 인코더/디코더(05 §4, M09-T03 — ADR-0078): `{u32 count}` + 레코드 24 B
// `{u8 kind, u8 schedule, u16 kelvin, f32 x,y,z(셀 로컬), i8 × 2 dirOct, u16 lumen, f32 range}`. 거부: 길이 불일치(truncated), 비유한·음수 범위(corrupt).
import type { Result } from '@sanpo/core';
import { ok } from '@sanpo/core';
import { LIGHT_RECORD_BYTES, type LightRecord, type TkcError, TkcErrorCode } from '../api.ts';
import { ByteReader, ByteWriter, fail } from './bytes.ts';

const clampI8 = (v: number): number => Math.max(-127, Math.min(127, Math.round(v)));

export function writeLights(lights: readonly LightRecord[]): Uint8Array {
  const w = new ByteWriter();
  w.u32(lights.length);
  for (const l of lights) {
    const vals = [...l.posLocal, l.range];
    if (!vals.every(Number.isFinite) || l.range <= 0) throw new RangeError('writeLights: non-finite position or range');
    w.u8(l.kind);
    w.u8(l.schedule);
    w.u16(Math.max(0, Math.min(65535, Math.round(l.kelvin))));
    w.f32(l.posLocal[0]);
    w.f32(l.posLocal[1]);
    w.f32(l.posLocal[2]);
    w.u8(clampI8(l.dirOct[0]) & 0xff);
    w.u8(clampI8(l.dirOct[1]) & 0xff);
    w.u16(Math.max(0, Math.min(65535, Math.round(l.lumen))));
    w.f32(l.range);
  }
  return w.finish();
}

const i8 = (b: number): number => (b > 127 ? b - 256 : b);

export function parseLights(bytes: Uint8Array): Result<LightRecord[], TkcError> {
  const r = new ByteReader(bytes);
  if (r.remaining() < 4) return fail(TkcErrorCode.Truncated, 'lights.bin: count');
  const n = r.u32();
  if (r.remaining() !== n * LIGHT_RECORD_BYTES)
    return fail(TkcErrorCode.Truncated, `lights.bin: ${n} records need ${n * LIGHT_RECORD_BYTES} B`);
  const out: LightRecord[] = [];
  for (let k = 0; k < n; k++) {
    const kind = r.u8v();
    const schedule = r.u8v();
    const kelvin = r.u16();
    const posLocal: [number, number, number] = [r.f32(), r.f32(), r.f32()];
    const dirOct: [number, number] = [i8(r.u8v()), i8(r.u8v())];
    const lumen = r.u16();
    const range = r.f32();
    if (!posLocal.every(Number.isFinite) || !Number.isFinite(range) || range <= 0)
      return fail(TkcErrorCode.Corrupt, `lights.bin: record ${k}`);
    out.push({ kind, schedule, kelvin, posLocal, dirOct, lumen, range });
  }
  return ok(out);
}
