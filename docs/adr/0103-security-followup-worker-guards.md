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

## Consequences
- 다른 사이트의 브라우저는 `/api/log`에 쓸 수 없다(JSON은 프리플라이트 → 405, text/plain은 415). curl 등은 Origin을 빼면 통과하지만 IP당 분당 10회로 묶인다.
- Rate Limiting 바인딩은 env 간 상속되지 않는다 → production·staging에 각각(namespace 1001·1002). 로컬·테스트는 바인딩 없음 = 제한 없음.

## Alternatives
- Origin 필수(없으면 403) → `navigator.sendBeacon`·일부 확장/프록시 환경의 정상 보고까지 잃고, 공격자는 Origin을 넣으면 그만 → 기각.
- 서버가 샘플률을 상수 0.01로 덮어쓰기 → staging `?report=force` 수락 시험의 가중이 100배가 된다 → 허용 값 집합으로.
- Durable Object 원자 카운터로 전역 예산 → DO 요청 과금이 늘고 이 규모에선 과함 → 킬 스위치(ADR-0104)로.
