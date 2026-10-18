// 포토 그레이딩(M10-T05): 화이트밸런스(곱하기 색조)·비네팅(방사형 곱하기)·필름 그레인(결정론 잡음 타일 overlay). 미리보기(CSS 층)와 저장(2D 캔버스 합성)이 같은 값을 쓴다.
import { createRng } from '@sanpo/core';
import type { PhotoParams } from '../../api.ts';

/** 화이트밸런스 −1(차갑게)…+1(따뜻하게) → 곱하기 색(rgb 0–255). */
export function wbColor(w: number): [number, number, number] {
  const k = Math.max(-1, Math.min(1, w));
  return k >= 0
    ? [255, Math.round(255 - 22 * k), Math.round(255 - 60 * k)]
    : [Math.round(255 + 60 * k), Math.round(255 + 22 * k), 255];
}

export const css = (c: readonly number[]): string => `rgb(${c[0]},${c[1]},${c[2]})`;

/** 비네팅 가장자리 어둡기(0…1 → 알파). */
export const vignetteAlpha = (v: number): number => Math.max(0, Math.min(1, v)) * 0.75;
/** 그레인 overlay 불투명도. */
export const grainAlpha = (g: number): number => Math.max(0, Math.min(1, g)) * 0.35;

const TILE = 192;
let tileCache: ImageData | null = null;

/** 결정론 잡음 타일(회색 128 ± 잡음). */
export function noiseTile(): ImageData {
  if (tileCache) return tileCache;
  const rng = createRng(0x9a17);
  const d = new ImageData(TILE, TILE);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.round(128 + (rng.next() - 0.5) * 200);
    d.data[i] = v;
    d.data[i + 1] = v;
    d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  tileCache = d;
  return d;
}

/** 미리보기 CSS용 그레인 타일 data URL. */
export function noiseDataUrl(): string {
  const c = document.createElement('canvas');
  c.width = TILE;
  c.height = TILE;
  c.getContext('2d')?.putImageData(noiseTile(), 0, 0);
  return c.toDataURL('image/png');
}

type Ctx = OffscreenCanvasRenderingContext2D;

function applyGrade(ctx: Ctx, w: number, h: number, p: Pick<PhotoParams, 'whiteBalance' | 'vignette' | 'grain'>): void {
  if (Math.abs(p.whiteBalance) > 0.01) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = css(wbColor(p.whiteBalance));
    ctx.fillRect(0, 0, w, h);
  }
  if (p.vignette > 0.01) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${vignetteAlpha(p.vignette)})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (p.grain > 0.01) {
    const tile = new OffscreenCanvas(TILE, TILE);
    tile.getContext('2d')?.putImageData(noiseTile(), 0, 0);
    const pat = ctx.createPattern(tile, 'repeat');
    if (pat) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = grainAlpha(p.grain);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** 원본 PNG → 그레이딩 PNG + 썸네일 JPEG(가로 360). 원본 비트맵은 바로 닫는다(4K 메모리 회수). */
export async function gradePhoto(
  raw: Blob,
  p: PhotoParams,
): Promise<{ full: Blob; thumb: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(raw);
  const { width: w, height: h } = bmp;
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d') as Ctx;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  applyGrade(ctx, w, h, p);
  const full = await c.convertToBlob({ type: 'image/png' });
  const tw = 360;
  const th = Math.round((h / w) * tw);
  const t = new OffscreenCanvas(tw, th);
  (t.getContext('2d') as Ctx).drawImage(c, 0, 0, tw, th);
  const thumb = await t.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  // 큰 캔버스 즉시 놓기(가비지 수집 전에 백킹 스토어를 줄인다).
  c.width = 1;
  c.height = 1;
  return { full, thumb, w, h };
}
