// 크기 제한 규칙: 줄 수 계산, 함수 본문 길이(Biome 기준), 문서별 한도.
import { describe, expect, it } from 'vitest';
import { checkDocText, checkSourceText, countLines, docLimitFor, SIZE_LIMITS } from '../lib/size-rules.ts';

const fn = (name: string, bodyLines: number): string =>
  [
    `export function ${name}(): number {`,
    '  let x = 0;',
    ...Array(bodyLines - 2).fill('  x++;'),
    '  return x;',
    '}',
  ].join('\n');

describe('countLines', () => {
  it('ignores the empty line after a trailing newline', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
  });
});

describe('checkSourceText', () => {
  it('allows a 60-line body and rejects 61 lines', () => {
    expect(checkSourceText('packages/x/src/a.ts', fn('ok', 60))).toEqual([]);
    const [v] = checkSourceText('packages/x/src/a.ts', fn('big', 61));
    expect(v?.message).toContain('big body is 61 lines');
  });

  it('names arrow functions by their variable and skips test files for function length', () => {
    const src = ['export const run = (): void => {', ...Array(61).fill('  work();'), '};'].join('\n');
    expect(checkSourceText('apps/x/src/a.ts', src)[0]?.message).toContain('function run');
    expect(checkSourceText('apps/x/test/a.test.ts', src)).toEqual([]);
  });

  it('rejects files over the line limit', () => {
    const src = Array(SIZE_LIMITS.sourceFileLines + 1)
      .fill('export {};')
      .join('\n');
    expect(checkSourceText('tools/x/src/a.ts', src)[0]?.message).toContain('401 lines');
  });
});

describe('doc limits', () => {
  it('uses per-document limits and skips generated docs', () => {
    expect(docLimitFor('CLAUDE.md')).toBe(200);
    expect(docLimitFor('docs/modules/core.md')).toBe(150);
    expect(docLimitFor('docs/07-rendering.md')).toBe(400);
    expect(docLimitFor('docs/generated/CODEMAP.md')).toBeNull();
    expect(checkDocText('docs/modules/a.md', 'x\n'.repeat(151))[0]?.message).toContain('151 lines (max 150)');
  });
});
