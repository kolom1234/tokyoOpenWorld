# ADR-0014: Node 툴·스크립트는 별도 tsconfig(`tsconfig.node.json`) + `@types/node` 22로 타입 검사
- Status: Accepted
- Date: 2026-09-27

## Context
M00-T03에서 `tools/codemap`, `scripts/check-*.ts`가 `node:fs` 등 Node API를 쓴다. 루트 `tsconfig.json`은 `types: []` + DOM lib(브라우저 패키지용)이라 Node 타입이 없고,
단일 프로그램에 `@types/node`를 넣으면 브라우저 패키지에도 Node 전역(`setTimeout` 반환 타입 등)이 새어 든다.

## Decision
`tsconfig.node.json`(lib ES2024, `types: ["node"]`, include `tools/*/{src,test}`, `scripts`)을 추가하고 루트 `tsconfig.json`에서 tools를 뺀다. `pnpm typecheck` = 두 프로젝트 순차 실행.
`@types/node`는 engines 하한인 **22.x**(22.20.4)로 고정 → Node 24 전용 API(`import.meta.main` 등)를 타입 단계에서 차단(ADR-0011).

## Consequences
브라우저·Worker 코드에 Node 타입이 섞이지 않는다. tools가 브라우저 패키지를 import하면 두 설정의 lib 차이로 오류가 날 수 있으나, 현재 tools는 `@sanpo/core`(DOM 비의존) 외 사용 없음.

**보정(2026-09-27, M01-T02)**: `@sanpo/core` 공개 타입은 `Transferable`·`Worker`(DOM lib)를 참조한다 — 파이프라인이 core·geo를 처음 런타임 import하면서 드러남. `tsconfig.node.json`의 lib를 `["ES2024", "DOM"]`으로 넓힌다(방향은 유지: 브라우저 설정에 Node 타입은 여전히 없음). 대가: Node 툴 코드에서 DOM 전역(`document` 등)이 타입상 보이므로 실수는 리뷰로 막는다.

## Alternatives
파일마다 `/// <reference types="node" />`(단일 프로그램 전체로 전파 → 기각), 패키지별 tsconfig + project references(현 규모에 과함 → 보류).
