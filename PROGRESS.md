# PROGRESS
Updated: 2026-09-27 (session #0 — 설계 완료, 구현 전)

## Current Milestone: M00 — Foundation
## Current Task: M00-T01 Monorepo scaffold (not started)
- Done in this task: –
- In progress: –
- Next step (정확히 한 걸음): `docs/roadmap/M00.md`의 M00-T01 블록을 읽고 루트 `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`부터 생성
- Blockers: 없음

## Recently Completed
- 설계 문서 세트 v1 (CLAUDE.md, docs/00–17, docs/roadmap/M00–M11, docs/modules/*, docs/adr/0001–0010, schemas/*) — 2026-09-27

## Known Issues
- (없음)

## Decisions Pending
- ADR-0006 깊이 버퍼 전략 → M01-T06
- ADR-0007 PLATEAU 리더(nusamai vs SAX) → M01-T02
- 라이선스 ⚠ 항목 → M11-T05 (단, 공개 배포 전 필수)

## Pre-flight (사람이 해야 할 일)
- [ ] Cloudflare 계정: R2 버킷 2개(`sanpo-world-prod`, `sanpo-world-dev`), KV 1개, API 토큰
- [ ] ODPT 개발자 등록(도쿄메트로 GTFS 키) — M07-T02 전까지
- [ ] 파이프라인 빌드 머신(16 GB+ RAM, Docker)
- [ ] GitHub 저장소 + Actions 시크릿
