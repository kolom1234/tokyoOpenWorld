---
description: 로드맵에 새 태스크 블록을 형식에 맞게 추가한다
---
인자: `$ARGUMENTS` = "<마일스톤 번호> <태스크 제목>" (예: "05 Vending machine lighting")

1. `docs/roadmap/M<NN>.md`의 마지막 태스크 번호를 확인해 다음 ID를 부여한다.
2. docs/16-context-protocol.md §7 형식으로 블록을 작성한다:
   `### MNN-TNN — 제목` / `- Pkg:` / `- Depends:` / `- Size:` / `- Read:`(섹션 단위) / `- Files:` / `- Do:`(3–6줄) / `- Accept:`(측정 가능한 기준)
3. 블록은 25줄 이하. 수용 기준이 측정 불가능하면 사용자에게 확인 질문.
4. 마일스톤 목표가 바뀌면 `docs/17-roadmap.md` 표를 갱신.
