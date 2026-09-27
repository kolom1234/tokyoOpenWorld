// 저장소 파일 워커(node_modules·dist·데이터 산출물 제외) + CI 출력 헬퍼. scripts/check-* 공용.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.wrangler', 'coverage', 'perf-results', 'test-results']);

/** `relDir` 아래 파일을 재귀 수집(저장소 루트 기준 `/` 구분 상대경로, 정렬). 없는 디렉터리는 빈 배열. */
export function listFiles(repoRoot: string, relDir: string): string[] {
  const out: string[] = [];
  const visit = (rel: string): void => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(join(repoRoot, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(child);
      } else if (entry.isFile()) {
        out.push(child);
      }
    }
  };
  visit(relDir);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** GitHub Actions에서는 워크플로 명령(`::error file=…::`)으로, 로컬에서는 평문으로 stderr에 쓴다. */
export function report(level: 'error' | 'warning', message: string, file?: string): void {
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const prefix = inActions ? `::${level}${file === undefined ? '' : ` file=${file}`}::` : `[${level}] `;
  const where = !inActions && file !== undefined ? `${file}: ` : '';
  process.stderr.write(`${prefix}${where}${message}\n`);
}
