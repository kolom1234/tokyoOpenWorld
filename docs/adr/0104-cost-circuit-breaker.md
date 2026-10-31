# ADR-0104: 비용 회로 차단기(킬 스위치) — 사용량 30분 감시 → 존 WAF 규칙으로 `/api/*`·`/world/*` 차단
- Status: Accepted (실검증은 사용자 토큰·staging 도메인 준비 뒤 — PROGRESS)
- Date: 2026-11-01

## Context
- 계정은 Workers Paid·R2 Paid(계정 단위)라 포함량을 넘으면 **멈추지 않고 자동 과금**된다. Cloudflare에는 사용량 하드 캡이 없고, 예산 알림($1, 사용자 설정)은 알림만·다음 날 도착한다.
- Worker 안의 방어(ADR-0103)는 요청이 Worker에 닿은 뒤라 Worker 요청·로그 과금 자체는 막지 못한다. 엣지에서 Worker 전에 끊는 수단 = 존 WAF 사용자 정의 규칙(존 earthaimap.com, Free 플랜).
- 사용량 점검(`scripts/cf-usage.ts`, PR #29)이 이미 청구 주기(매월 25일) 누적·주기 말 예상·예상 추가 요금을 계산한다.

## Decision
1. **감시**: `usage.yml`을 30분마다(`*/30 * * * *`, concurrency 1) `node scripts/cf-usage.ts --github-issue --kill-switch`. 70 % 이슈(cf-usage)는 그대로.
2. **차단 조건**(`scripts/lib/breaker.ts`): ours(tokyo-sanpo 자원) 지표 하나라도 포함량 대비 누적 **> 90 %**, 또는 account(계정 전체) 주기 말 **예상 추가 요금 합계 > $1**.
   카운터 예상은 `누적 ÷ max(경과 비율, 3일/주기)` — 주기 첫 몇 시간의 급증이 30배 이상 부풀어 production을 막는 오탐을 막는다(이미 넘은 실제 초과는 그대로 잡힘). 저장량은 기존 예상(누적 GB-월 + 최근 값 유지).
   account 조건은 다른 프로젝트(같은 계정) 사용량도 포함한다(청구가 계정 단위 — 사용자 요구). 이슈에 원인 지표·상위 자원 이름을 적어 판단을 돕는다.
3. **차단**: 존 엔트리포인트(`http_request_firewall_custom`)에 미리 만든 규칙 `sanpo-kill-switch`(평소 **비활성**): `http.host eq "earthaimap.com" and (starts_with(path, "/world/") or starts_with(path, "/api/"))` → block,
   사용자 응답 `503 {"error":"maintenance"}`(플랜이 거부하면 기본 403 차단 페이지로 자동 대체). 정적 게임 파일(`/`, `/assets/*`)은 막지 않는다 → 게임이 `/api/world/current` 차단을 보고 **점검 화면**(`world-status` `maintenance` ← 503 maintenance 또는 JSON 없는 403, ui `LoadingStage 'maintenance'`).
   맨 앞에 넣는다(차단 = 종료 동작). 규칙 생성은 엔트리포인트가 없을 때만 POST 생성 — PUT은 기존 규칙(사용자 규칙)을 덮으므로 쓰지 않는다.
4. **알림**: 차단 조건이면 라벨 `cf-kill-switch` 이슈(열린 것이 있으면 본문 갱신 — 알림은 처음 한 번)에 원인·조치·해제 절차.
5. **해제는 수동만**: `CF_KILLSWITCH_TOKEN=… pnpm killswitch off`(docs/13 §6). 자동 재활성화 없음.
6. **권한 분리**: 차단은 별도 시크릿 `CF_KILLSWITCH_TOKEN`(존 earthaimap.com 한정 **Zone → WAF: Edit** + **Zone → Zone: Read**; 저장소 변수 `CF_ZONE_ID`를 두면 Zone Read도 불필요). 없으면 감시·이슈만 하고 차단은 건너뛴다. 기존 `CLOUDFLARE_API_TOKEN`에 존 쓰기 권한을 더하지 않는다.
7. **실검증 규칙**: `sanpo-kill-switch-staging-test`(host `staging.earthaimap.com` — staging Worker 커스텀 도메인). workers.dev는 존 WAF 밖이라 staging 시험은 존 아래 호스트가 필요하다. production 규칙은 만들기만 하고 켜지 않는다.
8. **추가 절감**: `limits.cpu_ms = 50`(7일 실측 p99.9 4.5–5.3 ms의 ≈ 10배), production `observability.head_sampling_rate = 0.1`(폭주 때 로그 과금이 요청 과금의 2배로 붙지 않게; staging 1).

## Consequences
- 감시 간격(30분 + GitHub 일정 지연 수 분) + GraphQL 반영 지연 동안의 사용량은 막지 못한다 — 최악의 경우 그 사이 요청만큼 과금. 존 WAF 요청 제한 규칙(사용자, `/api/log`)이 순간 폭주를 받는다.
- 차단 중에도 정적 에셋은 제공(Workers Static Assets 요청은 무료·무제한). 게임은 부팅 시 점검 화면, 이미 플레이 중이면 새 셀 로드만 실패한다.
- 공개 저장소의 일정 워크플로는 60일간 활동이 없으면 GitHub가 끈다 — 다시 켜야 감시가 돈다.
- 다른 프로젝트 사용량으로도 TOKYO SANPO가 막힐 수 있다(사용자 결정). 원인이 다른 프로젝트면 이슈를 보고 해제 여부를 사람이 정한다.

## Alternatives
- Worker 안에서 전역 카운터(Durable Object)로 거절 → 요청은 이미 과금, DO 비용 추가 → 기각.
- 예산 알림만 → 다음 날 알림·차단 없음 → 보조로만.
- Worker 배포 내리기(`wrangler delete`·도메인 제거) → 게임 화면까지 사라지고 복구가 느리다 → WAF 규칙(토글 한 번) 채택.
- 사용량 GraphQL을 Worker Cron Trigger로 → Worker 안에 계정 분석 토큰(비밀값)을 두게 된다(Worker 비밀값 없음 불변식) → GitHub Actions에서.
