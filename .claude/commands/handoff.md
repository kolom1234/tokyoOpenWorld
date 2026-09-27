---
description: 세션 종료/컨텍스트 70% 도달 시 다음 세션을 위한 인계를 수행한다
---
다음을 순서대로 수행하라.

1. 진행 중이던 코드를 컴파일 가능한 상태로 만든다(미완 부분은 `// TODO(<태스크ID>): …` 주석 + 실패하지 않는 스텁).
2. `pnpm check && pnpm test` 실행. 실패하면 원인과 위치를 PROGRESS "Known Issues"에 기록.
3. `PROGRESS.md`를 docs/16-context-protocol.md §2 템플릿대로 갱신:
   - Current Task / Done in this task / In progress(파일·함수·줄) / **Next step(정확히 한 걸음)** / Blockers
   - Recently Completed는 최근 10개만 유지.
4. 공개 API(`src/api.ts`)가 바뀐 패키지가 있으면 `docs/modules/<pkg>.md`의 Public API·Status·Files를 갱신.
5. 새 설계 결정이 있었으면 `docs/adr/NNNN-*.md` 추가(또는 Proposed → Accepted 갱신).
6. 새 데이터/에셋을 추가했으면 `docs/03-data-sources.md`, `content/ATTRIBUTION.json`, `data/sources.lock.json` 갱신 확인.
7. `pnpm codemap` 실행.
8. 커밋: `<type>(<pkg>): <태스크ID> <요약>` (Conventional Commits).
9. 사용자에게 인계 요약 5줄 이하로 보고.
