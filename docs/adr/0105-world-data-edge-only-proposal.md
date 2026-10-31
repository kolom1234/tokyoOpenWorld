# ADR-0105: (제안) 월드 데이터를 Worker 없이 엣지 캐시만으로 — R2 커스텀 도메인 + 캐시 규칙
- Status: **Proposed** — 구현하지 않음(사용자 결정 대기). docs/13 §5 "확장 — Worker 우회"의 구체안.
- Date: 2026-11-01

## Context
- 지금 `/world/<buildId>/*`는 매 요청 Worker를 호출한다(정적 에셋과 달리 Worker 요청 과금 대상). 엣지 캐시 HIT여도 Worker 호출 1회 + Workers Logs 이벤트(샘플링 0.1 — ADR-0104)가 붙는다.
- 실측(2026-10-19 공개 스모크): 첫 로드 ≈ 26 MB, 셀·공유 에셋 요청 수백 개/세션. 7일 production 574 요청(대부분 `/world/*`) — 지금 규모에선 포함량(1,000만/주기)의 0.01 % 미만.
- buildId 경로는 불변(새 데이터 = 새 buildId)이라 CDN 캐시에 아주 잘 맞는다.

## Proposal
1. R2 버킷 `sanpo-world-prod`에 커스텀 도메인 `world.earthaimap.com`(R2 → Settings → Custom Domains, 존 earthaimap.com). r2.dev 공개 주소는 끈 채로.
2. 캐시 규칙(Cache Rules): `http.host eq "world.earthaimap.com"` → Eligible for cache, Edge TTL 1년(오리진 무시), Browser TTL = 오리진(`immutable`은 업로드 메타데이터 `Cache-Control`로). 쿼리 문자열 무시(Cache key → Query string: Ignore) — F05와 같은 효과.
3. 응답 헤더 변환 규칙(Transform Rules): `Cross-Origin-Resource-Policy: cross-origin`(게임 문서 COEP `require-corp`가 다른 출처 리소스를 받으려면 필요), `X-Content-Type-Options: nosniff`, `Access-Control-Allow-Origin: https://earthaimap.com` + R2 CORS(GET·HEAD, origin = earthaimap.com, Range 헤더 허용).
4. 게임: `/api/world/current`의 `baseUrl`을 `https://world.earthaimap.com/world/<buildId>`로(KV/`WORLD_BASE_URL` 변수만 — 클라이언트 코드 변경 없음), 문서 CSP `connect-src 'self' https://world.earthaimap.com`(+ 워커 fetch).
5. 킬 스위치(ADR-0104) 식에 `http.host eq "world.earthaimap.com"`을 더한다(R2 읽기도 엣지에서 차단).

## 장점
- 캐시 HIT은 Worker 요청·CPU·로그 0, R2 Class B 0(같은 PoP). MISS만 R2 Class B 1회. 404 네거티브 캐시는 캐시 규칙 상태 코드 TTL로.
- Range 요청을 Cloudflare 캐시가 직접 처리(캐시된 전체 객체에서 잘라 줌) → 지금의 "Range는 R2 직행(BYPASS)" 비용이 사라진다.
- Worker 코드 경로(`/world/*`)·보안 경계(F05·F07)가 단순해진다.

## 단점·위험
- 다른 출처가 된다: COEP/CORP·CORS·CSP 세 곳을 맞게 바꿔야 하고, 하나라도 틀리면 crossOriginIsolated(Jolt 멀티스레드·SharedArrayBuffer)나 텍스처 로드가 깨진다 — staging 도메인(`world-staging.…`)으로 먼저 실측 필요.
- Worker의 입력 검증(buildId 형식·세그먼트·쿼리 400·Range 엄격 해석)이 사라지고 R2 키 공간 전체가 공개 경로가 된다(버킷에 world 데이터만 두는 불변식 필요 — 지금도 그렇다).
- 캐시 규칙·변환 규칙·R2 도메인은 대시보드/존 API 설정이라 코드 리뷰·CI 밖(drift) — `pnpm killswitch`처럼 스크립트로 확인하는 도구가 필요.
- Free 존: 캐시 규칙 10·변환 규칙 10 안. Tiered Cache·Cache Reserve는 별도.

## 예상 절감(단가 docs/13 §6)
- 세션당 Worker 요청 ≈ 400 → 엣지 HIT면 0. 요청 $0.30/백만 + 로그(10 %) $0.06/백만 → **≈ $0.00014/세션 절감**. 포함량(1,000만 요청/주기) 안에서는 실제 청구액 변화 0 — **월 ≈ 2.5만 세션을 넘을 때부터** 의미(10만 세션/월 ≈ $9 + Workers Logs).
- 남용 내성은 크게 오른다: HIT 요청은 과금 0이라 같은 URL 반복 공격의 비용이 사라지고, 캐시 우회(쿼리 무시)도 규칙으로 막힌다.

## 권고
지금 트래픽에서는 금전 효과가 거의 없고 교차 출처 위험이 있다 → **보류**, 다음 중 하나가 되면 staging부터 구현: ① 주기 Worker 요청이 포함량의 30 % 초과 ② 킬 스위치가 `/world/*` 남용으로 한 번이라도 작동 ③ 23구 확장으로 셀 요청이 5배 이상.
