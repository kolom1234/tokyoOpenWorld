// CODEMAP.md 마크다운 렌더링(패키지별 그룹, 타임스탬프 없음 → 재생성 결과가 결정론적). see docs/16-context-protocol.md §5
import type { FileInfo } from './extract.ts';

export interface CodemapEntry extends FileInfo {
  /** 저장소 루트 기준 상대경로(`/` 구분). */
  readonly path: string;
}

const HEADER = [
  '# CODEMAP',
  '',
  '<!-- 자동 생성 파일 — `pnpm codemap`(tools/codemap)으로만 갱신한다. 직접 편집 금지. see docs/16-context-protocol.md §5 -->',
  '',
  '> 형식: `경로 — 책임(파일 첫 줄 주석) | exports: 심볼…`. **grep으로만 사용**(전체 read 금지). 테스트 파일은 제외.',
];

/** `packages/core/src/x.ts` → `packages/core`, `scripts/x.ts` → `scripts`. */
export function groupOf(path: string): string {
  const parts = path.split('/');
  if (parts[0] === 'packages' || parts[0] === 'apps' || parts[0] === 'tools') return parts.slice(0, 2).join('/');
  return parts[0] ?? path;
}

export function renderLine(entry: CodemapEntry): string {
  const summary = entry.summary === '' ? '' : ` — ${entry.summary}`;
  const exports = entry.exports.length === 0 ? '' : ` | exports: ${entry.exports.join(', ')}`;
  return `- \`${entry.path}\`${summary}${exports}`;
}

/** 경로 정렬된 엔트리를 받아 CODEMAP.md 전체 텍스트를 만든다(끝 개행 1개). */
export function renderCodemap(entries: readonly CodemapEntry[]): string {
  const lines = [...HEADER, `> 파일 ${entries.length}개.`];
  let current = '';
  for (const entry of entries) {
    const group = groupOf(entry.path);
    if (group !== current) {
      lines.push('', `## ${group}`);
      current = group;
    }
    lines.push(renderLine(entry));
  }
  return `${lines.join('\n')}\n`;
}
