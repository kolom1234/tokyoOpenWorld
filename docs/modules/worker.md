# apps/worker (Cloudflare Worker)
Layer: — | Depends: core(타입), tile-format(타입) | 배포: `wrangler deploy`

## Purpose
게임 번들(Static Assets) 서빙, `/world/*` R2 프록시(+Cache API, Range), `/api/world/current`, `/api/weather`(선택), `/api/log`(M11), 보안·격리 헤더.
상세: `docs/13-deployment.md`.

## Bindings (Env)
```ts
// src/env.ts — 실제 사용 멤버만 구조적 선언(@cloudflare/workers-types는 DOM lib와 충돌)
interface Env { ASSETS?: AssetsBinding; WORLD?: WorldBucket; CONFIG?: ConfigKv; LIVE_WEATHER?: string; WORLD_BASE_URL?: string; LOGS?: LogDataset;
  LOG_LIMITER?: RateLimiter; DEPLOY_ENV?: string }
// LogDataset = AnalyticsEngineDataset.writeDataPoint({indexes, blobs, doubles}) — M11-T03 오류 보고(없으면 /api/log 204만)
// RateLimiter = Workers Rate Limiting limit({key}) → {success} — /api/log IP 해시 키(F03, ADR-0103), DEPLOY_ENV = production|staging|local
// WorldBucket = R2Bucket의 get(key, { range, onlyIf }: Headers)·head(key), WorkerContext = waitUntil
```
- `WORLD`/`CONFIG`는 **optional**(ADR-0015): 바인딩이 없으면 `/world/*`, `/api/world/current` → `503 {error:"world_storage_unconfigured"}`.
- 공개 함수: `handleRequest(request, env, ctx?): Promise<Response>`(src/index.ts, 테스트용) + `export default { fetch }`.
- 로컬: `env.local`(wrangler dev 전용)에만 R2/KV 바인딩 → miniflare 시뮬레이션, `seed:local`로 테스트 파일·`CURRENT_BUILD:v1` 주입(ADR-0016).

## Files
- 현재: wrangler.jsonc(prod = sanpo-world-prod + SANPO_CONFIG, staging = sanpo-world-dev + SANPO_CONFIG_STAGING, `env.local` dev 전용), src/index.ts(라우터 + `/api/health`), src/env.ts(Env), src/headers.ts(보안 헤더·json·`storageUnconfigured`), src/validate.ts(buildId·경로·fv), src/range.ts(Range 엄격 해석·만족 판정·조건부 헤더 고르기, F07), src/cache.ts(`caches.default` 접근), src/routes/current.ts(`/api/world/current` KV + 엣지 30 s), src/routes/world.ts(`/world/*` 평범한 GET만 엣지 캐시 → R2, Range·조건부는 R2 직접, HEAD, `X-Sanpo-Cache`), src/routes/weather.ts(`/api/weather`, LIVE_WEATHER), src/routes/log.ts(`POST /api/log` — 허용 필드·지우기·4 KB, AE 한 점, M11-T03 ADR-0098), src/log-guard.ts(415 Content-Type·403 Origin 허용 목록·429 IP 해시 요청 제한·수신 바이트 본문 상한 `readLimitedText`, ADR-0103).

## Invariants
- 206 응답은 캐시에 넣지 않음. Range·조건부 요청은 캐시를 거치지 않음(ADR-0026). 검증된 경로의 404는 엣지에도 5분 캐시, `/world/*` 쿼리 = 400, 캐시 키 = 출처 + 경로, `/api/world/current`는 엣지 30 s(키 = fv, ADR-0103).
- 모든 응답에 COOP/COEP/CORP 헤더(headers.ts 단일 출처). 문서 정책 헤더(CSP·Referrer·Permissions)는 game `public/_headers`, HSTS는 Cloudflare 존 설정(ADR-0102).
- `/api/health` = `{"ok":true}`만 — 바인딩·버전 등 내부 구성 비노출(ADR-0102).
- 비밀값 없음(ODPT 키는 파이프라인 전용).
- 사용자 입력(Range·조건부 헤더·경로)으로 5xx 없음: 문법 오류 Range 무시(200), 만족 불가 416 `bytes */<size>`, 처리 안 된 예외는 최상위 500 JSON(no-store·보안 헤더, ADR-0103).

## Tests
현재: test/index.test.ts — 바인딩 없는 503, health, 405/404, 에셋 위임 + 격리 헤더. test/world.test.ts — 인메모리 R2/KV로 current 200/400/404/500, world 200/206/304/HEAD/404/400, 경로 조작 거부, 인메모리 `caches.default`로 쿼리 400·경로 키 HIT·404 네거티브 캐시·current 엣지 캐시(R2/KV 조회 수), Range 206/416/문법 오류 200·304/412·사용자 입력 5xx 없음·예외 500 JSON.
test/weather.test.ts — 플래그·매핑·502. test/log.test.ts — 지우기·허용 필드(IP·UA·모르는 키 없음)·AE 한 점·400/413/405·바인딩 없으면 204·415/403/429·샘플률 허용 값·production test 거절·4096/4097 B 경계·스트림(Content-Length 없음·다중 chunk·초과 시 취소)·한글/이모지 바이트·손상 UTF-8. **test/miniflare.test.ts — 실제 `wrangler dev --env local`(격리 persist, 시드) HTTP: current, 200 MISS→HIT, 206, 304, HEAD, 404, 400**(`SANPO_SKIP_MINIFLARE=1` 건너뜀, ADR-0026).

## Status
M00-T04: `/api/world/current`·`/world/*`. M02-T06: R2·KV 생성·바인딩, 캐시 정책(평범한 GET만)·진단 헤더, weather, miniflare 통합 테스트, 실제 dev 버킷 검증(ADR-0026).
배포: `.github/workflows/{deploy,preview}.yml`(docs/13-deployment.md §7).
