// CODEMAP 대상 소스 파일 수집(테스트·빌드 산출물 제외, 경로 정렬). see docs/16-context-protocol.md §5
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** 저장소 루트 기준 스캔 루트 글롭(`*` = 워크스페이스 1단계). */
export const CODEMAP_ROOTS = ['packages/*/src', 'apps/*/src', 'tools/*/src', 'scripts'] as const;

const SOURCE_EXT = /\.(ts|tsx|mts)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test', 'tests', '__tests__', '.wrangler']);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts)$/;

/** 순수 문자열 비교(로케일 무관) — 출력 결정론을 위해 localeCompare를 쓰지 않는다. */
export function comparePaths(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

function listDirs(absDir: string): string[] {
  try {
    return readdirSync(absDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKIP_DIRS.has(d.name))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function expandRoot(repoRoot: string, pattern: string): string[] {
  const [head, star, tail] = pattern.split('/');
  if (star !== '*' || head === undefined || tail === undefined) return [pattern];
  return listDirs(join(repoRoot, head)).map((name) => `${head}/${name}/${tail}`);
}

function walk(repoRoot: string, relDir: string, out: string[]): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(join(repoRoot, relDir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(repoRoot, rel, out);
    } else if (SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
}

/** CODEMAP 대상 파일(저장소 루트 기준 `/` 구분 상대경로)을 정렬해 반환. */
export function collectSourceFiles(repoRoot: string): string[] {
  const out: string[] = [];
  for (const pattern of CODEMAP_ROOTS) {
    for (const relDir of expandRoot(repoRoot, pattern)) walk(repoRoot, relDir, out);
  }
  return out.sort(comparePaths);
}
