// CODEMAP 생성기 엔트리(`pnpm codemap [--check]`) → docs/generated/CODEMAP.md. see docs/16-context-protocol.md §5
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSourceFiles } from './collect.ts';
import { extractFileInfo } from './extract.ts';
import { type CodemapEntry, renderCodemap } from './render.ts';

export const CODEMAP_PATH = 'docs/generated/CODEMAP.md';

/** 저장소 루트를 스캔해 CODEMAP 텍스트를 만든다(파일 시스템 쓰기 없음). */
export function generateCodemap(repoRoot: string): string {
  const entries: CodemapEntry[] = collectSourceFiles(repoRoot).map((path) => ({
    path,
    ...extractFileInfo(path, readFileSync(join(repoRoot, path), 'utf8')),
  }));
  return renderCodemap(entries);
}

function readOrEmpty(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** `--check`: 쓰지 않고 최신 여부만 확인(오래됐으면 종료 코드 1). 기본: 파일 갱신. */
function main(argv: readonly string[]): number {
  const repoRoot = resolve(import.meta.dirname, '../../..');
  const outPath = join(repoRoot, CODEMAP_PATH);
  const next = generateCodemap(repoRoot);
  const prev = readOrEmpty(outPath);
  if (argv.includes('--check')) {
    if (prev === next) return 0;
    process.stderr.write(`${CODEMAP_PATH} is stale — run \`pnpm codemap\` and commit the result.\n`);
    return 1;
  }
  if (prev !== next) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, next);
  }
  process.stdout.write(`${CODEMAP_PATH} ${prev === next ? 'up to date' : 'updated'}\n`);
  return 0;
}

// `import.meta.main`은 Node 24 전용이라 쓰지 않는다(ADR-0011).
const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) process.exitCode = main(process.argv.slice(2));
