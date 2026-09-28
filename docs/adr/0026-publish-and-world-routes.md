# ADR-0026: 월드 퍼블리시(R2·KV)와 `/world/*` 캐시 정책 (M02-T06)
- Status: Accepted
- Date: 2026-09-29

## Context
04 §4.7은 "S3 호환 API로 `world/<buildId>/**` 업로드(멀티파트·동시성 16) → 검증 → KV `CURRENT_BUILD:v<fv>`, 7일 뒤 gc(현재+직전 유지)"를,
13 §7은 "R2 S3 키는 빌드 머신 로컬에만"을 정했다. R2 S3 액세스 키는 대시보드에서 사람이 발급해야 하는데, 빌드 머신에는 wrangler용
`CLOUDFLARE_API_TOKEN`(R2·KV 권한)이 이미 있다. 또 gc에 필요한 객체 목록 API, staging/production KV 분리, 엣지 캐시의 Range·조건부 처리,
M00-T04 이후 미뤄 둔 miniflare 검증이 정해지지 않았다.

## Decision
1. **리소스**(2026-09-29 wrangler로 생성, 위치 힌트 apac): R2 `sanpo-world-prod`·`sanpo-world-dev`, KV `SANPO_CONFIG`(prod)·`SANPO_CONFIG_STAGING`.
   staging Worker = dev 버킷 + staging KV(포인터가 prod와 섞이지 않게). 바인딩은 `apps/worker/wrangler.jsonc`가 단일 출처 — 퍼블리시 CLI가 여기서 읽는다.
2. **업로더 2종**: `s3`(R2_ACCESS_KEY_ID·SECRET 있으면 자동 — SigV4 자체 구현(node:crypto, AWS 테스트 벡터 일치), 단일 PUT ≤ 64 MiB·초과 시 멀티파트 16 MiB,
   PUT 후 HEAD로 크기 검증) / `api`(키 없으면 — Cloudflare REST `accounts/{id}/r2/buckets/{b}/objects/{key}`, wrangler `r2 object put --remote`와 같은 엔드포인트,
   API 토큰). 둘 다 동시성 16·재시도 3회(0.5→1→2 s). `api`는 HEAD가 없어 **배포된 Worker `/world` HEAD로 전 파일 크기 검증**(`--verify-url`, `--verify-only`).
   새 의존성 없음(@aws-sdk 대신 SigV4 ≈ 80줄).
3. **KV 레이아웃**: `CURRENT_BUILD:v<fv>` = 활성 buildId(업로드·검증 뒤에만 `--set-current`), `BUILDS:v<fv>` = [{buildId, publishedAt, files, bytes}],
   `BUILD_FILES:<buildId>` = 경로 목록 + 버킷의 `world/<buildId>/manifest.json`(sha256 포함). gc는 이 목록으로 지운다(객체 목록 API 불필요).
4. **gc**: 현재 + 직전 1개(현재보다 먼저 퍼블리시된 것 중 가장 최근 = 롤백 대상) + 7일 이내 유지. 기본은 목록만, `--apply`로 삭제.
5. **`/world/*` 엣지 캐시는 평범한 GET만**: Range·If-None-Match 등이 있으면 캐시를 건너뛰고 R2가 206/304/412를 직접 만든다(캐시 구현별 Range 동작 차이 회피).
   클라이언트 셀 fetch는 평범한 GET이라 캐시를 탄다. 진단 헤더 `X-Sanpo-Cache: HIT|MISS|BYPASS`.
6. **검증 HEAD는 `Accept-Encoding: identity`**: 엣지가 JSON(world.json)을 압축하면 Content-Length가 빠진다.
7. **miniflare 통합 테스트**: `apps/worker/test/miniflare.test.ts`가 실제 `wrangler dev --env local`을 격리 persist로 띄워 R2·KV를 시드하고 HTTP로 검사
   (Windows는 taskkill /T로 workerd까지 종료). `SANPO_SKIP_MINIFLARE=1`로 건너뜀. `@cloudflare/vitest-pool-workers`는 도입하지 않음.
8. `/api/weather`: LIVE_WEATHER=true일 때만 Open-Meteo(도쿄역, m/s) → 최소 필드 + WMO 코드, 10분 캐시, 상류 오류 502.

## Consequences
- 실측(2026-09-29): MVP 빌드 473 파일·212 MB → `sanpo-world-dev` 38.7 s(api 업로더, 16 동시). `wrangler dev --env staging --remote`(실제 바인딩)로
  current 200, 셀 200(MISS → HIT)·Range 206·If-None-Match 304·404·400, 전 파일 HEAD 크기 473/473 일치.
- S3 키가 생기면 같은 명령이 `s3`로 바뀐다(HEAD 검증 내장). 키 발급은 사람(대시보드 R2 → API 토큰, Object Read & Write, 두 버킷).
- `api` 업로더는 R2 객체 REST(공개 문서가 적은 엔드포인트)에 의존 → 바뀌면 wrangler도 같이 바뀌므로 wrangler 업그레이드 때 확인.
