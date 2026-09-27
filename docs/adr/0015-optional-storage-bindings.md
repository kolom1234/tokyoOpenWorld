# ADR-0015: R2·KV 바인딩은 선택 — 없으면 월드 라우트 503으로 비활성
- Status: Accepted
- Date: 2026-09-27

## Context
배포 파이프라인(M00-T03)을 먼저 녹색으로 만들고 싶지만 R2 버킷(`sanpo-world-*`)·KV(`SANPO_CONFIG`)는 아직 없다.
wrangler는 존재하지 않는 버킷/네임스페이스 바인딩이 있으면 배포에 실패한다.

## Decision
`wrangler.jsonc`에서 `r2_buckets`/`kv_namespaces`를 생략하고 `Env.WORLD`/`Env.CONFIG`를 optional로 선언.
바인딩이 없으면 `/world/*`, `/api/world/current`는 `503 {error:"world_storage_unconfigured"}`(no-store), `/api/health`는 바인딩 유무(boolean)만 보고.

## Consequences
리소스 없이도 staging/production 배포·프리뷰가 동작. 클라이언트(M00-T04~)는 503 코드를 "월드 데이터 준비 중"으로 처리해야 한다.
리소스 생성 후 top-level과 `env.staging` 양쪽에 바인딩을 추가하면 코드 변경 없이 활성화된다.

## Alternatives
더미 버킷·KV 생성(사람 작업·비용 관리 부담), 바인딩별 별도 wrangler 설정 파일(드리프트 위험) → 기각.
