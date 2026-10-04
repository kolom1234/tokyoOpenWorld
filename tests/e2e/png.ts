// e2e 캡처 PNG(캔버스 convertToBlob — 8비트 RGB/RGBA, 비인터레이스)를 Node에서 RGBA로 디코드(내장 zlib만, 추가 의존성 없음).
// 픽셀 판정을 브라우저(decode → 2D getImageData)에서 하면 SwiftShader GPU 프로세스 큐 뒤에서 호출당 14–23 s(headless shell 2병렬) 걸렸다.
import { inflateSync } from 'node:zlib';

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA 8비트, 행 우선. */
  data: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** color type → 채널 수(지원: 2 = RGB, 6 = RGBA). */
const CHANNELS: Readonly<Record<number, number>> = { 2: 3, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 스캔라인 필터(PNG §9) 되돌리기 — 결과는 필터 바이트를 뺀 행들. */
function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 255;
    if (filter > 4) throw new Error(`png: filter ${filter} at row ${y}`);
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x] ?? 0;
      const a = x >= bpp ? (out[row + x - bpp] ?? 0) : 0;
      const b = y > 0 ? (out[row - stride + x] ?? 0) : 0;
      const c = x >= bpp && y > 0 ? (out[row - stride + x - bpp] ?? 0) : 0;
      const pred =
        filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      out[row + x] = (v + pred) & 0xff;
    }
  }
  return out;
}

export function decodePng(png: Buffer): RgbaImage {
  if (!SIGNATURE.every((v, i) => png[i] === v)) throw new Error('png: bad signature');
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  for (let off = 8; off + 8 <= png.length; ) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const body = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = CHANNELS[body[9] ?? -1] ?? 0;
      if (body[8] !== 8 || channels === 0 || body[12] !== 0)
        throw new Error(`png: unsupported depth ${body[8]} color ${body[9]} interlace ${body[12]}`);
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const pixels = unfilter(inflateSync(Buffer.concat(idat)), height, width * channels, channels);
  if (channels === 4) return { width, height, data: pixels };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    data.set(pixels.subarray(i, i + 3), j);
    data[j + 3] = 255;
  }
  return { width, height, data };
}
