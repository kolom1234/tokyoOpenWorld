// 최소 PNG 디코더(8비트 그레이/RGB/RGBA, 비인터레이스): GSI 標高タイル(dem_png) 읽기용 + RGB·RGBA 인코더(실내 큐브맵 M03-T05, 나무 아틀라스 M05-T04). 외부 의존 없음(node:zlib).
// see https://www.w3.org/TR/png/ §7–9 (필터 0–4)
import { deflateSync, inflateSync } from 'node:zlib';

export interface DecodedPng {
  width: number;
  height: number;
  /** 채널 수(1 그레이, 3 RGB, 4 RGBA). */
  channels: 1 | 3 | 4;
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Readonly<Record<number, 1 | 3 | 4>> = { 0: 1, 2: 3, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 스캔라인 필터 해제(제자리). */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] as number;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x] as number;
      const a = x >= bpp ? (out[row + x - bpp] as number) : 0;
      const b = y > 0 ? (out[prev + x] as number) : 0;
      const c = x >= bpp && y > 0 ? (out[prev + x - bpp] as number) : 0;
      let p = 0;
      if (type === 1) p = a;
      else if (type === 2) p = b;
      else if (type === 3) p = (a + b) >> 1;
      else if (type === 4) p = paeth(a, b, c);
      else if (type !== 0) throw new Error(`png: bad filter ${type}`);
      out[row + x] = (v + p) & 0xff;
    }
  }
  return out;
}

export function decodePng(buf: Uint8Array): DecodedPng {
  if (!SIGNATURE.every((b, i) => buf[i] === b)) throw new Error('png: bad signature');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let channels: 1 | 3 | 4 = 3;
  const idat: Uint8Array[] = [];
  while (p + 8 <= buf.length) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(...buf.subarray(p + 4, p + 8));
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      const [depth, colorType, , , interlace] = body.subarray(8, 13);
      const ch = CHANNELS[colorType as number];
      if (depth !== 8 || !ch || interlace !== 0) throw new Error(`png: unsupported depth ${depth} type ${colorType}`);
      channels = ch;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return { width, height, channels, data: unfilter(raw, width, height, channels) };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 8비트 RGB(3)·RGBA(4)(행 우선, 위 → 아래) → PNG 바이트(필터 0, 결정론). */
function encodePng(width: number, height: number, px: Uint8Array, channels: 3 | 4): Uint8Array {
  if (px.length !== width * height * channels) throw new RangeError('encodePng: size mismatch');
  const row = width * channels;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) raw.set(px.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, channels === 4 ? 6 : 2, 0, 0, 0], 8);
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, q) => n + q.length, 0));
  let o = 0;
  for (const q of parts) {
    out.set(q, o);
    o += q.length;
  }
  return out;
}

export const encodePngRgb = (width: number, height: number, rgb: Uint8Array): Uint8Array =>
  encodePng(width, height, rgb, 3);
/** RGBA(M05-T04 나무 아틀라스). */
export const encodePngRgba = (width: number, height: number, rgba: Uint8Array): Uint8Array =>
  encodePng(width, height, rgba, 4);
