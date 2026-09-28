// Cache Storage 상한 LRU: 사용 순서·초과분 선택·기존 항목 seed. see ADR-0023
import { describe, expect, it } from 'vitest';
import { createCacheLru } from '../src/internal/cache-lru.ts';

describe('createCacheLru', () => {
  it('evicts least recently used entries beyond the byte cap, never the one just touched', () => {
    const lru = createCacheLru(300);
    expect(lru.touch('a', 100)).toEqual([]);
    expect(lru.touch('b', 100)).toEqual([]);
    expect(lru.touch('c', 100)).toEqual([]);
    lru.touch('a', 100); // a 최근
    expect(lru.touch('d', 100)).toEqual(['b']);
    expect(lru.bytes).toBe(300);
    expect(lru.touch('huge', 1000)).toEqual(['c', 'a', 'd']); // 혼자서 상한 초과여도 자신은 남김
    expect(lru.size).toBe(1);
  });

  it('seeds older entries before the ones already touched and skips duplicates', () => {
    const lru = createCacheLru(250);
    lru.touch('new', 100);
    expect(
      lru.seed([
        ['old1', 100],
        ['new', 100],
        ['old2', 100],
      ]),
    ).toEqual(['old1']);
    expect(lru.bytes).toBe(200);
    lru.remove('old2');
    lru.remove('missing');
    expect(lru.bytes).toBe(100);
  });
});
