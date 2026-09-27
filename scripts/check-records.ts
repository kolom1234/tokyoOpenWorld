// PR 기록 누락 게이트(`pnpm check:records --base <ref>`): api.ts↔모듈 카드(실패), 코드↔PROGRESS.md(경고). see docs/16-context-protocol.md §3
import { execFileSync } from 'node:child_process';
import { report } from './lib/files.ts';
import { checkRecords } from './lib/records-rules.ts';

function argValue(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** `<base>...HEAD`(merge-base 기준) 변경 파일. PR 머지 커밋 체크아웃에서도 PR 고유 변경만 나온다. */
function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter((line) => line !== '');
}

const base = argValue(process.argv, '--base') ?? 'origin/main';
const changed = changedFiles(base);
const { errors, warnings } = checkRecords(changed);
for (const message of errors) report('error', message);
for (const message of warnings) report('warning', message);
process.stdout.write(
  `check-records: ${changed.length} changed file(s) vs ${base}, ${errors.length} error(s), ${warnings.length} warning(s)\n`,
);
process.exitCode = errors.length === 0 ? 0 : 1;
