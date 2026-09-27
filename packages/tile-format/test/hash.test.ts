// XXH64(seed 0) 골든 — python-xxhash 3.x로 생성(바이트 i = (31i + 7) & 255). 값 변경 = 모든 섹션 해시 변경. see docs/adr/0017-tile-format-v1-implementation.md
import { describe, expect, it } from 'vitest';
import { sectionHash, tkcHash32 } from '../src/index.ts';

const GOLDEN: Array<[number, string]> = [
  [0, 'ef46db3751d8e999'],
  [1, 'a96c7f0ce858bbb7'],
  [3, '56e6957632a487f9'],
  [4, 'c60d15b1e3ff8f04'],
  [7, 'afbefc3d6c6f9a8e'],
  [8, '3da5c7aa269683e0'],
  [15, 'ae2a37eb9357caa7'],
  [31, '4a74f3a1a39ad4a1'],
  [32, '8d57d6a4671cc43d'],
  [33, '62c9fd21ed857664'],
  [63, '5c320a0d2707057f'],
  [64, '7bbabbc45729d17e'],
  [100, 'efa0ad2d3e70c151'],
  [1000, '99594f4828043d35'],
  [4109, '4cb4de5eea111f8f'],
];

const pattern = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);

describe('xxh64', () => {
  it.each(GOLDEN)('len %i', (n, hex) => {
    expect(sectionHash(pattern(n))).toBe(`xxh64:${hex}`);
  });

  it('matches the xxHash reference strings', () => {
    const enc = new TextEncoder();
    expect(sectionHash(enc.encode('abc'))).toBe('xxh64:44bc2cf5ad770999');
    expect(sectionHash(enc.encode('Nobody inspects the spammish repetition'))).toBe('xxh64:fbcea83c8a378bf1');
  });

  it('hashes a subarray view by its own bytes only', () => {
    const big = pattern(200);
    const view = new Uint8Array(big.buffer, 37, 100);
    expect(sectionHash(view)).toBe(sectionHash(view.slice()));
  });

  it('tkcHash32 = low 32 bits of the digest', () => {
    expect(tkcHash32(pattern(1000))).toBe(0x28043d35);
    expect(tkcHash32(new Uint8Array(0))).toBe(0x51d8e999);
  });
});
