# ADR-0013: 전 구간 type-only인 import 순환은 depcruise에서 허용
- Status: Accepted
- Date: 2026-09-27

## Context
Hard Rule 4(공개 타입은 `api.ts`에만)와 01-architecture §6(이벤트 목록은 `events.ts`에만)을 동시에 지키면
`api.ts`(EventBus가 EventMap 참조) ↔ `events.ts`(payload가 Vec3d·ModeId 등 참조)가 서로를 `import type` 한다.
`.dependency-cruiser.cjs`는 `tsPreCompilationDeps: true`라 이 타입 순환을 `no-circular` 위반으로 보고했다.

## Decision
`no-circular` 규칙에 `via: { dependencyTypesNot: ['type-only'] }`를 추가: 순환의 **모든** 간선이 type-only일 때만 허용.
값 import가 하나라도 섞인 순환, 순수 값 순환은 여전히 error (도입 시 임시 파일로 두 경우 모두 차단됨을 확인).

## Consequences
type-only 순환은 트랜스파일 시 소거되어 런타임 초기화 순서 문제가 없다. 패키지 간 레이어 규칙(layer:*)은 type-only도 계속 검사한다.

## Alternatives
EventMap을 api.ts로 이동(§6 "events.ts 단일 정의" 위반), EventBus를 제네릭 `EventBus<M>`로(모든 사용처에 타입 인자 강요), 어휘 타입 별도 파일(Hard Rule 4 위반) → 기각.
