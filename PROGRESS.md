# PROGRESS
Updated: 2026-09-27 (session #3 — M00-T03 완료, PR CI 확인 대기)

## Current Milestone: M00 — Foundation
## Current Task: M00-T04 Boot skeleton (not started)
- Done in this task: –
- In progress: –
- Next step (정확히 한 걸음): M00-T03 PR의 `ci.yml` 녹색 확인 후, `docs/roadmap/M00.md`의 M00-T04 블록을 읽고 `apps/game`에 Vite 8.3.1 추가 → `apps/game/package.json`의 placeholder `build` 스크립트를 `vite build`로 교체(동시에 `apps/game/placeholder/` 삭제, `public/_headers` 추가)
- Blockers: 없음 (R2/KV 없음 → Worker 월드 라우트는 503 비활성 상태로 진행 가능, ADR-0015)

## Recently Completed
- M00-T03 CI & codemap — `tools/codemap`(TS 컴파일러 API, 결정론 출력, `--check`), `scripts/check-{size,asset-size,records}.ts`, `.github/workflows/{ci,preview,deploy}.yml` + `actions/setup` + `scripts/smoke.sh`, PR 템플릿, 최소 Worker(바인딩 optional, `/api/health`), 게임 placeholder 빌드, core `createScheduler`/`supervise` 60줄 이하로 분할(동작 동일). ADR-0014(tsconfig.node.json + @types/node 22), ADR-0015(R2/KV 바인딩 optional) (2026-09-27)
- M00-T02 @sanpo/core — api.ts 공유 어휘 타입, events.ts EventMap, internal/{event-bus,logger,scheduler,rng,hash,result,cell-key,math,config,worker-supervisor}.ts, 테스트 7파일/46건. ADR-0012(hash32/rng 고정), ADR-0013(type-only 순환 허용, depcruise `no-circular` 수정) (2026-09-27)
- M00-T01 모노레포 골격 — 11 packages + apps/{game,worker} + tools/{pipeline,codemap}, biome/tsc/depcruise/vitest 설정, ADR-0011(Node ≥22.12), `/resume`→`/sanpo-resume` 개명 (2026-09-27)
- 설계 문서 세트 v1 (CLAUDE.md, docs/00–17, docs/roadmap/M00–M11, docs/modules/*, docs/adr/0001–0010, schemas/*) — 2026-09-27

## Known Issues
- [game] `pnpm --filter @sanpo/game build`는 `placeholder/index.html`을 dist로 복사하는 임시 스크립트 → M00-T04에서 `vite build`로 교체.
- [worker] R2/KV 바인딩이 있어도 `/world/*`, `/api/world/current`는 501 스텁(`TODO(M00-T04)`, src/routes/world.ts). 정적 에셋(`/`)은 Worker를 거치지 않아 COOP/COEP 헤더 없음 → M00-T04 `public/_headers`.
- [ci] Playwright 스모크 미포함(게임 부트 전) → M00-T04 이후 `ci.yml` check 잡에 추가(TODO 주석 위치).
- [ci] Biome `noExcessiveLinesPerFunction`이 일부 함수(예: 객체 반환 팩토리)를 놓침 → `scripts/check-size.ts`가 정본(docs/15 §2).
- [tools] `pnpm pipeline`은 스텁 → M01.
- [root] 외부 런타임 의존(three, jolt 등)은 아직 미설치 — 각 패키지 태스크에서 02 표 버전으로 정확 고정해 추가.

## Notes (M00-T03 조사 결과)
- **세션 종료 시 `pnpm codemap` 자동 실행 훅: 적용 안 함.** Claude Code `SessionEnd`는 clear/logout/입력 종료 등에서 발화하고 공유 1.5 s 예산·차단 불가. 클라우드 세션은 명시적 종료 없이 비활성 VM 회수로 끝나 발화가 보장되지 않고, 발화해도 결과가 커밋·푸시되지 않은 채 컨테이너와 함께 사라진다. 대안: `/handoff` 7단계(수동) + CI `records` 잡(커밋본 ≠ 재생성 결과면 실패)이 누락을 막는다. 필요 시 `Stop` 훅(턴마다 codemap 갱신, `stop_hook_active` 가드)을 별도 검토.
- 프리뷰 URL은 staging Worker의 버전(`pr-<N>` 별칭)이며 staging 바인딩을 공유한다.

## Decisions Pending
- ADR-0006 깊이 버퍼 전략 → M01-T06
- ADR-0007 PLATEAU 리더(nusamai vs SAX) → M01-T02
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)

## Pre-flight (사람이 해야 할 일)
- [x] GitHub 저장소 + Actions 시크릿(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [ ] **M00-T03 PR 병합 전**: GitHub Environment `production` 생성 + Required reviewers 지정(없으면 production 잡이 배포 전 실패하도록 가드됨)
- [ ] Cloudflare 대시보드 Workers & Pages 1회 방문 → workers.dev 서브도메인 등록 확인(없으면 URL·프리뷰 미생성)
- [ ] Cloudflare: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개 → 생성 후 `apps/worker/wrangler.jsonc` 주석대로 바인딩 추가(ADR-0015)
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [ ] 파이프라인 빌드 머신(16 GB+ RAM, Docker)
