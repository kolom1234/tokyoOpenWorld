# apps/worker (Cloudflare Worker)
Layer: — | Depends: core(타입), tile-format(타입) | 배포: `wrangler deploy`

## Purpose
게임 번들(Static Assets) 서빙, `/world/*` R2 프록시(+Cache API, Range), `/api/world/current`, `/api/weather`(선택), `/api/log`(M11), 보안·격리 헤더.
상세: `docs/13-deployment.md`.

## Bindings (Env)
```ts
interface Env { ASSETS: Fetcher; WORLD: R2Bucket; CONFIG: KVNamespace; LIVE_WEATHER: 'true' | 'false'; WORLD_BASE_URL: string }
```

## Files
src/index.ts(라우터), routes/{world,current,weather,log}.ts, headers.ts, cache.ts, validate.ts(buildId·경로).

## Invariants
- 206 응답은 캐시에 넣지 않음. 404는 5분 캐시.
- 모든 응답에 COOP/COEP/CORP 헤더(headers.ts 단일 출처).
- 비밀값 없음(ODPT 키는 파이프라인 전용).

## Tests
Vitest + miniflare(`@cloudflare/vitest-pool-workers` 도입 시 ADR): 200/206/304/404, 경로 조작 거부, 헤더 존재.

## Status
미구현 (M00-T04 골격, M02-T06 완성).
