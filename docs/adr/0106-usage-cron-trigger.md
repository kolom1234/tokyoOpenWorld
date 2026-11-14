# ADR-0106: 비용 감시 30분 트리거를 Cloudflare Cron Worker로 — GitHub 예약 실행은 백업
- Status: Accepted
- Date: 2026-11-14

## Context
- 비용 회로 차단기(ADR-0104)는 `usage.yml`이 30분마다 돌아야 한다. GitHub 예약 실행 실측: `*/30` → 29회/7.2일(2026-11-01~08), 부하가 적은 분 `13,43` → **22회/6일**(2026-11-08~14, 하루 3–4회, 간격 3–8시간). GitHub 문서대로 예약 실행은 늦추거나 버려질 수 있어, 과금 급증을 몇 시간 늦게 잡는다.
- 판정·차단 로직(`scripts/cf-usage.ts --kill-switch`)과 토큰(Account Analytics Read, `CF_KILLSWITCH_TOKEN`)은 GitHub Actions에 있고 잘 동작한다(실패 0). 바꿀 것은 **트리거**뿐.
- 게임 Worker(`apps/worker`)는 "비밀값 없음" 불변식을 지킨다(ADR-0015·0102).

## Decision
1. 별도 Worker **`sanpo-usage-cron`**(`apps/usage-cron`): Cloudflare Cron Trigger `*/30 * * * *` → GitHub REST `POST /repos/kolom1234/tokyoOpenWorld/actions/workflows/usage.yml/dispatches {"ref":"main"}`. 성공 = 204, 그 밖은 예외(Cron 실행 실패로 기록 — Workers Logs). 공개 경로 없음(`workers_dev`·`preview_urls` 끔, 라우트 없음, `fetch` = 404). `limits.cpu_ms` 50.
2. 비밀값 = Worker secret **`GITHUB_DISPATCH_TOKEN`**: fine-grained PAT, 저장소 `kolom1234/tokyoOpenWorld` 하나, 권한 **Actions: Read and write**만(Metadata: Read는 자동). 사람이 `wrangler secret put`으로만 넣는다.
3. `usage.yml`의 GitHub 예약 실행(`13,43`)은 **백업**으로 남긴다. 둘이 겹쳐도 concurrency 그룹(`cf-usage`)이 차례로 돌린다(실행 2회 = GraphQL 몇 번, 무해).
4. **감시 지연 경보**: 저장소 변수 `USAGE_CRON_ACTIVE=true`이면 매 실행 처음에 직전 **성공** 실행과의 간격을 보고 2시간을 넘으면 라벨 `cf-usage-watchdog` 이슈(열린 것이 있으면 본문 갱신). 트리거·PAT가 고장 나도 백업 예약 실행이 이를 알린다.
5. 배포는 수동 `pnpm --filter @sanpo/usage-cron deploy`(게임 Deploy 워크플로와 별개 — 거의 바뀌지 않는다). 레이어: `apps/usage-cron`은 워크스페이스 패키지를 import하지 않는다(`.dependency-cruiser.cjs`, 01 §4).

## Consequences
- 감시 간격 = 30분 + Actions 대기·실행(보통 1–2분). 차단기 지연의 최악은 이제 "30분 + GraphQL 반영 지연".
- 요청 비용: Cron 호출 하루 48회(월 ≈ 1,440 요청) — 포함량의 0.01 % 수준. Actions 분: 공개 저장소라 무료.
- PAT가 새면: 이 저장소의 워크플로를 실행·취소·재실행할 수 있다(코드·Secret 읽기 불가, production 배포는 Environment 승인 필요). 만료를 두면 만료 날 경보 이슈가 열린다 — 만료 전에 새 PAT를 `wrangler secret put`.
- Cloudflare 계정이 멈추면(대규모 장애) 트리거도 멈추지만 백업 예약 실행과 경보 이슈가 남는다.

## Alternatives
- 판정·차단 로직 전체를 Worker Cron으로 옮기기 → Worker에 계정 분석 토큰·WAF 토큰·GitHub 이슈 토큰 3개가 들어가고, 검증된 Actions 코드를 다시 짜야 한다 → 기각(트리거만 옮김).
- 외부 cron 서비스(cron-job.org 등)가 workflow_dispatch 호출 → 제3자가 PAT를 보관 → 기각.
- 게임 Worker(`tokyo-sanpo`)에 Cron 추가 → 비밀값 없음 불변식을 깬다 → 기각.
- 예약 실행 간격만 받아들이기(하루 3–4회) → 차단기 지연 최대 6–8시간 → 기각.
