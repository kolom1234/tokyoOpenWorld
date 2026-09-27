// @sanpo/ui 공개 엔트리 스모크 테스트 (M00-T01 골격).
import { describe, expect, it } from 'vitest';

describe('@sanpo/ui', () => {
  it('loads the public entry', async () => {
    const mod = await import('../src/index.ts');
    expect(typeof mod).toBe('object');
  });
});
