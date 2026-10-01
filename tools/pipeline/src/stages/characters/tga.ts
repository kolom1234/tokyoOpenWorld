// 최소 TGA 디코더(Rocketbox 텍스처): 무압축(2)·RLE(10) 트루컬러 24/32비트, 원점 아래/위. 출력 = RGBA8 위→아래 행.
// see Truevision TGA File Format Specification 2.0

export interface Rgba {
  width: number;
  height: number;
  /** RGBA8, 위 행부터. */
  data: Uint8Array;
}

function readPixel(src: Uint8Array, at: number, bpp: number, out: Uint8Array, o: number): void {
  out[o] = src[at + 2] ?? 0;
  out[o + 1] = src[at + 1] ?? 0;
  out[o + 2] = src[at] ?? 0;
  out[o + 3] = bpp === 4 ? (src[at + 3] ?? 255) : 255;
}

export function decodeTga(buf: Uint8Array): Rgba {
  const idLen = buf[0] ?? 0;
  const cmapType = buf[1] ?? 0;
  const type = buf[2] ?? 0;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const depth = buf[16] ?? 0;
  const desc = buf[17] ?? 0;
  if (cmapType !== 0 || (type !== 2 && type !== 10) || (depth !== 24 && depth !== 32))
    throw new Error(`tga: unsupported type ${type} depth ${depth} cmap ${cmapType}`);
  const bpp = depth / 8;
  const n = width * height;
  const linear = new Uint8Array(n * 4);
  let p = 18 + idLen;
  if (type === 2) {
    for (let i = 0; i < n; i++, p += bpp) readPixel(buf, p, bpp, linear, i * 4);
  } else {
    let i = 0;
    while (i < n) {
      const h = buf[p++] ?? 0;
      const count = (h & 0x7f) + 1;
      if (h & 0x80) {
        for (let k = 0; k < count && i < n; k++, i++) readPixel(buf, p, bpp, linear, i * 4);
        p += bpp;
      } else {
        for (let k = 0; k < count && i < n; k++, i++, p += bpp) readPixel(buf, p, bpp, linear, i * 4);
      }
    }
  }
  const topDown = (desc & 0x20) !== 0;
  if (topDown) return { width, height, data: linear };
  const data = new Uint8Array(n * 4);
  const row = width * 4;
  for (let y = 0; y < height; y++) data.set(linear.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  return { width, height, data };
}

/** 상자 필터 축소(정수 배율). sRGB 색은 선형 평균이 정확하지만 텍스처 축소 차이는 작아 바이트 평균(알파 가중). */
export function downscale(img: Rgba, size: number): Rgba {
  const f = img.width / size;
  if (!Number.isInteger(f) || img.height / size !== f)
    throw new Error(`downscale: ${img.width}x${img.height} → ${size}`);
  if (f === 1) return img;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const s = ((y * f + dy) * img.width + x * f + dx) * 4;
          for (let k = 0; k < 4; k++) acc[k] = (acc[k] ?? 0) + (img.data[s + k] ?? 0);
        }
      const o = (y * size + x) * 4;
      for (let k = 0; k < 4; k++) data[o + k] = Math.round((acc[k] ?? 0) / (f * f));
    }
  return { width: size, height: size, data };
}
