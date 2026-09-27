// TS 컴파일러 API(구문 트리만)로 파일 첫 줄 책임 주석·export 심볼 추출. see docs/16-context-protocol.md §5
import ts from 'typescript';

export interface FileInfo {
  /** 파일 첫 줄 주석(책임 1줄). 없으면 빈 문자열. */
  readonly summary: string;
  /** export 심볼 이름(소스 순서, 중복 제거). 재수출 `export *`는 `* from '<spec>'`. */
  readonly exports: readonly string[];
}

/** 첫 줄이 `//` 또는 `/**`·`/*` 주석이면 그 텍스트(1줄)를 반환. */
export function extractSummary(text: string): string {
  const firstLine = (text.split('\n', 1)[0] ?? '').trim();
  const line = firstLine.startsWith('#!') ? (text.split('\n', 2)[1] ?? '').trim() : firstLine;
  if (line.startsWith('//')) return line.slice(2).trim();
  if (line.startsWith('/*')) {
    return line
      .replace(/^\/\*+/, '')
      .replace(/\*+\/$/, '')
      .trim();
  }
  return '';
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function isDefaultExport(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : bindingNames(el.name)));
}

function namesOfDeclaration(stmt: ts.Statement): string[] {
  if (ts.isVariableStatement(stmt)) return stmt.declarationList.declarations.flatMap((d) => bindingNames(d.name));
  if (isDefaultExport(stmt)) return ['default'];
  if (
    ts.isFunctionDeclaration(stmt) ||
    ts.isClassDeclaration(stmt) ||
    ts.isInterfaceDeclaration(stmt) ||
    ts.isTypeAliasDeclaration(stmt) ||
    ts.isEnumDeclaration(stmt) ||
    ts.isModuleDeclaration(stmt)
  ) {
    return stmt.name && ts.isIdentifier(stmt.name) ? [stmt.name.text] : [];
  }
  return [];
}

function namesOfExportDeclaration(decl: ts.ExportDeclaration): string[] {
  const spec = decl.moduleSpecifier && ts.isStringLiteral(decl.moduleSpecifier) ? decl.moduleSpecifier.text : '';
  const clause = decl.exportClause;
  if (clause === undefined) return [`* from '${spec}'`];
  if (ts.isNamespaceExport(clause)) return [clause.name.text];
  return clause.elements.map((el) => el.name.text);
}

function exportNames(stmt: ts.Statement): string[] {
  if (ts.isExportDeclaration(stmt)) return namesOfExportDeclaration(stmt);
  if (ts.isExportAssignment(stmt)) return ['default'];
  return hasExportModifier(stmt) ? namesOfDeclaration(stmt) : [];
}

/** 파일 텍스트에서 책임 주석과 export 목록을 추출. 타입 검사 없이 구문 트리만 사용(빠르고 결정론적). */
export function extractFileInfo(fileName: string, text: string): FileInfo {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const seen = new Set<string>();
  for (const stmt of source.statements) {
    for (const name of exportNames(stmt)) seen.add(name);
  }
  return { summary: extractSummary(text), exports: [...seen] };
}
