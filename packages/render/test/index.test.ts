// @sanpo/render 공개 엔트리 스모크 테스트 (M00-T01 골격).
import { describe, expect, it } from 'vitest';

describe('@sanpo/render', () => {
  // three/webgpu + takram 대기 모듈 첫 import는 병렬 테스트 부하에서 5 s를 넘길 수 있다.
  it('loads the public entry', { timeout: 30_000 }, async () => {
    const mod = await import('../src/index.ts');
    expect(typeof mod).toBe('object');
  });
});
