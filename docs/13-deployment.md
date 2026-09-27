# 13 — Deployment (Cloudflare)

## 1. 구성
| 리소스 | 이름(예) | 용도 |
|---|---|---|
| Worker | `tokyo-sanpo` (+ `tokyo-sanpo-staging`) | 게임 번들(Static Assets) + `/world/*` R2 프록시 + `/api/*` |
| R2 버킷 | `sanpo-world-prod`, `sanpo-world-dev` | 월드 데이터 `world/<buildId>/**` |
| KV | `SANPO_CONFIG` | `CURRENT_BUILD:v<formatVersion>` = 활성 buildId |
| (확장) R2 커스텀 도메인 | `world.<domain>` | 트래픽 증가 시 Worker 우회 CDN 캐시 (§5) |

## 2. `apps/worker/wrangler.jsonc`
아래는 **목표 구성**. 현재 커밋본은 R2 버킷·KV가 아직 없어 `r2_buckets`/`kv_namespaces`를 생략하고 `workers_dev`·`preview_urls: true`를 켠다(ADR-0015). 바인딩이 없으면 `/world/*`, `/api/world/current`는 `503 {error:"world_storage_unconfigured"}`로 비활성 — 배포는 성공. 리소스 생성 후 top-level과 `env.staging` **양쪽에** 바인딩 추가(env 간 상속 안 됨, `vars`도 동일).
```jsonc
{
  "name": "tokyo-sanpo",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "../game/dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/world/*", "/api/*"]
  },
  "r2_buckets": [{ "binding": "WORLD", "bucket_name": "sanpo-world-prod", "preview_bucket_name": "sanpo-world-dev" }],
  "kv_namespaces": [{ "binding": "CONFIG", "id": "<kv-id>" }],
  "vars": { "LIVE_WEATHER": "false", "WORLD_BASE_URL": "/world" },
  "env": { "staging": { "name": "tokyo-sanpo-staging", "r2_buckets": [{ "binding": "WORLD", "bucket_name": "sanpo-world-dev" }] } }
}
```
- 로컬 개발: `env.local`(배포 금지)에만 R2/KV 바인딩 → `wrangler dev --env local`이 miniflare로 시뮬레이션. `pnpm dev` = Vite(5173, `/api`·`/world` → 8787 프록시) + wrangler dev(8787). 시드: `pnpm --filter @sanpo/worker seed:local` (ADR-0016).
- 게임 빌드: `apps/game` Vite → `apps/game/dist`. 배포: `apps/worker`에서 `wrangler deploy`.
- 정적 에셋 한도: 파일당 25 MiB, 버전당 파일 20,000(Free)/100,000(Paid). → **월드 데이터는 절대 정적 에셋에 넣지 않는다**(R2 전용). CI가 dist 내 25 MiB 초과 파일을 차단.
- `@cloudflare/vite-plugin`은 선택 사항(로컬 dev 통합 필요 시 ADR로 도입).

## 3. 응답 헤더
`apps/game/public/_headers` (정적 에셋) + Worker 응답 공통(`src/headers.ts`):
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' data: blob:; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'
  X-Content-Type-Options: nosniff
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
```
- COOP/COEP → `crossOriginIsolated` → SharedArrayBuffer, Jolt 멀티스레드 사용 가능.
- 외부 도메인 리소스 금지(폰트 포함 자체 호스팅). §5 확장 시 `connect-src`에 world 도메인 추가 + R2 CORS 설정.

## 4. Worker 라우트 (`apps/worker/src/routes/`)
| 경로 | 동작 |
|---|---|
| `GET /api/health` | `{ ok, bindings: { world, config } }`(boolean만, no-store) — 배포 스모크 테스트용 |
| `GET /api/world/current?fv=1` | KV `CURRENT_BUILD:v1` → `{ buildId, formatVersion, baseUrl }` (Cache-Control max-age=60) |
| `GET /world/<buildId>/<path>` | ① `caches.default` 조회 → ② 미스 시 `env.WORLD.get(key, { range: req.headers, onlyIf: req.headers })` → Content-Type/ETag/`Cache-Control: public, max-age=31536000, immutable`/CORP → ③ 200 전체 응답만 `ctx.waitUntil(cache.put)` (206은 캐시 안 함) → 없으면 404(`max-age=300`) |
| `GET /api/weather` | `LIVE_WEATHER=true`일 때만. Open-Meteo 현재 날씨(도쿄 중심 좌표) 프록시, 10분 캐시 |
| `POST /api/log` | 오류 보고 1% 샘플링(M11, Workers Analytics Engine 선택) |
- buildId 형식 검증 정규식 `^[0-9]{8}-[0-9a-f]{7}-[0-9a-f]{8}$`, 경로 `..` 차단.

## 5. 확장(트래픽 증가 시) — Worker 우회
- Worker 경유 요청은 요청 과금 대상이므로, 세션당 수백 셀 요청이 누적되면 `world.<domain>` R2 커스텀 도메인 + Cache Rules(Cache Everything, Edge TTL 1년) + R2 CORS(`GET`, origin = 게임 도메인)로 전환.
- 클라이언트는 `/api/world/current`의 `baseUrl`만 따르므로 코드 변경 없음. 전환 절차는 ADR로 기록.

## 6. 비용 추정 (2026-09 요금 기준)
- R2: 저장 $0.015/GB-월(10 GB 무료), Class B 읽기 $0.36/백만(월 1,000만 무료), **egress 무료**.
- MVP 월드 ≈ 1.5 GB(L0 294셀 × 평균 3 MB + HLOD + shared) → 저장 무료 범위. 23구 전역 L0 ≈ 30–40 GB → 월 $0.5 내외.
- Workers: Free는 일 10만 요청 → 세션당 ~400 요청이면 일 250세션 한계. 공개 시 **Workers Paid 권장**. 정적 에셋 요청은 Worker를 호출하지 않으면 무료.

## 7. CI/CD (GitHub Actions)
| 워크플로 | 트리거 | 단계 |
|---|---|---|
| `ci.yml` | PR, main push | **check**(Node 24·22 매트릭스): `pnpm install --frozen-lockfile` → `pnpm check`(biome·tsc·depcruise·check-size) → `pnpm test` → `pnpm build`(게임 + worker dry-run) → `pnpm check:assets`(25 MiB/파일, 2만 파일). **e2e**: Playwright Chromium(headless shell) → `pnpm test:e2e`(게임 빌드 + `vite preview` → `?world=mini` 부트 스모크, 실패 시 trace 업로드). **records**: `pnpm codemap` 결과 ≠ 커밋본이면 실패, PR이면 `check:records`(api.ts↔모듈 카드 실패, 코드↔PROGRESS 경고). |
| `preview.yml` | PR | staging Worker에 `wrangler versions upload --preview-alias pr-<N>`(배포 아님) → 프리뷰 URL을 PR 코멘트 1개로 갱신. staging이 한 번도 배포되지 않았으면 안내 코멘트 후 성공 |
| `deploy.yml` | main push, 수동 | staging 빌드 → `wrangler deploy --env staging` → `/api/health` 스모크 → Environment `production` 수동 승인 → 재빌드 → `wrangler deploy` → 스모크. production 잡은 환경에 Required reviewers가 없으면 배포 전 실패(자동 생성된 무보호 환경 방지) |
- 시크릿이 없으면(포크 PR·Dependabot) preview/deploy는 존재 여부만 `secrets.X != ''`로 판정해 건너뛰고 성공. 시크릿은 wrangler 프로세스 env로만 전달(echo·인자 금지).
- 공용 셋업: `.github/actions/setup`(pnpm → Node → install), 스모크: `.github/scripts/smoke.sh`.
- **world-mini 픽스처(M01-T07, ADR-0019)**: `vite build`가 `tests/fixtures/world-mini`를 `dist/fixtures/world-mini/`로 복사 → PR preview·staging 정적 에셋(`/fixtures/*` = `Cache-Control: no-cache`). 게임은 `?world=mini`일 때만 이 경로를 쓴다. production 빌드는 `SANPO_WORLD_MINI=0`으로 복사 생략.
- 시크릿: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. 월드 퍼블리시용 `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`는 **빌드 머신 로컬에만**(CI에 두지 않음).
- ODPT 키는 파이프라인(오프라인 시간표 컴파일)에서만 사용. 런타임·클라이언트에 비밀값 없음.

## 8. 릴리스 호환성
- 클라이언트 번들은 지원 `formatVersion`을 상수로 가진다. `/api/world/current?fv=<n>`로 해당 포맷의 buildId를 받는다 → 코드와 데이터를 독립 배포 가능.
- 데이터 롤백 = KV 값을 직전 buildId로 되돌림(즉시).
