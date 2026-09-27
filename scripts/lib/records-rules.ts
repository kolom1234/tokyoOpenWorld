// PR 기록 누락 검사 규칙(순수 함수): api.ts ↔ 모듈 카드, 코드 ↔ PROGRESS.md. see docs/16-context-protocol.md §3–4
export interface RecordsReport {
  /** CI 실패 사유. */
  readonly errors: readonly string[];
  /** 경고(실패 아님). */
  readonly warnings: readonly string[];
}

const API_FILE = /^packages\/([^/]+)\/src\/api\.ts$/;
/** "코드 변경"으로 보는 경로: 워크스페이스·스크립트 아래의 마크다운 외 파일. */
const CODE_PATH = /^(packages|apps|tools|scripts)\/.+/;

export function isCodePath(path: string): boolean {
  return CODE_PATH.test(path) && !path.endsWith('.md');
}

/** 변경 파일 목록(저장소 루트 기준 경로)으로 기록 누락을 판정. */
export function checkRecords(changed: readonly string[]): RecordsReport {
  const set = new Set(changed);
  const errors: string[] = [];
  for (const path of changed) {
    const pkg = API_FILE.exec(path)?.[1];
    if (pkg === undefined) continue;
    const card = `docs/modules/${pkg}.md`;
    if (!set.has(card)) {
      errors.push(
        `${path} changed but ${card} did not — update the module card in the same PR (CLAUDE.md Hard Rule 4)`,
      );
    }
  }
  const warnings: string[] = [];
  if (changed.some(isCodePath) && !set.has('PROGRESS.md')) {
    warnings.push('code changed but PROGRESS.md did not — run the /handoff procedure (CLAUDE.md §3)');
  }
  return { errors, warnings };
}
