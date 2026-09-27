// 파일·함수·문서 크기 제한 규칙(순수 함수). see docs/15-conventions.md §2, docs/14-testing-perf.md §5
import ts from 'typescript';

/** docs/15-conventions.md §2 표 + CLAUDE.md 머리말(200줄). */
export const SIZE_LIMITS = {
  sourceFileLines: 400,
  functionLines: 60,
  moduleCardLines: 150,
  docLines: 400,
  claudeMdLines: 200,
} as const;

export interface SizeViolation {
  readonly path: string;
  readonly line: number;
  readonly message: string;
}

/** 끝 개행 뒤 빈 줄은 세지 않는다(에디터 표시 줄 수와 일치). */
export function countLines(text: string): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

export function isTestPath(path: string): boolean {
  return /(^|\/)(test|tests|__tests__)\//.test(path) || /\.(test|spec)\.tsx?$/.test(path);
}

function functionLabel(node: ts.Node, source: ts.SourceFile): string {
  const named = node as ts.Node & { name?: ts.Node };
  if (named.name !== undefined) return named.name.getText(source);
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  const parent = node.parent;
  if (parent !== undefined && ts.isVariableDeclaration(parent)) return parent.name.getText(source);
  if (parent !== undefined && ts.isPropertyAssignment(parent)) return parent.name.getText(source);
  return '(anonymous)';
}

/** 본문 줄 수: 블록이면 `{`·`}` 줄을 뺀 사이 줄(Biome noExcessiveLinesPerFunction과 같은 기준), 식 본문이면 식의 줄 수. */
export function bodyLines(body: ts.Node, source: ts.SourceFile): number {
  const start = source.getLineAndCharacterOfPosition(body.getStart(source)).line;
  const end = source.getLineAndCharacterOfPosition(body.getEnd()).line;
  return ts.isBlock(body) ? Math.max(0, end - start - 1) : end - start + 1;
}

/** 함수 본문을 가진 모든 함수형 노드(중첩 포함)의 줄 수를 검사. */
export function findLongFunctions(path: string, text: string, maxLines: number): SizeViolation[] {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: SizeViolation[] = [];
  const visit = (node: ts.Node): void => {
    const body = ts.isFunctionLike(node) && 'body' in node ? (node.body as ts.Node | undefined) : undefined;
    if (body !== undefined) {
      const lines = bodyLines(body, source);
      if (lines > maxLines) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        out.push({
          path,
          line,
          message: `function ${functionLabel(node, source)} body is ${lines} lines (max ${maxLines})`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

/** TS 소스: 파일 400줄(테스트 포함), 함수 60줄(테스트 제외 — biome.json override와 동일). */
export function checkSourceText(path: string, text: string): SizeViolation[] {
  const out: SizeViolation[] = [];
  const lines = countLines(text);
  if (lines > SIZE_LIMITS.sourceFileLines) {
    out.push({ path, line: 1, message: `file is ${lines} lines (max ${SIZE_LIMITS.sourceFileLines})` });
  }
  if (!isTestPath(path)) out.push(...findLongFunctions(path, text, SIZE_LIMITS.functionLines));
  return out;
}

/** 마크다운 문서별 제한. 대상이 아니면 null. docs/generated/**는 자동 생성물이라 제외. */
export function docLimitFor(path: string): number | null {
  if (path === 'CLAUDE.md') return SIZE_LIMITS.claudeMdLines;
  if (!path.startsWith('docs/') || !path.endsWith('.md') || path.startsWith('docs/generated/')) return null;
  return path.startsWith('docs/modules/') ? SIZE_LIMITS.moduleCardLines : SIZE_LIMITS.docLines;
}

export function checkDocText(path: string, text: string): SizeViolation[] {
  const limit = docLimitFor(path);
  const lines = countLines(text);
  if (limit === null || lines <= limit) return [];
  return [{ path, line: 1, message: `document is ${lines} lines (max ${limit})` }];
}
