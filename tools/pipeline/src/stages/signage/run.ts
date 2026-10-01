// `pnpm pipeline signage`(M05-T06): 폰트(Noto Sans JP Bold, OFL — data/raw/noto-sans-jp, sources.lock sha256) → 가상 브랜드 생성(실존 대조 0건)
// → 아틀라스 굽기 → apps/game/src/assets/signage/{atlas.png, signage.json}(게임 해시 에셋, 첫 표시 뒤 지연 적재). see ADR-0054
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '@sanpo/core';
import opentype from 'opentype.js';
import { encodePngRgb } from '../../lib/png.ts';
import type { LockSource } from '../fixture.ts';

/** sources.lock 폰트 항목(sha256 고정). */
export type FontLock = LockSource & { sha256: string };

import { sha256Of } from '../materials/fetch.ts';
import { ATLAS, bakeAtlas, type GlyphFont, tilesOf } from './atlas.ts';
import { type BrandConfig, generateBrands, parseRealBrands } from './brand-generator.ts';

export const FONT_SOURCE = 'noto-sans-jp';

/** sources.lock의 폰트 → data/raw(없으면 내려받기) → sha256 확인. */
export async function fontBytes(repoRoot: string, src: FontLock, log: Logger): Promise<Uint8Array> {
  const url = src.url;
  const path = join(repoRoot, 'data/raw', FONT_SOURCE, url.split('/').pop() as string);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`signage font ${url}: HTTP ${res.status}`);
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
    log.info(`downloaded ${path}`);
  }
  const bytes = new Uint8Array(readFileSync(path));
  const sha = sha256Of(bytes);
  if (sha !== src.sha256) throw new Error(`signage font: sha256 ${sha} ≠ lock ${src.sha256}`);
  return bytes;
}

export interface SignageManifest {
  atlas: { width: number; height: number; h: { w: number; h: number }; v: { w: number; h: number } };
  palettes: { bg: string; text: string; accent: string }[];
  brands: { name: string; category: string; palette: number; h: [number, number]; v: [number, number] }[];
}

export async function buildSignage(repoRoot: string, src: FontLock, log: Logger): Promise<SignageManifest> {
  const cfg = JSON.parse(readFileSync(join(repoRoot, 'content/signage/brands.json'), 'utf8')) as BrandConfig;
  const reals = parseRealBrands(readFileSync(join(repoRoot, 'content/signage/real-brands.txt'), 'utf8'));
  const { brands, rejected } = generateBrands(cfg, reals);
  log.info(`brands ${brands.length} (real list ${reals.length}, rejected ${rejected.length}: ${rejected.join(', ')})`);
  const bytes = await fontBytes(repoRoot, src, log);
  const font = opentype.parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  ) as GlyphFont;
  const t0 = performance.now();
  const rgb = bakeAtlas(font, brands, cfg.palettes);
  const outDir = join(repoRoot, 'apps/game/src/assets/signage');
  mkdirSync(outDir, { recursive: true });
  const png = encodePngRgb(ATLAS.width, ATLAS.height, rgb);
  writeFileSync(join(outDir, 'atlas.png'), png);
  const manifest: SignageManifest = {
    atlas: {
      width: ATLAS.width,
      height: ATLAS.height,
      h: { w: ATLAS.h.w, h: ATLAS.h.h },
      v: { w: ATLAS.v.w, h: ATLAS.v.h },
    },
    palettes: cfg.palettes,
    brands: brands.map((b) => {
      const t = tilesOf(b.id);
      return { name: b.name, category: b.category, palette: b.palette, h: [t.h.x, t.h.y], v: [t.v.x, t.v.y] };
    }),
  };
  writeFileSync(join(outDir, 'signage.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  log.info(
    `atlas ${ATLAS.width}×${ATLAS.height} ${(png.byteLength / 1024).toFixed(0)} KB in ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
  return manifest;
}
