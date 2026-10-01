// M05-T06 가상 간판: 브랜드 생성(결정론·실존 대조 0건·정규화), 래스터라이저(덮임·감기), 아틀라스 타일 배치·채널, 간판 배치(돌출 열·입간판·옥상).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ATLAS, renderTile, tilesOf } from '../src/stages/signage/atlas.ts';
import {
  type BrandConfig,
  generateBrands,
  matchesReal,
  normalizeName,
  parseRealBrands,
} from '../src/stages/signage/brand-generator.ts';
import { fillPolygons, flatten } from '../src/stages/signage/raster.ts';

const REPO = join(import.meta.dirname, '../../..');
const cfg = JSON.parse(readFileSync(join(REPO, 'content/signage/brands.json'), 'utf8')) as BrandConfig;
const reals = parseRealBrands(readFileSync(join(REPO, 'content/signage/real-brands.txt'), 'utf8'));

describe('brand generator', () => {
  it('normalises kana, width and punctuation before comparing', () => {
    expect(normalizeName('セブン-イレブン')).toBe(normalizeName('せぶんいれぶん'));
    expect(normalizeName('ＵＮＩＱＬＯ')).toBe('uniqlo');
    expect(matchesReal('ローソン珈琲', 'ローソン', reals)).toBeDefined();
    expect(matchesReal('GU BAR', 'GU', reals)).toBeDefined();
    expect(matchesReal('GUMA BAR', 'GUMA', reals)).toBeUndefined();
  });

  it('builds the configured number of unique fictional brands with zero real-list matches, deterministically', () => {
    const a = generateBrands(cfg, reals);
    const b = generateBrands(cfg, reals);
    expect(a.brands).toHaveLength(cfg.count);
    expect(a.brands).toEqual(b.brands);
    expect(new Set(a.brands.map((x) => normalizeName(x.name))).size).toBe(cfg.count);
    for (const x of a.brands) {
      expect(matchesReal(x.name, x.name, reals)).toBeUndefined();
      expect(x.palette).toBeLessThan(cfg.palettes.length);
    }
  });

  it('rejects candidates that collide with the real list', () => {
    const tiny: BrandConfig = {
      ...cfg,
      count: 2,
      katakana: ['ロ', 'ー', 'ソ', 'ン'],
      kanjiFirst: ['吉'],
      kanjiSecond: ['野'],
    };
    const r = generateBrands({ ...tiny, latin: ['xa', 'qe'] }, [...reals, normalizeName('ロー')]);
    expect(r.brands.every((x) => matchesReal(x.name, x.name, reals) === undefined)).toBe(true);
  });
});

describe('raster', () => {
  it('fills a square with exact horizontal coverage and nonzero winding', () => {
    const out = new Float32Array(8 * 8);
    fillPolygons(
      flatten([
        { type: 'M', x: 2, y: 2 },
        { type: 'L', x: 6.5, y: 2 },
        { type: 'L', x: 6.5, y: 6 },
        { type: 'L', x: 2, y: 6 },
        { type: 'Z' },
      ]),
      out,
      8,
      8,
    );
    expect(out[3 * 8 + 3]).toBeCloseTo(1, 5);
    expect(out[3 * 8 + 6]).toBeCloseTo(0.5, 5);
    expect(out[3 * 8 + 7]).toBe(0);
    expect(out[0]).toBe(0);
  });
});

describe('atlas', () => {
  const box = {
    unitsPerEm: 1000,
    getPath: (_t: string, x: number, y: number, s: number) => ({
      commands: [
        { type: 'M' as const, x, y: y - s * 0.7 },
        { type: 'L' as const, x: x + s * 0.6, y: y - s * 0.7 },
        { type: 'L' as const, x: x + s * 0.6, y },
        { type: 'L' as const, x, y },
        { type: 'Z' as const },
      ],
    }),
  };
  const brand = { id: 5, name: 'テスト珈琲', category: 'COFFEE', latin: false, palette: 0 };

  it('lays tiles out without overlap inside the atlas', () => {
    const last = tilesOf(63);
    expect(last.h.x + last.h.w).toBeLessThanOrEqual(ATLAS.width);
    expect(last.h.y + last.h.h).toBeLessThanOrEqual(ATLAS.v.y0);
    expect(last.v.y + last.v.h).toBeLessThanOrEqual(ATLAS.height);
    expect(tilesOf(5).h).toEqual({ x: 256, y: 64, w: 256, h: 64 });
  });

  it('renders panel, centred text and accent channels', () => {
    for (const vertical of [false, true]) {
      const t = renderTile(box, brand, vertical);
      const [panel, text, accent] = t.ch as [Float32Array, Float32Array, Float32Array];
      const at = (c: Float32Array, x: number, y: number) => c[Math.floor(y) * t.w + Math.floor(x)] as number;
      expect(at(panel, t.w / 2, t.h / 2)).toBe(1);
      expect(at(panel, 0, 0)).toBe(0);
      expect(text.reduce((a, v) => a + v, 0)).toBeGreaterThan(t.w * t.h * 0.05);
      expect(accent.reduce((a, v) => a + v, 0)).toBeGreaterThan(0);
    }
  });
});
