// 최소 PNG 디코더(8비트 그레이/RGB/RGBA, 비인터레이스): GSI 標高タイル(dem_png) 읽기용. 외부 의존 없음(node:zlib).
// see https://www.w3.org/TR/png/ §7–9 (필터 0–4)
import { inflateSync } from 'node:zlib';

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
