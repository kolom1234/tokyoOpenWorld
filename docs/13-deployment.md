# 13 — Deployment (Cloudflare)

## 1. 구성
| 리소스 | 이름(예) | 용도 |
|---|---|---|
| Worker | `tokyo-sanpo` (+ `tokyo-sanpo-staging`) | 게임 번들(Static Assets) + `/world/*` R2 프록시 + `/api/*` |
| R2 버킷 | `sanpo-world-prod`, `sanpo-world-dev`(staging) — 위치 힌트 apac, 2026-09-29 생성 | 월드 데이터 `world/<buildId>/**` |
| KV | `SANPO_CONFIG`(prod), `SANPO_CONFIG_STAGING` | `CURRENT_BUILD:v<formatVersion>` = 활성 buildId, `BUILDS:v<fv>`·`BUILD_FILES:<id>`(퍼블리시·gc, ADR-0026) |
| (확장) R2 커스텀 도메인 | `world.<domain>` | 트래픽 증가 시 Worker 우회 CDN 캐시 (§5) |

## 2. `apps/worker/wrangler.jsonc`
아래는 구성 요약. **M02-T06에서 리소스를 만들고 바인딩을 추가했다**: top-level = `sanpo-world-prod` + `SANPO_CONFIG`, `env.staging` = `sanpo-world-dev` + `SANPO_CONFIG_STAGING`(env 간 상속 안 됨 → 양쪽에). 바인딩이 없는 환경에서는 여전히 `/world/*`, `/api/world/current` → `503 {error:"world_storage_unconfigured"}`(ADR-0015). 퍼블리시 CLI는 이 파일에서 버킷·KV id를 읽는다.
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
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()
/basis/ktx2-worker.js
  ! Content-Security-Policy
  Content-Security-Policy: default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/index.html
  Cache-Control: no-cache
```
- COOP/COEP → `crossOriginIsolated` → SharedArrayBuffer, Jolt 멀티스레드 사용 가능.
- **KTX2 트랜스코더 워커만 `'unsafe-eval'`(ADR-0032)**: basis_transcoder(embind)가 `new Function`을 쓴다. blob 워커는 페이지 CSP를 물려받으므로
  같은 출처 정적 부트스트랩 `/basis/ktx2-worker.js`에만 별도 CSP(`!`로 전역 CSP 분리 — 두 정책이 겹치면 교집합이 된다). 페이지 CSP는 그대로.
- 외부 도메인 리소스 금지(폰트 포함 자체 호스팅). §5 확장 시 `connect-src`에 world 도메인 추가 + R2 CORS 설정.
- **문서 정책 헤더(ADR-0102)**: Referrer-Policy·Permissions-Policy는 `_headers`에만 — HTML은 Worker를 거치지 않는다. Permissions-Policy는 쓰지 않는 기능만 끈다(gamepad·fullscreen·autoplay 유지, Chromium이 모르는 이름은 콘솔 오류라 금지).
- **HSTS = Cloudflare 존 설정**(SSL/TLS → Edge Certificates, 2026-10-31 실측 `max-age=2592000`). `_headers`·Worker에 넣지 않는다(중복 — `apps/game/test/headers.test.ts`).

## 4. Worker 라우트 (`apps/worker/src/routes/`)
| 경로 | 동작 |
|---|---|
| `GET /api/health` | `{"ok":true}`만(no-store) — 배포 스모크 테스트용. 바인딩 등 내부 구성은 노출하지 않는다(ADR-0102 — 저장소 미구성은 `/api/world/current` 503) |
| `GET /api/world/current?fv=1` | KV `CURRENT_BUILD:v1` → `{ buildId, formatVersion, baseUrl }` (Cache-Control max-age=60) |
| `GET /world/<buildId>/<path>` | 평범한 GET: ① `caches.default` 조회 → ② 미스 시 R2 → Content-Type/ETag/`Cache-Control: public, max-age=31536000, immutable`/CORP → ③ 200 전체 응답만 `ctx.waitUntil(cache.put)`. Range·조건부 헤더가 있으면 캐시를 건너뛰고 `env.WORLD.get(key, { range, onlyIf })`가 206/304/412. 없으면 404(`max-age=300`). 진단 `X-Sanpo-Cache: HIT/MISS/BYPASS`(ADR-0026) |
| `GET /api/weather` | `LIVE_WEATHER=true`일 때만(아니면 404). Open-Meteo 현재 날씨(도쿄역, m/s) → `{time, temperatureC, precipitationMm, weatherCode, cloudCover 0–1, windMs, windDirDeg, isDay}`, 10분 캐시, 상류 오류 502 |
| `POST /api/log` | 오류 보고(M11-T03, ADR-0098): 게임이 세션 1 % 샘플링 → 본문 ≤ 4 KB 허용 필드만·이메일/URL/긴 숫자 지움 → Workers Analytics Engine `LOGS`(prod `sanpo_errors`·staging `sanpo_errors_staging`) 한 점, 204. IP·UA·위치 미사용. 조회 `pnpm errors` |
- buildId 형식 검증 정규식 `^[0-9]{8}-[0-9a-f]{7}-[0-9a-f]{8}$`, 경로 `..` 차단.

## 5. 확장(트래픽 증가 시) — Worker 우회
- Worker 경유 요청은 요청 과금 대상이므로, 세션당 수백 셀 요청이 누적되면 `world.<domain>` R2 커스텀 도메인 + Cache Rules(Cache Everything, Edge TTL 1년) + R2 CORS(`GET`, origin = 게임 도메인)로 전환.
- 클라이언트는 `/api/world/current`의 `baseUrl`만 따르므로 코드 변경 없음. 전환 절차는 ADR로 기록.

## 6. 비용 추정 (2026-09 요금 기준)
- R2: 저장 $0.015/GB-월(10 GB 무료), Class B 읽기 $0.36/백만(월 1,000만 무료), **egress 무료**.
- MVP 월드 ≈ 1.5 GB(L0 294셀 × 평균 3 MB + HLOD + shared) → 저장 무료 범위. 23구 전역 L0 ≈ 30–40 GB → 월 $0.5 내외.
- Workers: Free는 일 10만 요청 → 세션당 ~400 요청이면 일 250세션 한계. 공개 시 **Workers Paid 권장**. 정적 에셋 요청은 Worker를 호출하지 않으면 무료.
- **무료 한도 일일 점검**(M11-T06, 사용자 결정 2026-10-19 — 무료 플랜으로 시작): `.github/workflows/usage.yml`(매일 09:00 KST) → `node scripts/cf-usage.ts --github-issue` — Workers 요청/일 100,000·KV 읽기 100,000/일·쓰기 1,000/일·R2 Class A 100만/월·Class B 1,000만/월·저장 10 GB·Analytics Engine 쓰기 100,000/일 대비 70 % 이상이면 라벨 `cf-usage` 이슈(열린 것이 있으면 본문 갱신). "ours"(tokyo-sanpo Worker·KV·`sanpo-world-*` 버킷)와 "account"(같은 계정 다른 프로젝트 포함 — 무료 한도는 계정 단위)를 나눠 표기. 토큰 권한 **Account | Account Analytics | Read**(Actions 시크릿 `CLOUDFLARE_API_TOKEN`에 필요 — 로컬 토큰은 확인됨). 로컬 실행 `node scripts/cf-usage.ts`.
  - 2026-10-19 첫 측정: ours 최대 R2 저장 18.3 %(1.96 GB), Workers 2.0 %. account KV 쓰기 925 %(다른 프로젝트 namespace — tokyo-sanpo 아님).
- 정적 에셋 요청(`run_worker_first` 밖)은 Workers 요청 수에 들어가지 않는다. `/world/*`·`/api/*`만 Worker 호출.

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
  키가 없으면 퍼블리시는 같은 API 토큰으로 R2 REST 업로드 + 배포된 Worker HEAD 검증(ADR-0026).
- 월드 퍼블리시(빌드 머신, 호스트에서): `pnpm pipeline publish --build-id <id> --env dev|prod [--set-current] [--verify-url https://<worker>/world]` — 대상 = world.json·cells.idx·`L<n>/**.tkc`·`shared/materials/*`(manifest·KTX2, `image/ktx2`, M03-T06),
  검증만 `--verify-only --verify-url …`, 정리 `pnpm pipeline gc --env dev [--apply]`. 데이터 롤백 = `CURRENT_BUILD:v1`을 직전 buildId로(§8).
- ODPT 키는 파이프라인(오프라인 시간표 컴파일)에서만 사용. 런타임·클라이언트에 비밀값 없음.

## 8. 릴리스 호환성
- 클라이언트 번들은 지원 `formatVersion`을 상수로 가진다. `/api/world/current?fv=<n>`로 해당 포맷의 buildId를 받는다 → 코드와 데이터를 독립 배포 가능.
- 데이터 롤백 = KV 값을 직전 buildId로 되돌림(즉시).
- **production 공개(2026-10-19, 사용자 승인)**: https://earthaimap.com — Worker `tokyo-sanpo`(병합 커밋 a752cd7, GitHub Deploy 승인) + 커스텀 도메인(Workers Domains API, 약 70 s 뒤 인증서·응답). R2 `sanpo-world-prod` = `20261018-82db354-aa09c5ca`(현재, 509파일) + `20261018-89ce0aa-aa09c5ca`(롤백용, 506파일), 공개 도메인 경유 검증 불일치 0. 롤백 리허설: 이전 빌드 반영 4 s, 원복 5 s ✅. 공개 URL 스모크(실제 GPU, 캐시 없는 새 컨텍스트): 첫 로드 25.6–26.0 MB ✅, 첫 표시 엣지 캐시 HIT 8.5–12.1 s(3회 중 1회 12.1 s ⚠️ — 셰이더 컴파일 7.7–8.9 s, 노트북 발열 상태), 배포 직후 첫 방문(엣지 MISS)은 14.9–33 s ⚠️. `/api/weather` 404(LIVE_WEATHER=false), 픽스처 없음(SPA 기본 페이지), 크레딧·ODbL·OSS 전문 200, 실제 창 콘솔 오류 0. 도메인은 wrangler.jsonc가 아닌 API로 붙였다(배포가 지우지 않음 — 다시 만들 때는 §9 표 4단계).
- 현재(2026-10-19, M11): staging = `20261018-82db354-aa09c5ca`(MVP L0 294 + HLOD 177 + 머티리얼 32층 + 오디오 22 + map.pmtiles 1.45 MB + **global/odbl/** ODbL 묶음 36,558 피처 1.86 MB + 로마자 방위 하이픈 지명, 509파일 396.5 MB, validate 0, dev 버킷), 코드 82db354(Worker 버전 f408b963 — 오류 보고 LOGS = sanpo_errors_staging). 실제 GPU staging 첫 로드 26.7 MB·첫 표시 7.0–9.1 s ✅. dev gc(7일 규칙) 2026-10-19 — 2026-10-11 빌드 2개 삭제.
- 이전(2026-10-18, M10 T01–T06): staging = `20261018-89ce0aa-aa09c5ca`(MVP L0 294 + HLOD 177 + 머티리얼 32층 18.18 MB + shared/audio 22파일 + cell meta placeNames(지명) + **global/map.pmtiles 1.45 MB**(지도, 자체 MVT·PMTiles v3), 506파일 394.7 MB, dev 버킷), 코드 506b321(Worker 버전 b8646e66) — `/credits.json`·`/oss-licenses.json`은 게임 정적 에셋(vite `sanpo-credits`). 배포 CSP `connect-src 'self'`는 `data:` fetch도 막는다(세이브 가져오기 썸네일 = atob 디코드). dev 버킷 gc(7일 규칙) 2026-10-18 — 대상 0개.
- 이전(2026-10-18, M08 T01–T04): staging = `20261017-18986b3-cba213ec`(MVP L0 294 + HLOD 177 + 머티리얼 + shared/audio + cell meta interactables 카셰어 147·공유자전거 117, 505파일 392.9 MB, dev 버킷), 코드 8a1e136(Worker 버전 d396d21e). 엔진 워클릿 = 별도 같은 출처 에셋 `assets/engine-worklet-*.js`(CSP script-src 'self'). dev 버킷 gc(7일 규칙) 2026-10-18 — 2026-10-04·05 빌드 3개.
- 이전(2026-10-12, M09 T01–T05 + M07-T06): staging = `20261011-a095dfd-cba213ec`(MVP L0 294 + HLOD 177 + 머티리얼 + **shared/audio 22파일 5.04 MB**(Opus, `audio/ogg`) + lights.bin·audio.json, 505파일 392.9 MB, dev 버킷), 코드 d942e68(Worker 버전 80c70e87) — 실제 GPU 첫 로드 26.4 MB·첫 표시 10.2–11.9 s ⚠️. 직전 `20261011-a037427-aefbe9ff`(T03 중간 배포). dev 버킷 gc(7일 규칙) 2026-10-12 — 2026-10-04 이전 13개 빌드 삭제(REST 429 → 5분 간격 재실행).
- 이전(2026-10-05, M06-T03–T07): staging = `20261004-ed3d33c-8de63322`(MVP L0 294 + HLOD 177 + 머티리얼, nav.bin·lanes.bin(점 4 m)·신호 코드 v2 포함, 478파일 376.4 MB, dev 버킷), 코드 ed3d33c(Worker 버전 a942c765) — 실제 GPU 첫 표시 7.15–7.94 s·첫 로드 23.3–24.5 MB. 직전 `20261004-f0ae5ab-8de63322`(M06 사전). 옛 빌드 gc는 2026-10-06 이후(7일 규칙).
- 이전(2026-09-30, M04-T03): staging = `20260929-99bffa8-ec1646fc`(MVP L0 294 + HLOD + 머티리얼, collision.bin 포함, 478파일 260.5 MB, dev 버킷), 코드 f031f80(walk). 이전 `20260929-b84bfa1-ec1646fc`·`20260929-c9a28d3-ec1646fc`(M03-T06). 이전 `20260928-b2d1e36-7fb58d45`(M02-T07). production 데이터 없음(첫 prod 퍼블리시 전까지 `/api/world/current` = no_build → 스모크는 경고만).

## 9. 공개(production) 절차·롤백 (M11-T06)
**전제(사람)**: ① 국토지리원 측량법 제30조 사용 승인 → 승인번호를 ATTRIBUTION `gsi-dem` 표기·화면 표기에 반영(03 §6.1) ② PR 병합 ③ 각 production 쓰기 직전 사용자 확인.
요금제: Cloudflare 무료로 시작(사용자 결정 2026-10-19) — 정적 에셋 요청은 무료·무제한, Worker는 `/world/*`·`/api/*`만(하루 100,000 요청), 일일 점검 `usage.yml`(§6).

| 단계 | 명령/위치 | 확인 |
|---|---|---|
| 1. production 버킷 publish(직전 빌드 = 롤백 대상 포함 2개) | `pnpm pipeline publish --build-id <이전> --env prod` → `pnpm pipeline publish --build-id <새> --env prod` | 파일 수·MB 로그, KV `BUILDS:v1` 2개 |
| 2. KV 포인터 | `pnpm pipeline current --env prod --build-id <새>` | `pnpm pipeline current --env prod`(보기) |
| 3. 코드 배포 | main 병합 → GitHub Actions `Deploy`(staging 자동 → Environment `production` 승인 = 사용자 클릭) | `/api/health` 스모크(워크플로) |
| 4. 도메인 | `apps/worker/wrangler.jsonc` top-level `"routes": [{ "pattern": "earthaimap.com", "custom_domain": true }]` → 배포가 DNS·인증서 생성. 토큰 권한이 모자라면 대시보드: Workers & Pages → tokyo-sanpo → Settings → Domains & Routes → Add → Custom domain → `earthaimap.com` | `https://earthaimap.com/api/health` |
| 4b. www → apex 301(ADR-0102, 대시보드) | ① DNS → Records → Add: `AAAA`, Name `www`, IPv6 `100::`, Proxied(주황) ② Rules → Redirect Rules → Create: 조건 `(http.host eq "www.earthaimap.com")`, URL redirect → Dynamic `concat("https://earthaimap.com", http.request.uri.path)`, 301, Preserve query string ✅. Worker 커스텀 도메인으로 붙이지 않는다(정적 에셋이 먼저 응답해 `/`가 리다이렉트되지 않음) | `curl -sSI "https://www.earthaimap.com/a?b=1"` → 301 `Location: https://earthaimap.com/a?b=1` |
| 5. 롤백 리허설 | `pnpm pipeline current --env prod --build-id <이전>` → `/api/world/current` 반영 확인 → `<새>`로 복귀 | 반영 시간(staging 실측 4–13 s, 브라우저 캐시 ≤ 60 s) |
| 6. 공개 URL 스모크 | `GOLDEN_BASE_URL=https://earthaimap.com GOLDEN_WORLD=api GOLDEN_BOOT=1 pnpm golden -g "boot transfer"` + 아래 체크리스트 | 첫 표시·전송 MB·오류 0 |

**롤백(문제가 생겼을 때)**
- 데이터(월드)만: `pnpm pipeline current --env prod --build-id <직전 buildId>` — 1분 안(KV 전파 수 초 + 브라우저 캐시 ≤ 60 s). 목록은 `pnpm pipeline current --env prod`.
- 코드(Worker): `cd apps/worker && npx wrangler deployments list` → `npx wrangler rollback <version-id>`(즉시), 또는 GitHub Actions에서 직전 커밋의 Deploy 다시 실행. 대시보드: Workers & Pages → tokyo-sanpo → Deployments → 이전 버전 Rollback.
- 도메인을 잠시 내리기: 대시보드 Domains & Routes에서 `earthaimap.com` 제거(workers.dev 주소는 유지).

**공개 직후 사람 확인 체크리스트(공개 URL)**
1. 첫 화면: 타이틀이 뜨고 "새 산책"·"이어하기"·"설정"·"크레딧"이 눌린다(한국어/일본어/영어 전환).
2. 걷기: 새 산책 → 시부야 스크램블에서 WASD·Shift·X, V 시점 전환, 마우스 시선(클릭 = 포인터 잠금, Esc = 일시정지 — 차·사람이 멈춘다).
3. 전철: 빠른 이동(M → 하라주쿠역) → 개찰구 통과 → 계단 F → 승강장 → 열차 문 앞 F 탑승 → T 빨리감기 → 신주쿠 하차.
4. 운전: R(차 부르기) → F 탑승 → W/S/A/D·L 전조등 → 정지 후 F 하차. B(자전거)도 한 번.
5. 지도: M → 확대·이동·레이어, 발견한 곳 빠른 이동. 화면 아래 `© OpenStreetMap contributors` 표기.
6. 포토: P → 노출·조리개(첫 DOF는 2–5 s 멈출 수 있음 ⚠️) → 셔터 → PNG 저장·도감에 사진.
7. 세이브: 몇 분 걸은 뒤 새로 고침 → "이어하기"가 같은 자리, 설정 → 세이브 내보내기/가져오기.
8. 소리: 첫 클릭 뒤 거리 소리·발소리·역 차임, 설정 볼륨·음소거, 설정 "효과음 자막".
9. 크레딧: 데이터 출처(PLATEAU·국토지리원(승인번호)·OSM·e-Stat·긴자선 미수록), 맨 위 ODbL 링크(README가 열림), OSS 라이선스 전문·제3자 고지 링크.
10. 오류: 이상하면 `pnpm errors --env production --hours 1`(오류 보고 1 % 샘플).

