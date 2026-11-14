# apps/usage-cron (Cloudflare Cron Worker)
Layer: — | Depends: (없음) | 배포: `pnpm --filter @sanpo/usage-cron deploy`(수동)

## Purpose
비용 회로 차단기(ADR-0104)의 30분 트리거(ADR-0106): Cloudflare Cron `*/30 * * * *` → GitHub `workflow_dispatch`로 `.github/workflows/usage.yml` 실행. 판정·차단은 Actions(`scripts/cf-usage.ts`).

## Bindings (Env)
```ts
interface Env { GITHUB_DISPATCH_TOKEN?: string /* secret — fine-grained PAT, Actions RW, 이 저장소만 */; GITHUB_REPO?: string; WORKFLOW?: string; REF?: string }
```
- 공개: `dispatchRequest(env, token): Request`, `dispatch(env, fetchFn?): Promise<void>`(204 아니면 예외), `export default { scheduled, fetch }`.

## Invariants
- 공개 경로 없음: `workers_dev`·`preview_urls` 끔, 라우트 없음, `fetch` = 404.
- 토큰은 secret으로만(코드·vars·로그·오류 메시지에 없음 — 테스트로 확인). 게임 Worker(`apps/worker`)에는 비밀값을 두지 않는다.
- 워크스페이스 패키지 import 없음(depcruise `apps/usage-cron: []`).

## Tests
test/dispatch.test.ts — 요청 URL·헤더(Bearer·API 버전·User-Agent)·본문 `{"ref":"main"}`, 204만 성공, 403 메시지에 토큰 없음, 토큰 없으면 예외, `fetch` 404, `scheduled`가 waitUntil로 디스패치.

## Status
2026-11-14 추가(ADR-0106). 운영 절차·경보(`USAGE_CRON_ACTIVE`, 라벨 `cf-usage-watchdog`) = docs/13 §6.1.
