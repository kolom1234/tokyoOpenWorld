// 도감 설명 자체 작성 검사(M10-T04, ADR-0094): 위키백과 본문과의 최장 공통 부분 문자열·8-gram 공유율, 홍보 문구 목록. 순수 함수 — 네트워크 단계(review)와 오프라인 단위 테스트가 같이 쓴다.
import { createHash } from 'node:crypto';

export type PoiLang = 'ko' | 'ja' | 'en';
export const POI_LANGS: readonly PoiLang[] = ['ko', 'ja', 'en'];

/** 최장 공통 부분 문자열 상한(정규화 글자 수). 고유명사·연도 조합은 들어갈 수 있게, 문장 단위 복사는 걸리게. */
export const LCS_MAX: Readonly<Record<PoiLang, number>> = { ko: 16, ja: 16, en: 45 };
/** 설명 n-gram(일·한 = 글자 8개, 영 = 단어 4개) 중 원문에도 있는 비율 상한. */
export const NGRAM_MAX = 0.2;

/** 실존 상호 홍보·과장 문구(설명에 쓰지 않는다). */
export const PROMO_WORDS: Readonly<Record<PoiLang, readonly string[]>> = {
  ko: ['최고', '필수', '꼭 가', '꼭 들러', '인기 1위', '추천', '강력', '할인', '맛집', '세계적인'],
  ja: ['最高', '必見', 'おすすめ', 'オススメ', '人気No', '人気ナンバー', '絶対', '大人気', 'お得', '話題の'],
  en: [
    'best',
    'must-see',
    'must see',
    'must-visit',
    'top-rated',
    'world-famous',
    'world famous',
    'iconic',
    'unmissable',
    'discount',
  ],
};

export function normalizeText(s: string, lang: PoiLang): string {
  const t = s.normalize('NFKC').toLowerCase();
  if (lang === 'en')
    return t
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // 공백·문장 부호 제거(글자 비교).
  return t.replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 최장 공통 부분 문자열(동적 계획 — 짧은 a × 긴 b, 두 줄 배열). */
export function longestCommonSubstring(a: string, b: string): { length: number; text: string } {
  if (!a || !b) return { length: 0, text: '' };
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  let best = 0;
  let end = 0;
  for (let i = 1; i <= a.length; i++) {
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const v = ca === b.charCodeAt(j - 1) ? (prev[j - 1] as number) + 1 : 0;
      cur[j] = v;
      if (v > best) {
        best = v;
        end = i;
      }
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return { length: best, text: a.slice(end - best, end) };
}

/** a의 n-gram 중 b에도 있는 비율(토큰 열 — 글자 또는 단어). */
export function sharedNgramRatio(a: readonly string[], b: readonly string[], n = 8): number {
  if (a.length < n) return 0;
  const grams = new Set<string>();
  for (let i = 0; i + n <= b.length; i++) grams.add(b.slice(i, i + n).join(''));
  let hit = 0;
  let total = 0;
  for (let i = 0; i + n <= a.length; i++) {
    total++;
    if (grams.has(a.slice(i, i + n).join(''))) hit++;
  }
  return total ? hit / total : 0;
}

const tokens = (s: string, lang: PoiLang): string[] => (lang === 'en' ? s.split(' ').filter(Boolean) : [...s]);

export function promoHits(text: string, lang: PoiLang): string[] {
  const t = text.normalize('NFKC').toLowerCase();
  return PROMO_WORDS[lang].filter((w) => t.includes(w.toLowerCase()));
}

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

export interface OverlapResult {
  lcs: number;
  lcsText: string;
  ngram: number;
  pass: boolean;
}

/** 설명 vs 원문(위키백과 본문) 겹침. */
export function overlap(desc: string, source: string, lang: PoiLang): OverlapResult {
  const a = normalizeText(desc, lang);
  const b = normalizeText(source, lang);
  const l = longestCommonSubstring(a, b);
  const ngram = sharedNgramRatio(tokens(a, lang), tokens(b, lang), lang === 'en' ? 4 : 8);
  return {
    lcs: l.length,
    lcsText: l.text,
    ngram: Math.round(ngram * 1000) / 1000,
    pass: l.length <= LCS_MAX[lang] && ngram <= NGRAM_MAX,
  };
}
