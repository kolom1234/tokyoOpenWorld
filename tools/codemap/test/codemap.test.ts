// CODEMAP 생성기: 책임 주석·export 추출, 그룹 렌더링, 저장소 스캔 결정론.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { comparePaths } from '../src/collect.ts';
import { extractFileInfo, extractSummary } from '../src/extract.ts';
import { generateCodemap } from '../src/index.ts';
import { groupOf, renderCodemap } from '../src/render.ts';

describe('extractSummary', () => {
  it('reads the first-line // or /* comment', () => {
    expect(extractSummary('// 책임 1줄. see docs/x.md\nexport {};')).toBe('책임 1줄. see docs/x.md');
    expect(extractSummary('/** 블록 주석 */\n')).toBe('블록 주석');
    expect(extractSummary('export const a = 1;\n')).toBe('');
  });
});

describe('extractFileInfo', () => {
  it('lists exported declarations, re-exports and defaults in source order', () => {
    const src = [
      '// test file',
      "export * from './api.ts';",
      "export { a, b as c } from './x.ts';",
      "export type { T } from './t.ts';",
      'export function f(): void {}',
      'export const { d, e: [g] } = obj;',
      'export interface I {}',
      'export type U = string;',
      'export class K {}',
      'const hidden = 1;',
      'export default hidden;',
    ].join('\n');
    const info = extractFileInfo('x.ts', src);
    expect(info.summary).toBe('test file');
    expect(info.exports).toEqual(["* from './api.ts'", 'a', 'c', 'T', 'f', 'd', 'g', 'I', 'U', 'K', 'default']);
  });
});

describe('renderCodemap', () => {
  it('groups by workspace and formats path — summary | exports', () => {
    const md = renderCodemap([
      { path: 'packages/core/src/a.ts', summary: 'A', exports: ['x', 'y'] },
      { path: 'packages/core/src/b.ts', summary: '', exports: [] },
      { path: 'scripts/c.ts', summary: 'C', exports: [] },
    ]);
    expect(md).toContain(
      '## packages/core\n- `packages/core/src/a.ts` — A | exports: x, y\n- `packages/core/src/b.ts`\n',
    );
    expect(md).toContain('## scripts\n- `scripts/c.ts` — C\n');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('maps paths to groups', () => {
    expect(groupOf('apps/worker/src/index.ts')).toBe('apps/worker');
    expect(groupOf('scripts/lib/files.ts')).toBe('scripts');
  });
});

describe('generateCodemap', () => {
  it('is deterministic and excludes tests', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const first = generateCodemap(root);
    expect(generateCodemap(root)).toBe(first);
    expect(first).toContain('`tools/codemap/src/index.ts`');
    expect(first).not.toContain('/test/');
  });

  it('sorts with plain code-unit comparison', () => {
    expect(['b', 'B', 'a'].sort(comparePaths)).toEqual(['B', 'a', 'b']);
  });
});
