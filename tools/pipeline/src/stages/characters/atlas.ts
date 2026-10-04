// 캐릭터 아틀라스 층(ADR-0057): 부위 텍스처(몸·머리·머리털 TGA 2048²) → UV 덮임 마스크 가중 상자 축소 → 덮임 밖 번짐 채우기(밉맵 이음매 방지)
// → 사분면 배치(위→아래 행). 머리털만 알파(알파 테스트), 몸·머리는 불투명. (1,1) 사분면은 회색.
import type { CharMesh } from './mesh.ts';
import { PART_QUADRANT } from './mesh.ts';
import type { Rgba } from './tga.ts';

const DILATE_STEPS = 8;
const EMPTY = [128, 128, 128, 255] as const;

/** 부위 p 삼각형을 size² 격자에 래스터(텍셀 중심 + 반 텍셀 여유). */
function coverage(mesh: CharMesh, p: number, size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const idx = mesh.lods[0] ?? new Uint32Array();
  const uv = mesh.partUv;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] ?? 0;
    if (mesh.part[a] !== p) continue;
    const xs = [a, idx[t + 1] ?? 0, idx[t + 2] ?? 0].map((i) => (uv[i * 2] ?? 0) * size);
    const ys = [a, idx[t + 1] ?? 0, idx[t + 2] ?? 0].map((i) => (uv[i * 2 + 1] ?? 0) * size);
    const [x0, x1, x2] = xs as [number, number, number];
    const [y0, y1, y2] = ys as [number, number, number];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) + 1));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) + 1));
    const len = (ax: number, ay: number) => Math.hypot(ax, ay) || 1;
    const e = [len(x2 - x1, y2 - y1), len(x0 - x2, y0 - y2), len(x1 - x0, y1 - y0)];
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const s = Math.sign(area) || 1;
        const w0 = (((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) * s) / (e[0] as number);
        const w1 = (((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) * s) / (e[1] as number);
        const w2 = (((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) * s) / (e[2] as number);
        if (w0 >= -0.75 && w1 >= -0.75 && w2 >= -0.75) mask[y * size + x] = 1;
      }
  }
  return mask;
}

/** 마스크 가중 상자 축소: 덮인 원본 텍셀만 평균(가장자리 검은 배경 번짐 방지). 반환 = RGBA + 결과 마스크. */
function maskedDownscale(img: Rgba, size: number, mask: Uint8Array, alphaCut: boolean) {
  const f = img.width / size;
  const out = new Uint8Array(size * size * 4);
  const has = new Uint8Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      let all = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const s = ((y * f + dy) * img.width + x * f + dx) * 4;
          const al = img.data[s + 3] ?? 255;
          a += al;
          all++;
          if (alphaCut && al < 128) continue;
          r += img.data[s] ?? 0;
          g += img.data[s + 1] ?? 0;
          b += img.data[s + 2] ?? 0;
          n++;
        }
      const o = (y * size + x) * 4;
      out[o + 3] = alphaCut ? Math.round(a / all) : 255;
      if (n > 0 && mask[y * size + x]) {
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
        has[y * size + x] = 1;
      }
    }
  return { out, has };
}

/** 덮임 밖 텍셀을 이웃 평균으로 DILATE_STEPS번 번지고, 나머지는 덮인 텍셀 평균색. 알파는 그대로. */
function dilate(px: Uint8Array, has: Uint8Array, size: number): void {
  for (let step = 0; step < DILATE_STEPS; step++) {
    const next = has.slice();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (has[y * size + x]) continue;
        const acc = [0, 0, 0];
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size || !has[ny * size + nx]) continue;
            const s = (ny * size + nx) * 4;
            for (let k = 0; k < 3; k++) acc[k] = (acc[k] ?? 0) + (px[s + k] ?? 0);
            n++;
          }
        if (!n) continue;
        const o = (y * size + x) * 4;
        for (let k = 0; k < 3; k++) px[o + k] = Math.round((acc[k] ?? 0) / n);
        next[y * size + x] = 1;
      }
    has.set(next);
  }
  const mean = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < size * size; i++)
    if (has[i]) {
      for (let k = 0; k < 3; k++) mean[k] = (mean[k] ?? 0) + (px[i * 4 + k] ?? 0);
      n++;
    }
  for (let i = 0; i < size * size; i++)
    if (!has[i]) for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round((mean[k] ?? 0) / Math.max(n, 1));
}

/** 아틀라스 층 1장(2·part 정사각, RGBA 위→아래). parts = [몸, 머리, 머리털?]. */
export function buildAtlasLayer(mesh: CharMesh, parts: readonly (Rgba | undefined)[], part: number): Rgba {
  const size = part * 2;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set(EMPTY, i * 4);
  PART_QUADRANT.forEach(([qx, qy], p) => {
    const img = parts[p];
    if (!img) return;
    const mask = coverage(mesh, p, part);
    const { out, has } = maskedDownscale(img, part, mask, p === 2);
    dilate(out, has, part);
    for (let y = 0; y < part; y++)
      data.set(out.subarray(y * part * 4, (y + 1) * part * 4), ((qy * part + y) * size + qx * part) * 4);
  });
  return { width: size, height: size, data };
}
