// 설정 딥 머지(기본값 + 오버라이드). see docs/15-conventions.md §8
import type { DeepPartial } from '../api.ts';

// JSON/URL 유래 오버라이드로 인한 프로토타입 오염 방지.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function cloneDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(cloneDeep);
  if (!isPlainObject(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (!FORBIDDEN_KEYS.has(k)) out[k] = cloneDeep(x);
  return out;
}

function mergeInto(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || FORBIDDEN_KEYS.has(k)) continue;
    const cur = target[k];
    if (isPlainObject(cur) && isPlainObject(v)) mergeInto(cur, v);
    else target[k] = cloneDeep(v);
  }
}

/**
 * 새 객체를 반환(입력 불변). 평범한 객체는 재귀 병합, 배열·그 외 값은 통째로 교체, undefined는 무시.
 * 뒤쪽 오버라이드가 우선한다.
 */
export function mergeConfig<T>(defaults: T, ...overrides: NoInfer<DeepPartial<T>>[]): T {
  const out = cloneDeep(defaults);
  if (!isPlainObject(out)) {
    // 루트가 객체가 아니면 마지막 정의된 오버라이드가 전체를 대체.
    const last = overrides.findLast((o) => o !== undefined);
    return (last === undefined ? out : cloneDeep(last)) as T;
  }
  for (const o of overrides) if (isPlainObject(o)) mergeInto(out, o);
  return out as T;
}
