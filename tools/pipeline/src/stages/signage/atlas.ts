// 간판 아틀라스 굽기(M05-T06): 브랜드마다 가로 타일(256 × 64, 4열 × 16행, 위 절반)·세로 타일(64 × 256, 16열 × 4행, 아래 절반) → 1024 × 2048 sRGB RGB PNG.
// 타일 = 판(둥근 사각형, 밖 = 틀색) 위 브랜드 팔레트 바탕 + 강조 띠(가로 = 아래 띠, 세로 = 위 머리) + 글자(Noto Sans JP Bold 윤곽 → raster.ts) 덮임 합성.
// 색을 구워 두면 렌더는 표본 1회로 끝난다(팔레트 uniformArray는 파사드 셰이더의 단계당 uniform 버퍼 12개 한도를 넘겼다).
// 세로 글자 = 한 자씩 위 → 아래(장음 ー → ｜). 결정론(래스터 순서 고정). see ADR-0054
import type { Brand } from './brand-generator.ts';
import { fillPolygons, flatten, type PathCommand } from './raster.ts';

export interface GlyphFont {
  unitsPerEm: number;
  getPath(text: string, x: number, y: number, fontSize: number): { commands: PathCommand[] };
}

export const ATLAS = {
  width: 1024,
  height: 2048,
  h: { w: 256, h: 64, cols: 4 },
  v: { w: 64, h: 256, cols: 16, y0: 1024 },
} as const;

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 브랜드 i의 가로·세로 타일(아틀라스 픽셀). */
export function tilesOf(i: number): { h: TileRect; v: TileRect } {
  const { h, v } = ATLAS;
  return {
    h: { x: (i % h.cols) * h.w, y: Math.floor(i / h.cols) * h.h, w: h.w, h: h.h },
    v: { x: (i % v.cols) * v.w, y: v.y0 + Math.floor(i / v.cols) * v.h, w: v.w, h: v.h },
  };
}

function bboxOf(polys: readonly number[][]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys)
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i] as number);
      x1 = Math.max(x1, p[i] as number);
      y0 = Math.min(y0, p[i + 1] as number);
      y1 = Math.max(y1, p[i + 1] as number);
    }
  return [x0, y0, x1, y1];
}

const shift = (polys: number[][], dx: number, dy: number): number[][] =>
  polys.map((p) => p.map((v, i) => v + (i % 2 === 0 ? dx : dy)));

/** 글자 줄 1개를 상자(bx, by, bw, bh) 가운데에 맞춰 넣은 다각형(원점 = 타일 왼쪽 위). */
function fitText(font: GlyphFont, text: string, bw: number, bh: number, bx: number, by: number): number[][] {
  const probe = flatten(font.getPath(text, 0, 0, 100).commands);
  const [x0, y0, x1, y1] = bboxOf(probe);
  if (!Number.isFinite(x0)) return [];
  const s = Math.min(bw / (x1 - x0), bh / (y1 - y0), 1e9) * 100;
  const polys = flatten(font.getPath(text, 0, 0, s).commands);
  const [a0, b0, a1, b1] = bboxOf(polys);
  return shift(polys, bx + (bw - (a1 - a0)) / 2 - a0, by + (bh - (b1 - b0)) / 2 - b0);
}

/** 둥근 사각형 마스크(가장자리 1 px 안티에일리어싱). */
function roundRect(px: Float32Array, w: number, h: number, inset: number, r: number): void {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const qx = Math.max(Math.abs(x + 0.5 - w / 2) - (w / 2 - inset - r), 0);
      const qy = Math.max(Math.abs(y + 0.5 - h / 2) - (h / 2 - inset - r), 0);
      px[y * w + x] = Math.min(1, Math.max(0, r - Math.hypot(qx, qy) + 0.5));
    }
}

/** 타일 1장(가로 또는 세로) → 채널 3장(판·글자·강조). */
export function renderTile(font: GlyphFont, b: Brand, vertical: boolean): { w: number; h: number; ch: Float32Array[] } {
  const [w, h] = vertical ? [ATLAS.v.w, ATLAS.v.h] : [ATLAS.h.w, ATLAS.h.h];
  const panel = new Float32Array(w * h);
  const text = new Float32Array(w * h);
  const accent = new Float32Array(w * h);
  roundRect(panel, w, h, 1, vertical ? 6 : 8);
  if (vertical) {
    const cap = Math.round(h * 0.14);
    for (let y = 3; y < cap; y++) for (let x = 3; x < w - 3; x++) accent[y * w + x] = panel[y * w + x] as number;
    const chars = [...b.name.replace(/ /g, '').replace(/ー/g, '｜')];
    const cell = Math.min((h - cap - 12) / chars.length, w - 14);
    const top = cap + 6 + (h - cap - 12 - cell * chars.length) / 2;
    chars.forEach((c, k) => {
      fillPolygons(
        fitText(font, c, cell * 0.86, cell * 0.86, (w - cell * 0.86) / 2, top + k * cell + cell * 0.07),
        text,
        w,
        h,
      );
    });
  } else {
    const band = Math.round(h * 0.16);
    for (let y = h - band - 2; y < h - 3; y++)
      for (let x = 3; x < w - 3; x++) accent[y * w + x] = panel[y * w + x] as number;
    fillPolygons(fitText(font, b.name, w - 24, h - band - 16, 12, 7), text, w, h);
  }
  return { w, h, ch: [panel, text, accent] };
}

export interface Palette {
  bg: string;
  text: string;
  accent: string;
}

/** 틀(판 밖·가장자리) sRGB — 렌더 간판 틀색과 비슷한 짙은 금속. */
export const FRAME_SRGB: readonly [number, number, number] = [0.29, 0.29, 0.3];

const hexRgb = (h: string): [number, number, number] => {
  const v = Number.parseInt(h.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

/** 채널 3장 → sRGB(0..1): 판 밖 = 틀, 판 = 바탕 → 강조 → 글자 순 덮어 칠하기. */
export function composite(panel: number, text: number, accent: number, p: Palette): [number, number, number] {
  const [bg, fg, ac] = [hexRgb(p.bg), hexRgb(p.text), hexRgb(p.accent)];
  return [0, 1, 2].map((k) => {
    const face =
      ((bg[k] as number) * (1 - accent) + (ac[k] as number) * accent) * (1 - text) + (fg[k] as number) * text;
    return (FRAME_SRGB[k] as number) * (1 - panel) + face * panel;
  }) as [number, number, number];
}

/** 브랜드 전부 → 아틀라스 sRGB RGB 바이트(행 우선). palettes[b.palette]로 칠한다. */
export function bakeAtlas(font: GlyphFont, brands: readonly Brand[], palettes: readonly Palette[]): Uint8Array {
  const out = new Uint8Array(ATLAS.width * ATLAS.height * 3);
  for (let i = 0; i < out.length; i += 3)
    out.set(
      FRAME_SRGB.map((v) => Math.round(v * 255)),
      i,
    );
  for (const b of brands) {
    const t = tilesOf(b.id);
    const pal = palettes[b.palette] as Palette;
    for (const [vertical, r] of [
      [false, t.h],
      [true, t.v],
    ] as const) {
      const tile = renderTile(font, b, vertical);
      const [panel, text, accent] = tile.ch as [Float32Array, Float32Array, Float32Array];
      for (let y = 0; y < tile.h; y++)
        for (let x = 0; x < tile.w; x++) {
          const k = y * tile.w + x;
          const c = composite(panel[k] as number, text[k] as number, accent[k] as number, pal);
          out.set(
            c.map((v) => Math.round(v * 255)),
            ((r.y + y) * ATLAS.width + r.x + x) * 3,
          );
        }
    }
  }
  return out;
}
