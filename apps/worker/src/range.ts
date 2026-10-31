// `/world/*` Range·조건부 헤더 해석(F07, ADR-0103): RFC 9110 §14 단일 바이트 범위만, 문법 오류는 무시(200 전체), 만족 불가는 416. see docs/13-deployment.md §4
import type { WorldRange } from './env.ts';

/** 해석 결과: 범위 없음(헤더 없음·문법 오류 → 전체 응답) | 범위 | 처음부터 만족 불가(suffix 0·안전 정수 밖 시작). */
export type ParsedRange = { kind: 'none' } | { kind: 'range'; range: WorldRange } | { kind: 'unsatisfiable' };

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

/**
 * `Range` 헤더 → R2 범위. 다중 범위·다른 단위·공백·`a > b`는 **문법 오류 = 무시**(RFC 9110 §14.2: 서버는 Range를 무시하고 200 가능).
 * 숫자가 안전 정수를 넘으면: 시작 = 만족 불가, 끝·suffix = 객체 끝까지로 잘라 둔다(R2에 큰 수를 넘기지 않는다).
 */
export function parseRange(header: string | null): ParsedRange {
  if (header === null) return { kind: 'none' };
  const m = RANGE_RE.exec(header.trim());
  if (m === null) return { kind: 'none' };
  const [, first = '', last = ''] = m;
  if (first === '' && last === '') return { kind: 'none' };
  if (first === '') {
    const suffix = Number(last);
    if (suffix === 0) return { kind: 'unsatisfiable' };
    return { kind: 'range', range: { suffix: Math.min(suffix, Number.MAX_SAFE_INTEGER) } };
  }
  const offset = Number(first);
  if (!Number.isSafeInteger(offset)) return { kind: 'unsatisfiable' };
  if (last === '') return { kind: 'range', range: { offset } };
  const end = Math.min(Number(last), Number.MAX_SAFE_INTEGER);
  if (end < offset) return { kind: 'none' };
  return { kind: 'range', range: { offset, length: end - offset + 1 } };
}

/** 범위가 크기 `size` 객체에서 만족 가능한가(시작 < 크기, suffix > 0). */
export function isSatisfiable(range: WorldRange, size: number): boolean {
  if (range.suffix !== undefined) return range.suffix > 0 && size > 0;
  return (range.offset ?? 0) < size;
}

/** R2가 받지 못할 큰 길이를 객체 끝까지로 줄인다(만족 가능한 범위만). */
export function clampRange(range: WorldRange, size: number): WorldRange {
  if (range.suffix !== undefined) return { suffix: Math.min(range.suffix, size) };
  const offset = range.offset ?? 0;
  const length = Math.min(range.length ?? size - offset, size - offset);
  return { offset, length };
}

const CONDITIONAL_HEADERS = ['If-Match', 'If-None-Match', 'If-Modified-Since', 'If-Unmodified-Since'] as const;
const DATE_HEADERS = new Set(['If-Modified-Since', 'If-Unmodified-Since']);

/** R2 `onlyIf`에 넘길 조건부 헤더만(날짜가 틀린 헤더는 RFC 9110 §13.1.3·13.1.4대로 무시). 없으면 undefined. */
export function conditionalHeaders(request: Request): Headers | undefined {
  const out = new Headers();
  for (const name of CONDITIONAL_HEADERS) {
    const v = request.headers.get(name);
    if (v === null || (DATE_HEADERS.has(name) && Number.isNaN(Date.parse(v)))) continue;
    out.set(name, v);
  }
  return [...out.keys()].length > 0 ? out : undefined;
}
