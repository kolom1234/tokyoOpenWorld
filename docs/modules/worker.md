# apps/worker (Cloudflare Worker)
Layer: — | Depends: core(타입), tile-format(타입) | 배포: `wrangler deploy`

## Purpose
게임 번들(Static Assets) 서빙, `/world/*` R2 프록시(+Cache API, Range), `/api/world/current`, `/api/weather`(선택), `/api/log`(M11), 보안·격리 헤더.
상세: `docs/13-deployment.md`.

## Bindings (Env)
```ts
// src/env.ts — 실제 사용 멤버만 구조적 선언(@cloudflare/workers-types는 DOM lib와 충돌)
interface Env { ASSETS?: AssetsBinding; WORLD?: WorldBucket; CONFIG?: ConfigKv; LIVE_WEATHER?: string; WORLD_BASE_URL?: string }
// WorldBucket = R2Bucket의 get(key, { range, onlyIf }: Headers)·head(key), WorkerContext = waitUntil
```
- `WORLD`/`CONFIG`는 **optional**(ADR-0015): 바인딩이 없으면 `/world/*`, `/api/world/current` → `503 {error:"world_storage_unconfigured"}`.
- 공개 함수: `handleRequest(request, env, ctx?): Promise<Response>`(src/index.ts, 테스트용) + `export default { fetch }`.
- 로컬: `env.local`(wrangler dev 전용)에만 R2/KV 바인딩 → miniflare 시뮬레이션, `seed:local`로 테스트 파일·`CURRENT_BUILD:v1` 주입(ADR-0016).

## Files
- 현재: wrangler.jsonc(배포 env 바인딩 생략, `env.local` dev 전용), src/index.ts(라우터 + `/api/health`), src/env.ts(Env), src/headers.ts(보안 헤더·json·`storageUnconfigured`), src/validate.ts(buildId·경로·fv), src/cache.ts(`caches.default` 접근), src/routes/current.ts(`/api/world/current` KV), src/routes/world.ts(`/world/*` 캐시→R2 Range·조건부·HEAD).
- 목표: routes/{weather,log}.ts 추가.

## Invariants
- 206 응답은 캐시에 넣지 않음. 404는 5분 캐시.
- 모든 응답에 COOP/COEP/CORP 헤더(headers.ts 단일 출처).
- 비밀값 없음(ODPT 키는 파이프라인 전용).

## Tests
현재: test/index.test.ts — 바인딩 없는 503, health, 405/404, 에셋 위임 + 격리 헤더. test/world.test.ts — 인메모리 R2/KV로 current 200/400/404/500, world 200/206/304/HEAD/404/400, 경로 조작 거부.
목표: 실제 miniflare(`@cloudflare/vitest-pool-workers` 도입 시 ADR)로 엣지 캐시 포함 검증(M02-T06).

## Status
M00-T04: 바인딩 있을 때 `/api/world/current`·`/world/*`(캐시·Range·조건부) 동작, 로컬 R2로 검증. 배포 env는 리소스 생성 전까지 503(ADR-0015). 완성(캐시 정책 튜닝·miniflare 테스트) → M02-T06.
배포: `.github/workflows/{deploy,preview}.yml`(docs/13-deployment.md §7).
