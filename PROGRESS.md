# PROGRESS
Updated: 2026-09-27 (session #1 — M00-T01 완료)

## Current Milestone: M00 — Foundation
## Current Task: M00-T02 @sanpo/core (not started)
- Done in this task: –
- In progress: –
- Next step (정확히 한 걸음): `docs/roadmap/M00.md`의 M00-T02 블록과 `docs/modules/core.md`를 읽고 `packages/core/src/api.ts`에 공유 어휘 타입(Vec3d/Quat/Result/CellKey…)부터 작성
- Blockers: 없음

## Recently Completed
- M00-T01 모노레포 골격 — 11 packages + apps/{game,worker} + tools/{pipeline,codemap}, biome/tsc/depcruise/vitest 설정, ADR-0011(Node ≥22.12), `/resume`→`/sanpo-resume` 개명 (2026-09-27)
- 설계 문서 세트 v1 (CLAUDE.md, docs/00–17, docs/roadmap/M00–M11, docs/modules/*, docs/adr/0001–0010, schemas/*) — 2026-09-27

## Known Issues
- [tools] `pnpm codemap`은 스텁(아무 것도 안 함) → M00-T03에서 생성기 구현. `pnpm pipeline`도 스텁 → M01.
- [root] 외부 런타임 의존(three, jolt 등)은 아직 미설치 — 각 패키지 태스크에서 02 표 버전으로 정확 고정해 추가.
- [root] CI 없음 → M00-T03 (Node 22/24 매트릭스 권장, ADR-0011).

## Decisions Pending
- ADR-0006 깊이 버퍼 전략 → M01-T06
- ADR-0007 PLATEAU 리더(nusamai vs SAX) → M01-T02
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)

## Pre-flight (사람이 해야 할 일)
- [ ] Cloudflare 계정: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개, API 토큰
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [ ] 파이프라인 빌드 머신(16 GB+ RAM, Docker)
- [ ] GitHub 저장소 + Actions 시크릿
