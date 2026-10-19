# ADR-0098: 오류 보고 — Workers Analytics Engine(무료), 세션 1 % 샘플링, 개인정보 필드 없음
- Status: Accepted (M11-T03)
- Date: 2026-10-19

## Context
- M11-T03: 전역 오류 수집(1 % 샘플링, PII 없음), 기기 정보(GPU 티어·백엔드), Analytics Engine 기록. 수락 = 인위적 오류가 대시보드 쿼리로 확인.
- 사용자 조건: IP·이메일·정확한 위치 저장 금지, Cloudflare 무료 플랜에서 될 것.

## Decision
1. **저장 = Workers Analytics Engine**(무료 플랜 포함 — 쓰기 하루 100,000 점·읽기 질의 하루 10,000, 현재 과금 없음). 데이터셋 production `sanpo_errors`, staging `sanpo_errors_staging`(wrangler `analytics_engine_datasets`, 첫 기록 때 생성). 별도 서비스(Sentry 등)·쿠키·외부 전송 없음.
2. **Worker `POST /api/log`**(`routes/log.ts`): 본문 ≤ 4 KB JSON, 허용 필드만(kind error|rejection|boot|worker|test, message ≤ 200, frame ≤ 160, buildId, version, backend, gpuTier −1–3, browser 계열+주 버전, lang, mode, sampleRate). 메시지·프레임은 이메일 → `<email>`, URL 호스트·질의·조각 제거, 6자리 이상 숫자 → `<n>`. **요청의 IP(CF-Connecting-IP)·User-Agent·cf 위치·헤더는 읽지 않는다.** 한 점 = index kind, blob1–9 = kind·message·frame·build·version·backend·browser·lang·mode, double1–2 = gpuTier·sampleRate. 바인딩 없으면 204(기록 없음).
3. **게임**(`apps/game/src/error-report.ts`): window `error`·`unhandledrejection` → 세션 시작 때 한 번 1 % 추첨(crypto 난수 — rng 결정론 대상 아님), 세션당 최대 3건·같은 메시지 1번, `fetch(keepalive)`. GPU 티어 = 저장된 품질 티어(low–ultra → 0–3), UA 원문 대신 계열+주 버전. `?report=force` = 100 %(staging 수락·조사용). 번들 버전 = Vite define `__SANPO_VERSION__`(GITHUB_SHA·git 짧은 해시).
4. **조회** = `pnpm errors [--env staging|production] [--hours N]`(SQL API, 1/샘플률 가중 추정 열) — 토큰 권한 **Account | Account Analytics | Read**. 대시보드 화면 대신 SQL(무료 플랜에 AE 차트 UI 없음).

## Consequences
- 수락(2026-10-19, staging Worker 666dc839): 페이지에서 일부러 던진 오류·거부 2건 → `pnpm errors --hours 1`에 2그룹(이메일·숫자 지워짐, 백엔드 webgpu·chrome 152) ✅.
- 요청 수: 1 % 세션 × 최대 3건 — 무료 Workers 하루 100,000 요청에 영향 미미. 사용량은 M11-T06 일일 점검(70 % 경보)에 함께.
- 보존 기간은 AE 기본(문서상 명시 없음 — 3개월로 알려짐). 장기 보관이 필요하면 주기 내보내기 후속.
