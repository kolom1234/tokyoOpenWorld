# ADR-0016: 로컬 개발용 wrangler env(`local`)로 R2·KV 시뮬레이션
- Status: Accepted
- Date: 2026-09-27

## Context
M00-T04 수용 기준은 `pnpm dev`에서 Worker가 **로컬 R2**의 테스트 파일을 서빙하는 것이다.
그러나 ADR-0015에 따라 top-level/`env.staging`에는 R2·KV 바인딩이 없다(실제 리소스 미생성 — 바인딩을 넣으면 배포 실패).
`wrangler dev`는 바인딩이 선언돼 있어야 miniflare 로컬 시뮬레이션(`.wrangler/state`)을 붙인다.

## Decision
`apps/worker/wrangler.jsonc`에 로컬 전용 `env.local`(`tokyo-sanpo-local`, `workers_dev:false`)을 추가하고
`r2_buckets`(`sanpo-world-local`)·`kv_namespaces`(`sanpo-config-local`)를 선언한다. `pnpm dev`는 `wrangler dev --env local`을 쓴다.
테스트 데이터는 `pnpm --filter @sanpo/worker seed:local`이 `wrangler r2 object put --local`·`kv key put --local`로 넣는다
(`world/20260927-0000000-00000000/hello.txt`, `CURRENT_BUILD:v1`).

## Consequences
배포 대상(top-level·staging)은 ADR-0015 그대로 — 월드 라우트는 리소스 생성 전까지 503.
`env.local`은 존재하지 않는 리소스를 가리키므로 실수로 `--env local` 배포 시 실패한다(안전).
env 간 상속이 없으므로 `vars` 변경 시 `env.local`도 함께 갱신해야 한다.

## Alternatives
top-level에 `preview_bucket_name`만 두기(배포 시 실제 버킷 필요 → 기각), `@cloudflare/vite-plugin`으로 dev 통합(02 표상 도입 시 ADR — 현 단계엔 프록시로 충분, 보류),
Vitest 전용 miniflare(`@cloudflare/vitest-pool-workers`, M02-T06에서 재검토).
