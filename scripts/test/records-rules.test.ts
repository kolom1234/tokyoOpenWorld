// 기록 누락 규칙: api.ts ↔ 모듈 카드(에러), 코드 ↔ PROGRESS.md(경고).
import { describe, expect, it } from 'vitest';
import { checkRecords, isCodePath } from '../lib/records-rules.ts';

describe('checkRecords', () => {
  it('fails when api.ts changes without its module card', () => {
    const r = checkRecords(['packages/render/src/api.ts', 'docs/modules/core.md', 'PROGRESS.md']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('docs/modules/render.md');
  });

  it('passes when the matching module card changes too', () => {
    const r = checkRecords(['packages/render/src/api.ts', 'docs/modules/render.md', 'PROGRESS.md']);
    expect(r).toEqual({ errors: [], warnings: [] });
  });

  it('warns (not fails) on code changes without PROGRESS.md', () => {
    const r = checkRecords(['packages/core/src/internal/rng.ts']);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('does not warn for docs-only changes', () => {
    expect(checkRecords(['docs/07-rendering.md', 'packages/core/README.md'])).toEqual({ errors: [], warnings: [] });
  });

  it('classifies code paths', () => {
    expect(isCodePath('scripts/check-size.ts')).toBe(true);
    expect(isCodePath('apps/worker/wrangler.jsonc')).toBe(true);
    expect(isCodePath('docs/modules/core.md')).toBe(false);
    expect(isCodePath('.github/workflows/ci.yml')).toBe(false);
  });
});
