// xoshiro128** 결정론 난수(32-bit 정수 연산만 → 플랫폼 무관). see docs/15-conventions.md §7
import type { Rng } from '../api.ts';

const TWO_POW_32 = 0x1_0000_0000;
// splitmix32 증분(황금비 상수) — 32-bit 시드를 128-bit 상태로 확장. 출처: Vigna, "xoshiro/xoroshiro generators".
const SPLITMIX_GAMMA = 0x9e3779b9;

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

function splitmix32(state: { s: number }): number {
  state.s = (state.s + SPLITMIX_GAMMA) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) | 0;
}

/** xoshiro128** 생성기. seed는 32-bit로 절단(`seed >>> 0`)된다. 동일 seed → 동일 수열. */
export function createRng(seed: number): Rng {
  const sm = { s: seed >>> 0 };
  let s0 = splitmix32(sm);
  let s1 = splitmix32(sm);
  let s2 = splitmix32(sm);
  let s3 = splitmix32(sm);
  // 전부 0인 상태는 xoshiro의 고정점 → 회피.
  if ((s0 | s1 | s2 | s3) === 0) s0 = SPLITMIX_GAMMA | 0;

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9);
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result >>> 0;
  };

  return {
    next: () => nextU32() / TWO_POW_32,
    int(min, maxExcl) {
      if (!Number.isInteger(min) || !Number.isInteger(maxExcl) || maxExcl <= min) {
        throw new RangeError(`Rng.int: invalid range [${min}, ${maxExcl})`);
      }
      // 범위가 2^32보다 훨씬 작다는 전제의 곱셈 매핑(편향 < range/2^32, 게임 배치 용도에 무시 가능).
      return min + Math.floor((nextU32() / TWO_POW_32) * (maxExcl - min));
    },
    pick<T>(a: readonly T[]): T {
      if (a.length === 0) throw new RangeError('Rng.pick: empty array');
      return a[Math.floor((nextU32() / TWO_POW_32) * a.length)] as T;
    },
  };
}
