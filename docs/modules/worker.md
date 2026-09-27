# apps/worker (Cloudflare Worker)
Layer: — | Depends: core(타입), tile-format(타입) | 배포: `wrangler deploy`

## Purpose
게임 번들(Static Assets) 서빙, `/world/*` R2 프록시(+Cache API, Range), `/api/world/current`, `/api/weather`(선택), `/api/log`(M11), 보안·격리 헤더.
상세: `docs/13-deployment.md`.

## Bindings (Env)
```ts
// src/env.ts — 실제 사용 멤버만 구조적 선언(@cloudflare/workers-types는 DOM lib와 충돌)
interface Env { ASSETS?: AssetsBinding; WORLD?: WorldBucket; CONFIG?: ConfigKv; LIVE_WEATHER?: string; WORLD_BASE_URL?: string }
```
- `WORLD`/`CONFIG`는 **optional**(ADR-0015): 바인딩이 없으면 `/world/*`, `/api/world/current` → `503 {error:"world_storage_unconfigured"}`.
- 공개 함수: `handleRequest(request, env): Promise<Response>`(src/index.ts, 테스트용) + `export default { fetch }`.

## Files
- 현재: wrangler.jsonc(바인딩 생략, staging env), src/index.ts(라우터 + `/api/health`), src/env.ts(Env), src/headers.ts(보안 헤더·json), src/routes/world.ts(바인딩 가드 + TODO 스텁).
- 목표: routes/{world,current,weather,log}.ts, cache.ts, validate.ts(buildId·경로).

## Invariants
- 206 응답은 캐시에 넣지 않음. 404는 5분 캐시.
- 모든 응답에 COOP/COEP/CORP 헤더(headers.ts 단일 출처).
- 비밀값 없음(ODPT 키는 파이프라인 전용).

## Tests
현재: test/index.test.ts — 바인딩 없는 503, health, 405/404, 에셋 위임 + 격리 헤더(순수 Request/Response).
목표: Vitest + miniflare(`@cloudflare/vitest-pool-workers` 도입 시 ADR): 200/206/304/404, 경로 조작 거부, 헤더 존재.

## Status
부분(M00-T03): 배포 가능한 골격 + 바인딩 가드. 바인딩 있을 때의 R2/KV 처리는 501 스텁 → M00-T04 골격, M02-T06 완성.
배포: `.github/workflows/{deploy,preview}.yml`(docs/13-deployment.md §7).
