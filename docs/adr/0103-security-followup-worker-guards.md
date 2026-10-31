# ADR-0103: 보안 점검(Codex 2026-10-23) 후속 — Worker 입력·비용 경계
- Status: Accepted
- Date: 2026-10-31

## Context
- 외부 보안 점검 보고서(2026-10-23, 배포 커밋 a752cd7 기준) F01–F08. 2026-10-31 현재 main(ed22ec2)에서 재확인:
  F01(HTTP 평문)·F02(TLS 1.0/1.1) = **해결됨(존 설정)** — `http://earthaimap.com/{,api/health,world/…}` 모두 301 `https://…`, HSTS `max-age=2592000`, TLS 1.0·1.1 핸드셰이크는 서버가 `protocol_version` 경고로 거부·1.2·1.3 성공(코드 변경 없음, 사용자 대시보드).
  F03–F07은 코드 그대로라 성립, F08은 lockfile 그대로라 성립.
- 이 계정은 Workers Paid·R2 Paid라 포함량을 넘으면 멈추지 않고 **자동 과금**된다(docs/13 §6) → 남용 경로(오류 API·캐시 우회 R2 읽기)를 비용 보호 관점에서 먼저 막는다.
- 존(earthaimap.com)은 Free 플랜. Worker 안의 방어는 **요청이 Worker에 닿은 뒤**라 Worker 요청 과금 자체는 막지 못한다 — 요청 수 방어는 대시보드 WAF 규칙(사용자, `/api/log` 요청 제한)과 킬 스위치(ADR-0104)가 맡고, Worker는 쓰기·R2 읽기·통계 오염을 막는다.

## Decision
### F03 `/api/log` 남용
1. 본문을 읽기 전 `log-guard.ts`: `Content-Type`이 `application/json`(매개변수 허용)이 아니면 **415**(text/plain 단순 POST = CORS 프리플라이트 없는 교차 출처 전송 차단).
   `Origin`이 있으면 허용 목록(`https://earthaimap.com`, staging `tokyo-sanpo-staging.kolom1357.workers.dev`와 그 프리뷰 `*-tokyo-sanpo-staging…`, `http://localhost|127.0.0.1:*`)만, 아니면 **403**. Origin은 비브라우저가 위조·생략할 수 있어 **보조 수단**(주석 명시) — Origin 없는 요청은 통과시키고 아래 요청 제한이 받는다.
2. **Workers Rate Limiting 바인딩 `LOG_LIMITER`**: 키 = `SHA-256("sanpo-log:" + CF-Connecting-IP)` 앞 16 hex(IP 원문은 저장·전달하지 않음), 분당 10회(게임은 세션당 최대 3건) 초과 **429**. 카운터는 PoP 단위 근사(전역 정확 한도 아님) — 전역 예산은 킬 스위치.
3. 샘플률은 클라이언트 값을 그대로 믿지 않고 **허용 값 {0.01, 1}만**(게임 기본 1 %·staging `?report=force`), 그 밖은 400. 빠지면 1(가중 1 — 부풀리지 않는 쪽). `pnpm errors`는 허용 값 밖의 옛 행·`kind:"test"`를 기본 집계에서 뺀다(`--include-test`).
4. `kind:"test"`는 **production(`DEPLOY_ENV=production`)에서 400** — 합성 보고가 운영 통계에 섞이지 않는다. staging은 수락(수락 시험용).
5. 게임은 세션 안에서 같은 종류 + 숫자만 다른 메시지를 한 번만 보낸다(`dedupeKey` — 매 프레임 반복 오류), 세션당 3건 상한은 그대로.

### F04 `/api/log` 본문 상한
10. `readLimitedText`: `request.body.getReader()`로 **실제 수신 바이트**를 누적, 4,096 B를 넘는 순간 `reader.cancel()` 후 413 — 나머지 스트림은 읽지 않는다(이전: `request.text()` 전체 버퍼링 뒤 **문자 수**로 판정 → 한글 2,528자 7,528 B 수락·Content-Length 없는 49 KB 끝까지 읽음).
    Content-Length는 빠른 거절용 보조(없거나 작게 속여도 누적이 정본). 상한 안에서만 `TextDecoder('utf-8', { fatal: true })` — 손상 UTF-8은 400 `bad_encoding`, 그 뒤 JSON 파싱.

### F05 캐시 키·네거티브 캐시
6. `/world/*`에 **쿼리 문자열이 있으면 400 `unexpected_query`**(게임 클라이언트는 `/world/*`에 쿼리를 쓰지 않음을 확인 — streaming fetcher·world-load·map·audio·rail·materials 모두 경로만). 캐시 키는 `출처 + 경로`(빈 `?`·헤더 변형도 같은 키).
7. 검증된 경로(buildId·세그먼트 형식 통과)의 **404를 Cache API에 300 s**(응답 `max-age=300`과 같은 값 — docs/13의 "404 5분 캐시"가 이제 실제 동작). 새 데이터는 새 buildId라 "늦게 생기는 키"가 없다. 400(형식 위반)은 캐시·R2 모두 거치지 않는다.
8. `/api/world/current`: 200·404를 엣지 30 s(키 = `fv`만), 브라우저 `max-age=60 → 30`. 롤백 반영 = KV 전파(실측 4–13 s) + 엣지 ≤ 30 s + 브라우저 ≤ 30 s — 기존 "1분 안" 유지. 500(`bad_current_build`)은 캐시하지 않는다.
9. Range·조건부 요청은 그대로 R2 직행(BYPASS — ADR-0026, 지도·부분 읽기 호환). HEAD도 R2 head. 이 둘의 반복 요청 비용은 킬 스위치(ADR-0104)가 상한.

### F07 Range·예외 경계
11. `range.ts parseRange`: RFC 9110 §14 단일 바이트 범위만 해석해 R2에 **범위 객체**를 넘긴다(요청 Headers를 그대로 넘기지 않음). 문법 오류 = Range 무시 → 평범한 GET(200 전체, 엣지 캐시를 탄다 — 잘못된 Range로 캐시 우회 불가). 만족 불가 = **416 + `Content-Range: bytes */<size>`**: suffix 0·안전 정수를 넘는 시작은 head로 크기만 보고, R2가 범위 밖 시작에 던지는 예외(운영 1101 원인)는 잡아서 head → 416/404, 끝이 넘친 범위는 객체 끝까지 잘라 한 번 재시도(206).
    조건부 헤더는 4개만 골라 `onlyIf`로, 날짜가 틀린 If-(Un)Modified-Since는 무시(RFC 9110 §13.1.3–4).
12. `handleRequest` 최상위 try/catch: 처리 안 된 예외 → `500 {"error":"internal_error"}`(no-store) + 보안 헤더. 응답에 메시지·스택 없음, Workers Logs에는 예외 종류만(`console.error` — Worker에는 Logger 없음).

### F06 프레이밍·남은 헤더
13. 문서(`_headers /*`): CSP에 `frame-ancestors 'none'; base-uri 'none'; form-action 'self'` + `X-Frame-Options: DENY`. 임베딩 요구 없음(공유는 링크). `/basis/ktx2-worker.js`의 별도 CSP(`!`로 전역 분리, `'unsafe-eval'`)는 유지 — 워커 스크립트라 frame-ancestors는 의미 없고, `'unsafe-eval'`이 그 파일 밖으로 퍼지지 않게 테스트로 고정.
14. Worker가 만든 응답 전부(오류 포함): 격리 4종 + CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'` + XFO DENY + Referrer·Permissions-Policy(`_headers`와 같은 값). 정적 에셋 위임(`env.ASSETS.fetch`) 응답에는 붙이지 않는다(문서 CSP 보존). HSTS는 계속 존 설정만(ADR-0102 — Worker·`_headers`에 없음을 테스트).

### 대체 접근 경로
15. production Worker의 `workers_dev`·`preview_urls`를 끈다(2026-10-31 실측: `https://tokyo-sanpo.kolom1357.workers.dev/api/health` 200 — 존 WAF·요청 제한·킬 스위치를 거치지 않는 우회 경로). staging은 PR 프리뷰 때문에 유지(staging 데이터만). production 배포 스모크·환경 URL = `https://earthaimap.com`, 스모크는 프레이밍 금지 헤더(`X-Frame-Options`·`frame-ancestors`)도 본다.

### Deploy 승인 대상
16. `deploy.yml`에 `supersede` 잡: 새 Deploy 실행이 시작되면 이보다 먼저 시작돼 production 승인을 기다리는(`status=waiting`) 실행을 REST로 취소. 그 사이 staging 단계였던 옛 실행은 production 잡 첫 단계(`GITHUB_SHA == main 머리`)에서 실패. production 잡은 `refs/heads/main` 실행만. 승인 화면에는 항상 최신 main 하나만 남는다.
    `concurrency`만으로는 부족 — 승인 대기 잡이 그룹 안에서 "pending"으로 취소되는지는 문서상 보장이 없고, 같은 그룹이 staging 배포까지 막는다.

### 관측 로그
17. `observability.redact_query_string: true`(API 확인: 이전 production·staging 모두 `false`, 호출 로그 켜짐). staging 실측 — 배포 뒤 `?fv=1&redactcheck=…` 요청이 로그에 `…/api/world/current`로만 남음. 보존 기간은 요금제 고정(Paid 7일), 접근은 계정 권한. 애플리케이션 쪽은 원래 IP·UA·본문을 기록하지 않는다.

### 디버그 기능
18. production 배포 빌드만 `SANPO_DEBUG_TOOLS=0` → `__SANPO_DEBUG_TOOLS__` 상수 false. `main.ts`의 `?ui-sandbox=1`·`?probe=`·`?report=force` 분기가 죽은 코드가 되고 동적 import 청크까지 빠진다(2026-10-31 빌드 확인: 청크 0개, `__SANPO_DECODE_PROBE__` 문자열 없음). `?spawn=`·`?debug=1`은 탐방·지원용으로 유지. e2e(`ui.spec`·`decode.spec`·`physics.spec`)는 기본 빌드라 영향 없음.

### 세이브 가져오기
19. `SAVE_LIMITS`(ui): 파일 24 MiB를 `f.text()` 전에(설정 화면·게임 `importFile` 두 곳), 파싱 직후 마이그레이션·썸네일 디코드 전에 사진·썸네일 200개(= 사진 상한 MAX_PHOTOS)·발견/열림 2,000·발견당 사진 id 200·썸네일 하나 1,000,000자·합계 20,000,000자. 넘으면 저장 없이 `SaveImportError(problem)` → 사유별 안내(3개 언어). 정상 세이브(썸네일 360 px JPEG ≈ 20–60 KB × 200)는 상한의 절반 아래. 서버 업로드가 아닌 브라우저 자원 보호.

### F08 의존성
20. 상위 패키지 정상 업그레이드만(pnpm overrides 없음): vite 8.3.1 → **8.3.5**(postcss 8.5.32 → source-map-js **1.2.2**), vitest·`@vitest/mocker` 5.0.2 → **5.0.5**, wrangler 4.141.0 → **4.153.0**(miniflare 5.20261023.0-beta → sharp **0.35.5**·undici **7.30.1**). wrangler 4.152.0은 undici 7.29.1이라 보고서 이후 나온 undici < 7.30.1 권고 8건(High 4)이 남아 4.153.0으로. ajv 경로 fast-uri 3.1.8 → **3.1.9**(같은 범위 안 lockfile 갱신 — fast-uri < 3.1.9 권고 4건).
    결과(2026-10-31): `pnpm audit` 0건(285 패키지). 남은 예외 없음. CI `security` 잡이 이후 새 권고를 막는다.

### CI 공급망·보안 게이트
21. 외부 Actions 5종(checkout·setup-node·pnpm/action-setup·upload-artifact·github-script)을 전체 커밋 SHA로 고정(주석 = 정확한 태그 v7.0.1 등), `.github/dependabot.yml`(github-actions·npm 주간, 7일 cooldown, 그룹). 새 `security` 잡: gitleaks 8.30.1(릴리스 체크섬 고정 검증, 전체 이력, redact) + `pnpm audit --audit-level low`. 2026-10-31 로컬: gitleaks 244커밋 0건, audit 0건.
    기존 필수 체크 4개의 이름·구성은 그대로 — `security`를 필수로 만들지는 사용자가 ruleset에서(절차 docs/13 §7).

## Consequences
- 다른 사이트의 브라우저는 `/api/log`에 쓸 수 없다(JSON은 프리플라이트 → 405, text/plain은 415). curl 등은 Origin을 빼면 통과하지만 IP당 분당 10회로 묶인다.
- Rate Limiting 바인딩은 env 간 상속되지 않는다 → production·staging에 각각(namespace 1001·1002). 로컬·테스트는 바인딩 없음 = 제한 없음.

## Alternatives
- Origin 필수(없으면 403) → `navigator.sendBeacon`·일부 확장/프록시 환경의 정상 보고까지 잃고, 공격자는 Origin을 넣으면 그만 → 기각.
- 서버가 샘플률을 상수 0.01로 덮어쓰기 → staging `?report=force` 수락 시험의 가중이 100배가 된다 → 허용 값 집합으로.
- Durable Object 원자 카운터로 전역 예산 → DO 요청 과금이 늘고 이 규모에선 과함 → 킬 스위치(ADR-0104)로.
