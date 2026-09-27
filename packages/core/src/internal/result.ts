// Result<T, E> 생성·소비 헬퍼. see docs/15-conventions.md §5
import type { Result } from '../api.ts';

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** 실패면 fallback. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/** 성공 값 변환(실패는 그대로 전달). */
export function mapResult<T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> {
  return r.ok ? { ok: true, value: f(r.value) } : r;
}
