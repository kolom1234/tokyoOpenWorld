// 품질 티어 → 후처리 효과(M03-T07): 07 §9 표·덮어쓰기 규칙, 절차 LUT.
import { describe, expect, it } from 'vitest';
import { POST_TIERS, resolvePost } from '../src/internal/post/config.ts';
import { grade } from '../src/internal/post/lut.ts';

describe('post tiers', () => {
  it('follows the 07 §9 render scales and escalates effects by tier', () => {
    expect([POST_TIERS.low, POST_TIERS.medium, POST_TIERS.high, POST_TIERS.ultra].map((t) => t.renderScale)).toEqual([
      0.6, 0.75, 0.85, 1,
    ]);
    expect(POST_TIERS.low.ao).toBe('none');
    expect(POST_TIERS.medium.ao).toBe('gtao');
    expect(POST_TIERS.high.ssr).toBe(true);
    expect(POST_TIERS.ultra.ao).toBe('ssgi');
  });

  it('applies overrides and keeps SSGI/TAAU consistent without TAA', () => {
    expect(resolvePost('high', { ssr: false }).ssr).toBe(false);
    const noTaa = resolvePost('ultra', { taa: false });
    expect(noTaa.ao).toBe('gtao');
    expect(noTaa.renderScale).toBe(1);
    expect(resolvePost('high', { renderScale: 0.2 }).renderScale).toBe(0.5);
  });

  it('grades gently and deterministically', () => {
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const [r, g, b] = grade(v, v, v);
      for (const c of [r, g, b]) expect(Math.abs(c - v)).toBeLessThan(0.06);
    }
    expect(grade(0.3, 0.5, 0.7)).toEqual(grade(0.3, 0.5, 0.7));
  });
});
