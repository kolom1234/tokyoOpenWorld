# 16 — Context Protocol (AI 세션 연속성 규칙)

> 목표: 어느 세션이 어느 시점에 끊겨도 **다음 세션이 10분 안에, 전체 컨텍스트의 15% 이하만 읽고** 정확히 이어서 작업한다.

## 1. 문서 계층 (읽는 양을 계층으로 제한)
| 계층 | 파일 | 크기 한도 | 읽는 시점 |
|---|---|---|---|
| L0 | `CLAUDE.md` | 200줄 | 항상 (자동 로드) |
| L1 | `PROGRESS.md` | 150줄 | 세션 시작 시 항상 |
| L2 | `docs/roadmap/MNN.md`의 **해당 태스크 블록** | 블록당 ≤ 25줄 | 작업 시작 시 (grep `### M03-T04`) |
| L3 | `docs/modules/<pkg>.md` | 150줄 | 해당 패키지 수정 시 |
| L4 | `docs/NN-*.md`의 지정 섹션 | 섹션 단위 | 태스크 블록 `Read:`에 명시된 것만 |
| L5 | 소스 코드 | 파일 ≤ 400줄 | 수정 대상 + 직접 의존만 |
| 참조 | `docs/generated/CODEMAP.md` | 자동 생성 | grep 전용 (전체 read 금지) |

## 2. PROGRESS.md 형식 (고정 템플릿)
```md
# PROGRESS
Updated: 2026-10-03 (session #12)
## Current Milestone: M03 — Rendering Realism I
## Current Task: M03-T04 facade shader (in progress)
- Done in this task: floor/bay SDF (packages/render/src/internal/materials/facade/grid.ts)
- In progress: interior mapping — `facade/interior.ts` fn `interiorUV()` 절반 구현, TODO 주석 위치 L88
- Next step (정확히 한 걸음): interior cubemap 배열 로더를 `materials/registry.ts`에 추가
- Blockers: 없음
## Recently Completed (최근 10개만, 오래된 것은 삭제 — git log가 원본)
- M03-T03 sun & CSM (2026-10-02)
## Known Issues
- [render] WebGL 폴백에서 SSR 비활성 시 유리 반사가 과도 → M03-T09
## Decisions Pending
- reversed-Z 지원 여부 확인 필요 (ADR-0006 draft)
```

## 3. 세션 운영 규칙
1. **읽기 전에 grep**: 문서·코드 모두 `grep -n "## " file`로 목차부터 보고 필요한 섹션만 `Read(offset, limit)`.
2. **한 세션 = 한 태스크(또는 그 일부)**. 태스크가 크면 롤맵의 하위 단계(`M03-T04.a/.b`)로 쪼개 PROGRESS에 기록.
3. **컨텍스트 70% 규칙**: 사용량이 약 70%에 이르면 새 작업을 시작하지 말고 `/handoff` 수행.
4. **추측 금지**: 기존 코드 동작이 불확실하면 테스트를 실행해 확인. 외부 API는 `node_modules`의 `.d.ts` 확인.
5. **대형 파일 금지 목록**(`.claude/settings.json` deny): `data/{raw,normalized,derived,build}/**`, `**/dist/**`, `**/*.glb`, `**/*.tkc`, `**/*.ktx2`, `**/*.pmtiles`, `pnpm-lock.yaml`, `perf-results/**`. 성능 결과는 `docs/generated/perf-latest.md`(자동 요약)만 읽는다.
6. **서브에이전트 활용**: 넓은 탐색(여러 패키지 grep)은 탐색 서브에이전트에 위임하고 결론만 받는다.

## 4. 모듈 카드 형식 (`docs/modules/<pkg>.md`, 고정 템플릿)
```md
# @sanpo/<pkg>
Layer: L2 | Depends: core, geo | Used by: apps/game
## Purpose (3줄 이내)
## Public API (api.ts 요약 — 시그니처만)
## Invariants (깨면 안 되는 규칙)
## Files (파일 → 책임 1줄)
## Tests (무엇을 어떻게)
## Status (구현 완료/부분/미구현 목록)
## Gotchas (함정·주의)
```
- 공개 API가 바뀌는 커밋은 모듈 카드 변경을 **반드시 포함**(PR 체크).

## 5. CODEMAP 자동 생성 (`tools/codemap`)
- TypeScript 컴파일러 API로 각 패키지의 파일 목록 + export 심볼 + 첫 줄 책임 주석을 추출 → `docs/generated/CODEMAP.md`.
- 형식: `packages/render/src/internal/materials/facade/grid.ts — floor/bay SDF | exports: facadeGrid, FacadeGridParams`
- `pnpm codemap`을 handoff 때마다 실행. 사람이 편집하지 않음. 타임스탬프 없음(결정론) — CI `records` 잡이 재생성 결과와 커밋본이 다르면 실패시킨다(`pnpm codemap --check`로 로컬 확인).
- 대상: `packages/*/src`, `apps/*/src`, `tools/*/src`, `scripts/**` (테스트·`.d.ts` 제외).
- CI 기록 검사(`scripts/check-records.ts`): `packages/<pkg>/src/api.ts` 변경 시 `docs/modules/<pkg>.md` 미변경이면 실패, 코드 변경 PR에 `PROGRESS.md` 미변경이면 경고.
- 세션 종료 훅(SessionEnd)으로 자동 실행하지 않는다 — 클라우드 세션은 VM 회수로 끝나 훅 실행·결과 커밋이 보장되지 않음(PROGRESS 메모, M00-T03).

## 6. ADR (Architecture Decision Record)
- 위치 `docs/adr/NNNN-title.md`, 형식: Status / Context / Decision / Consequences / Alternatives (각 5줄 이내 권장).
- 기존 결정을 뒤집을 때는 새 ADR로 "Supersedes NNNN".

## 7. 태스크 블록 형식 (`docs/roadmap/MNN.md`)
```md
### M03-T04 — Procedural facade shader
- Pkg: render | Depends: M03-T01, M02-T05 | Size: L
- Read: docs/07-rendering.md §4–5, docs/modules/render.md, docs/05-tile-format.md §4(buildings.mesh)
- Files: packages/render/src/internal/materials/facade/{grid,walls,windows,interior,night}.ts
- Do: …(3–6줄)
- Accept: …(측정 가능한 기준)
```

## 8. 슬래시 커맨드 (`.claude/commands/`)
| 커맨드 | 역할 |
|---|---|
| `/sanpo-resume` | CLAUDE.md → PROGRESS.md → 태스크 블록 → 모듈 카드 순서로 읽고 계획 3줄 제시 |
| `/handoff` | PROGRESS 갱신, 모듈 카드·ADR 확인, codemap 재생성, 테스트, 커밋 |
| `/new-task` | 로드맵에 새 태스크 블록 추가(형식 강제) |
