# ADR-0010: Docs-first development & AI context protocol
- Status: Accepted
- Date: 2026-09-27

## Context
AI 컨텍스트 한도로 세션이 자주 끊겨도 개발을 지속해야 함.

## Decision
CLAUDE.md(200줄) + PROGRESS.md + 태스크 블록 + 모듈 카드 + CODEMAP 계층 구조, 파일 400줄 제한, 공개 API 변경 시 카드 동시 갱신, /sanpo-resume·/handoff 커맨드.

## Consequences
문서 유지 비용 발생 → PR 게이트로 강제.

## Alternatives
단일 대형 설계 문서(컨텍스트 과다 소모로 기각).
