// 지명 3개 언어(M10-T02): e-Stat 町丁 이름(道玄坂２丁目) + 우편번호 KEN_ALL 가나 읽기 → ja「渋谷区 道玄坂二丁目」· en「Dogenzaka 2-chome, Shibuya」· ko「시부야구 도겐자카 2초메」. 순수 함수(테스트).
import type { I18nText } from '@sanpo/tile-format';
import { kanaToHangul, kanaToRomaji, toFullKatakana } from './kana.ts';

const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1–99 → 한자 숫자(丁目 표기). */
export function kanjiNumber(n: number): string {
  if (n < 10) return KANJI[n] as string;
  const t = Math.floor(n / 10);
  return `${t > 1 ? KANJI[t] : ''}十${KANJI[n % 10]}`;
}

/** e-Stat S_NAME → 町 이름 + 丁目(없으면 null). 전각 숫자·공백 정규화. */
export function splitTown(sName: string): { base: string; chome: number | null } {
  const s = sName.normalize('NFKC').replace(/\s+/g, '');
  const m = /^(.*?)(\d+|[一二三四五六七八九十]+)丁目$/.exec(s);
  return m ? { base: m[1] as string, chome: parseNumber(m[2] as string) } : { base: s, chome: null };
}

/** 아라비아 또는 한자 숫자(1–99). */
export function parseNumber(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  const d = (c: string) => KANJI.indexOf(c);
  const ten = s.indexOf('十');
  if (ten < 0) return d(s);
  const hi = ten === 0 ? 1 : d(s[0] as string);
  const lo = ten === s.length - 1 ? 0 : d(s[ten + 1] as string);
  return hi * 10 + lo;
}

/** 같은 지명의 이체자·작은 가나(ヶ/ケ, 鶯/鴬, 濤/涛) — e-Stat와 KEN_ALL이 서로 다르게 쓴다. */
const VARIANTS: readonly [RegExp, string][] = [
  [/[ヶヵ]/g, 'ケ'],
  [/鶯/g, '鴬'],
  [/濤/g, '涛'],
];
export const variantKey = (s: string): string => VARIANTS.reduce((a, [re, to]) => a.replace(re, to), s);

/** KEN_ALL 町域 이름 → 비교 키(괄호 안 설명 제거·이체자). */
export const townKey = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/[（(].*$/, '')
    .trim();

export interface Readings {
  /** 구 코드(5자리) → 구 가나(끝 ク 제외). */
  wards: Map<string, string>;
  /** `${구 코드}|${町 키}` → 가나. */
  towns: Map<string, string>;
}

/** KEN_ALL CSV(UTF-8로 디코드한 텍스트) → 읽기 표. 열: 0 지자체 코드, 4 시구 가나, 5 町域 가나, 7 시구, 8 町域. */
export function parseKenAll(csv: string, wardCodes: ReadonlySet<string>): Readings {
  const wards = new Map<string, string>();
  const towns = new Map<string, string>();
  for (const line of csv.split(/\r?\n/)) {
    if (!line) continue;
    const cols = line.split(',').map((c) => c.replace(/^"|"$/g, ''));
    const code = cols[0] as string;
    if (!wardCodes.has(code)) continue;
    const wardKana = toFullKatakana(cols[4] ?? '').replace(/ク$/, '');
    wards.set(code, wardKana);
    const town = variantKey(townKey(cols[8] ?? ''));
    const kana = toFullKatakana(cols[5] ?? '').replace(/[（(].*$/, '');
    if (town && kana && !towns.has(`${code}|${town}`)) towns.set(`${code}|${town}`, kana);
  }
  return { wards, towns };
}

/** 방위 접두(東西南北 + 두 글자 이상 고유 이름) — 로마자에서 하이픈으로 떼어 쓴다(Nishi-Shinjuku, Minami-Aoyama: 도로 표지·도쿄도 표기 관례). */
const DIRECTION_PREFIX: Readonly<Record<string, string>> = { 東: 'ヒガシ', 西: 'ニシ', 南: 'ミナミ', 北: 'キタ' };

/** 町 이름 로마자: 방위 접두면 `Nishi-Shinjuku`, 아니면 붙여 쓴다(Jingumae·Udagawacho — 표지 관례 그대로). */
export function townRomaji(baseJa: string, kana: string): string {
  const pre = DIRECTION_PREFIX[baseJa.charAt(0)];
  if (pre && baseJa.length >= 3 && kana.startsWith(pre) && kana.length > pre.length)
    return `${kanaToRomaji(pre)}-${kanaToRomaji(kana.slice(pre.length))}`;
  return kanaToRomaji(kana);
}

/** 이름 3개 언어(읽기가 없으면 en·ko도 일본어 그대로 + missing = true). */
export function placeName(
  wardCode: string,
  wardJa: string,
  sName: string,
  r: Readings,
): { name: I18nText; missing: boolean } {
  const { base, chome } = splitTown(sName);
  const wardKana = r.wards.get(wardCode);
  const townKana = r.towns.get(`${wardCode}|${variantKey(base)}`);
  const ja = `${wardJa} ${base}${chome ? `${kanjiNumber(chome)}丁目` : ''}`;
  if (!wardKana || !townKana) return { name: { ja, en: ja, ko: ja }, missing: true };
  const en = `${townRomaji(base, townKana)}${chome ? ` ${chome}-chome` : ''}, ${kanaToRomaji(wardKana)}`;
  const ko = `${kanaToHangul(wardKana)}구 ${kanaToHangul(townKana)}${chome ? ` ${chome}초메` : ''}`;
  return { name: { ja, en, ko }, missing: false };
}
