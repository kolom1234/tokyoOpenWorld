// 가상 브랜드 사전(M05-T06): content/signage/brands.json 설정 → 결정론 rng로 이름(가타카나·히라가나·한자 조합 / 로마자 음절 + 업종 말)을 만들고
// content/signage/real-brands.txt(실존 상호·상표)와 정규화 대조해 겹치면 버린다(수락 = 일치 0건). 로고·실존 상호 없음. see ADR-0054
import { createRng, hash32, type Rng, WORLD_SEED } from '@sanpo/core';

export interface BrandConfig {
  count: number;
  seed: string;
  katakana: string[];
  hiragana: string[];
  kanjiFirst: string[];
  kanjiSecond: string[];
  latin: string[];
  categories: { ja: string; en: string }[];
  palettes: { bg: string; text: string; accent: string }[];
}

export interface Brand {
  id: number;
  /** 간판 글자(가로·세로 같은 문자열). */
  name: string;
  /** 업종(categories[].en). */
  category: string;
  latin: boolean;
  palette: number;
}

/** 한자 둘째 글자가 이미 가게 말이면 업종을 붙이지 않는다. */
const SHOP_SECOND = new Set(['屋', '亭', '堂', '庵', '軒', '舎', '館', '坊', '家']);

/** 대조용 정규화: NFKC → 소문자 → 가타카나를 히라가나로 → 공백·기호 제거. */
export function normalizeName(s: string): string {
  const nfkc = s.normalize('NFKC').toLowerCase();
  let out = '';
  for (const ch of nfkc) {
    const c = ch.codePointAt(0) as number;
    const h = c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch;
    if (!/[\s・\-'’&.,!?/()（）「」]/u.test(h)) out += h;
  }
  return out;
}

/** real-brands.txt(# 주석·빈 줄 제외) → 정규화 목록. */
export function parseRealBrands(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .map(normalizeName)
    .filter((l) => l !== '');
}

/** 실존 목록과 겹치는가: 2자 이하 = 완전 일치, 3자 이상 = 포함. 이름 핵심(업종 말 앞) 3자 이상이 실존 이름 안에 있어도 일치. */
export function matchesReal(name: string, core: string, reals: readonly string[]): string | undefined {
  const n = normalizeName(name);
  const c = normalizeName(core);
  for (const r of reals) {
    if (r.length <= 2 ? n === r || c === r : n.includes(r)) return r;
    if (c.length >= 3 && r.includes(c)) return r;
  }
  return undefined;
}

const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng.next() * xs.length)] as T;

function morae(rng: Rng, table: readonly string[], min: number, max: number): string {
  const n = min + Math.floor(rng.next() * (max - min + 1));
  let s = '';
  for (let i = 0; i < n; i++) s += pick(rng, table);
  return s;
}

/** 이름 1개: [표시 이름, 핵심, 업종 en, 로마자인가]. */
function candidate(cfg: BrandConfig, rng: Rng): [string, string, string, boolean] {
  const cat = pick(rng, cfg.categories);
  const r = rng.next();
  if (r < 0.35) {
    const core = morae(rng, cfg.katakana, 2, 3);
    return [core + cat.ja, core, cat.en, false];
  }
  if (r < 0.6) {
    const second = pick(rng, cfg.kanjiSecond);
    const core = pick(rng, cfg.kanjiFirst) + second;
    return [SHOP_SECOND.has(second) ? core : core + cat.ja, core, cat.en, false];
  }
  if (r < 0.75) {
    const core = morae(rng, cfg.hiragana, 2, 3);
    return [core + cat.ja, core, cat.en, false];
  }
  const core = morae(rng, cfg.latin, 2, 3).toUpperCase();
  return [`${core} ${cat.en}`, core, cat.en, true];
}

/** 결정론 생성: count개(중복·실존 일치 버림, 시도 상한 count × 50). */
export function generateBrands(cfg: BrandConfig, reals: readonly string[]): { brands: Brand[]; rejected: string[] } {
  const rng = createRng(hash32(WORLD_SEED, 'signage', cfg.seed));
  const brands: Brand[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (let tries = 0; brands.length < cfg.count && tries < cfg.count * 50; tries++) {
    const [name, core, category, latin] = candidate(cfg, rng);
    const key = normalizeName(name);
    const palette = Math.floor(rng.next() * cfg.palettes.length);
    if (seen.has(key) || seen.has(normalizeName(core))) continue;
    const hit = matchesReal(name, core, reals);
    if (hit) {
      rejected.push(`${name} (${hit})`);
      continue;
    }
    seen.add(key);
    seen.add(normalizeName(core));
    brands.push({ id: brands.length, name, category, latin, palette });
  }
  if (brands.length < cfg.count) throw new Error(`signage: only ${brands.length}/${cfg.count} brands`);
  return { brands, rejected };
}
