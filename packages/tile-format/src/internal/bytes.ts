// 리틀엔디언 바이트 쓰기/읽기 헬퍼(범위 검사, 정렬 시 zero-copy typed view). see docs/05-tile-format.md (모든 수치 LE)
import type { Result } from '@sanpo/core';
import type { TkcError, TkcErrorCode } from '../api.ts';

const HOST_LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

export function fail(code: TkcErrorCode, message: string): Result<never, TkcError> {
  return { ok: false, error: { code, message } };
}

/** 필요 시 2배로 늘어나는 LE 쓰기 버퍼. 결과는 `finish()`로 정확한 길이 사본. */
export class ByteWriter {
  private buf = new Uint8Array(256);
  private dv = new DataView(this.buf.buffer);
  pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2;
    while (cap < this.pos + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.dv = new DataView(next.buffer);
  }
  u8(v: number): void {
    this.ensure(1);
    this.dv.setUint8(this.pos, v);
    this.pos += 1;
  }
  u16(v: number): void {
    this.ensure(2);
    this.dv.setUint16(this.pos, v, true);
    this.pos += 2;
  }
  i16(v: number): void {
    this.ensure(2);
    this.dv.setInt16(this.pos, v, true);
    this.pos += 2;
  }
  u32(v: number): void {
    this.ensure(4);
    this.dv.setUint32(this.pos, v, true);
    this.pos += 4;
  }
  f32(v: number): void {
    this.ensure(4);
    this.dv.setFloat32(this.pos, v, true);
    this.pos += 4;
  }
  bytes(b: Uint8Array): void {
    this.ensure(b.byteLength);
    this.buf.set(b, this.pos);
    this.pos += b.byteLength;
  }
  f32s(a: ArrayLike<number>): void {
    for (let i = 0; i < a.length; i++) this.f32(a[i] ?? 0);
  }
  u32s(a: ArrayLike<number>): void {
    for (let i = 0; i < a.length; i++) this.u32(a[i] ?? 0);
  }
  u16s(a: ArrayLike<number>): void {
    for (let i = 0; i < a.length; i++) this.u16(a[i] ?? 0);
  }
  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

/**
 * 범위 검사 LE 읽기. 범위를 넘으면 0을 돌려주고 `overrun`을 세운다(예외 없음) —
 * 호출자는 구조 단위로 `overrun`을 확인해 `truncated`로 보고한다.
 */
export class ByteReader {
  readonly u8: Uint8Array;
  readonly dv: DataView;
  pos = 0;
  overrun = false;

  constructor(u8: Uint8Array) {
    this.u8 = u8;
    this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  remaining(): number {
    return this.u8.byteLength - this.pos;
  }
  private take(n: number): number {
    const p = this.pos;
    if (p + n > this.u8.byteLength) {
      this.overrun = true;
      this.pos = this.u8.byteLength;
      return -1;
    }
    this.pos = p + n;
    return p;
  }
  u8v(): number {
    const p = this.take(1);
    return p < 0 ? 0 : this.dv.getUint8(p);
  }
  u16(): number {
    const p = this.take(2);
    return p < 0 ? 0 : this.dv.getUint16(p, true);
  }
  i16(): number {
    const p = this.take(2);
    return p < 0 ? 0 : this.dv.getInt16(p, true);
  }
  u32(): number {
    const p = this.take(4);
    return p < 0 ? 0 : this.dv.getUint32(p, true);
  }
  f32(): number {
    const p = this.take(4);
    return p < 0 ? 0 : this.dv.getFloat32(p, true);
  }
  skip(n: number): void {
    this.take(n);
  }
  /** n개 f32. 정렬·LE 호스트면 원본 view, 아니면 사본. 부족하면 빈 배열 + overrun. */
  f32s(n: number): Float32Array {
    const p = this.take(n * 4);
    if (p < 0) return new Float32Array(0);
    const abs = this.u8.byteOffset + p;
    if (HOST_LE && abs % 4 === 0) return new Float32Array(this.u8.buffer, abs, n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.dv.getFloat32(p + i * 4, true);
    return out;
  }
  u32s(n: number): Uint32Array {
    const p = this.take(n * 4);
    if (p < 0) return new Uint32Array(0);
    const abs = this.u8.byteOffset + p;
    if (HOST_LE && abs % 4 === 0) return new Uint32Array(this.u8.buffer, abs, n);
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.dv.getUint32(p + i * 4, true);
    return out;
  }
  u16s(n: number): Uint16Array {
    const p = this.take(n * 2);
    if (p < 0) return new Uint16Array(0);
    const abs = this.u8.byteOffset + p;
    if (HOST_LE && abs % 2 === 0) return new Uint16Array(this.u8.buffer, abs, n);
    const out = new Uint16Array(n);
    for (let i = 0; i < n; i++) out[i] = this.dv.getUint16(p + i * 2, true);
    return out;
  }
}

/** ArrayBuffer | Uint8Array → Uint8Array view(복사 없음). */
export function asBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

export function allFinite(a: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}
