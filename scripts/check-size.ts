// 크기 제한 게이트(`pnpm check:size`): TS 파일 400줄·함수 60줄, 모듈 카드 150줄, docs 400줄, CLAUDE.md 200줄. see docs/15-conventions.md §2
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { listFiles, report } from './lib/files.ts';
import { checkDocText, checkSourceText, docLimitFor, type SizeViolation } from './lib/size-rules.ts';

const SOURCE_DIRS = ['packages', 'apps', 'tools', 'scripts'];
const SOURCE_EXT = /\.(ts|tsx|mts)$/;

function collectViolations(repoRoot: string): SizeViolation[] {
  const read = (path: string): string => readFileSync(join(repoRoot, path), 'utf8');
  const sources = SOURCE_DIRS.flatMap((dir) => listFiles(repoRoot, dir)).filter(
    (p) => SOURCE_EXT.test(p) && !p.endsWith('.d.ts'),
  );
  const docs = ['CLAUDE.md', ...listFiles(repoRoot, 'docs')].filter((p) => docLimitFor(p) !== null);
  return [...sources.flatMap((p) => checkSourceText(p, read(p))), ...docs.flatMap((p) => checkDocText(p, read(p)))];
}

const repoRoot = resolve(import.meta.dirname, '..');
const violations = collectViolations(repoRoot);
for (const v of violations) report('error', `${v.message} (line ${v.line})`, v.path);
process.stdout.write(`check-size: ${violations.length === 0 ? 'ok' : `${violations.length} violation(s)`}\n`);
process.exitCode = violations.length === 0 ? 0 : 1;
