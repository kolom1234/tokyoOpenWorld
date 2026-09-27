# ADR-0011: Node 24 LTS 목표 + Node ≥22.12 허용
- Status: Accepted
- Date: 2026-09-27

## Context
02-tech-stack은 Node 24 LTS를 고정했지만, 원격 개발 세션(Claude Code 클라우드 컨테이너)은 Node 22.22.2만 제공한다.
도구 체인 하한: Vite 8 `^20.19 || >=22.12`, Vitest 5 `^22.12 || ^24 || >=26`, dependency-cruiser 18 `^22 || ^24 || >=26`. 모두 Node 22.12+에서 동작.

## Decision
루트 `package.json` `engines.node = ">=22.12"`, `.nvmrc = 24`(CI·로컬 기본은 Node 24 LTS 유지). Node 24 전용 API는 사용하지 않는다.
툴 스크립트(`pnpm codemap`, `pnpm pipeline`)는 Node 내장 type-stripping(22.18+ 기본 활성)으로 `.ts`를 직접 실행한다.

## Consequences
Node 22/24 양쪽에서 `pnpm i && pnpm check && pnpm test` 통과해야 함 → M00-T03 CI에 22.x 매트릭스 추가 권장.
Node 22 유지보수 종료(2027-04) 시 하한을 24로 올리는 새 ADR 작성.

## Alternatives
engines를 `>=24`로 강제(클라우드 세션에서 설치 실패 → 기각). 세션마다 Node 24 수동 설치(재현성 낮음 → 기각).
