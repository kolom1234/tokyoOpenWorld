// terrain.height(gzip 해제 후) 인코더/디코더 + 미터 높이 → u16 양자화. see docs/05-tile-format.md §4 (terrain.height)
import type { Result } from '@sanpo/core';
import { HEIGHTFIELD_BASE_M, HEIGHTFIELD_STEP_M, type HeightfieldData, type TkcError, TkcErrorCode } from '../api.ts';
import { ByteReader, ByteWriter, fail } from './bytes.ts';

const U16_MAX = 0xffff;
const MIN_SIZE = 2;

/** `{u16 size, f32 minH, f32 step}` + `u16[size²]`(행 = iz, 북→남). */
export function writeHeightfield(hf: HeightfieldData): Uint8Array {
  const { size, minH, step, data } = hf;
  if (!Number.isInteger(size) || size < MIN_SIZE || size > U16_MAX)
    throw new RangeError(`writeHeightfield: size ${size}`);
  if (data.length !== size * size) throw new RangeError(`writeHeightfield: data ${data.length} ≠ ${size}²`);
  if (!Number.isFinite(minH) || !(step > 0)) throw new RangeError('writeHeightfield: minH/step');
  const w = new ByteWriter();
  w.u16(size);
  w.f32(minH);
  w.f32(step);
  w.u16s(data);
  return w.finish();
}

/** terrain.height 바이트 → HeightfieldData(data는 사본 — 입력 오프셋 10은 u16 view 정렬이 보장되지 않음). */
export function parseHeightfield(bytes: Uint8Array): Result<HeightfieldData, TkcError> {
  const r = new ByteReader(bytes);
  const size = r.u16();
  const minH = r.f32();
  const step = r.f32();
  if (r.overrun) return fail(TkcErrorCode.Truncated, 'heightfield header');
  if (size < MIN_SIZE || !Number.isFinite(minH) || !(step > 0) || !Number.isFinite(step)) {
    return fail(TkcErrorCode.Corrupt, `heightfield size ${size} minH ${minH} step ${step}`);
  }
  if (r.remaining() < size * size * 2) return fail(TkcErrorCode.Truncated, `heightfield data < ${size}²`);
  return { ok: true, value: { size, minH, step, data: r.u16s(size * size).slice() } };
}

/**
 * 미터 높이 격자(size², 행 = iz) → 양자화. 기준 `minH`(기본 공통값 HEIGHTFIELD_BASE_M)·`step`을 f32로 반올림해 저장값과 같게 하고
 * v = round((h − minH)/step). 모든 셀이 같은 기준·스텝을 쓰므로 같은 높이 → 같은 u16(이웃 경계 비트 일치, ADR-0018).
 * 범위(0…65535 step) 밖·비유한 값은 throw.
 */
export function quantizeHeightfield(
  heightsM: ArrayLike<number>,
  size: number,
  step = HEIGHTFIELD_STEP_M,
  minH = HEIGHTFIELD_BASE_M,
): HeightfieldData {
  if (heightsM.length !== size * size) throw new RangeError(`quantizeHeightfield: ${heightsM.length} ≠ ${size}²`);
  const baseF = Math.fround(minH);
  const stepF = Math.fround(step);
  const data = new Uint16Array(size * size);
  for (let i = 0; i < data.length; i++) {
    const h = heightsM[i] ?? Number.NaN;
    if (!Number.isFinite(h)) throw new RangeError(`quantizeHeightfield: non-finite height at ${i}`);
    const v = Math.round((h - baseF) / stepF);
    if (v < 0 || v > U16_MAX) throw new RangeError(`quantizeHeightfield: ${h} m out of range at ${i}`);
    data[i] = v;
  }
  return { size, minH: baseF, step: stepF, data };
}
