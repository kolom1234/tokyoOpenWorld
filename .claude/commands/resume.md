---
description: 새 세션에서 작업을 정확히 이어받는다 (CLAUDE.md → PROGRESS → 태스크 블록 → 모듈 카드)
---
다음 순서로 **필요한 부분만** 읽고 작업을 재개하라. 문서 통독 금지.

1. `CLAUDE.md`는 이미 로드됨. `PROGRESS.md`를 읽는다.
2. "Current Task"의 태스크 ID(예: M03-T04)로 `docs/roadmap/M<NN>.md`에서 `### <ID>` 블록만 grep 후 해당 부분만 Read.
3. 블록의 `Read:` 항목에 나열된 문서 섹션만 읽는다(`grep -n "^## " <file>`로 목차 확인 후 offset/limit 지정).
4. 수정 대상 패키지의 `docs/modules/<pkg>.md`를 읽는다.
5. PROGRESS의 "Next step"에 적힌 파일·함수부터 확인한다(필요 시 `docs/generated/CODEMAP.md`를 grep).
6. 사용자에게 3줄로 보고: (a) 현재 태스크와 진행 상태 (b) 이번 세션 목표 한 가지 (c) 첫 번째로 수정할 파일.
그 후 바로 작업을 시작한다. $ARGUMENTS 가 있으면 그 태스크 ID를 우선한다.
