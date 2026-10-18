// i18n: 평면 키(`area.key`) → 현재 언어 문자열, `{name}` 치환. 키 집합은 ko·ja·en 동일(테스트). 없는 키 = 키 그대로(개발 중 눈에 띄게).
import { signal } from '@preact/signals';
import type { Lang, LocalName, Msg } from '../../api.ts';
import en from './en.json';
import ja from './ja.json';
import ko from './ko.json';

export const DICTS: Readonly<Record<Lang, Readonly<Record<string, string>>>> = { ko, ja, en };

/** 지금 UI 언어(설정이 바꾼다). */
export const lang = signal<Lang>('ko');

export function isLocalName(v: unknown): v is LocalName {
  return typeof v === 'object' && v !== null && 'ko' in v && 'ja' in v && 'en' in v;
}

/** 고유명사 3개 언어 중 지금 언어. */
export function pick(n: LocalName, l: Lang = lang.value): string {
  return n[l] || n.en || n.ja;
}

export function t(key: string, params?: Msg['params'], l: Lang = lang.value): string {
  const s = DICTS[l][key] ?? DICTS.en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = params[k];
    if (v === undefined) return m;
    return isLocalName(v) ? pick(v, l) : String(v);
  });
}

export const tm = (m: Msg, l: Lang = lang.value): string => t(m.key, m.params, l);
