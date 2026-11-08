# 보안 점검(Codex 2026-10-23) 후속 — 재검증 기록
대상 보고서: `security-review-2026-10-23.md`(배포 커밋 a752cd7 기준, F01–F08). 수정 = PR #30(브랜치 `claude/security-cost-guard`), 결정 = ADR-0103(Worker 경계)·ADR-0104(비용 회로 차단기)·ADR-0105(제안).
Codex 재현 스크립트는 원본을 수정하지 않고 **대상 URL만 바꾼 작업용 복사본**으로 돌렸다(`local_security_checks.mjs`는 원본이 읽던 a752cd7 증거 파일 부분만 빼고, null이 된 `parseReport` 결과를 처리). 대량 요청·부하 시험 없음.

## 1. staging 재검증 (2026-11-01, `tokyo-sanpo-staging` 버전 1ccd6a59 = 커밋 23d465c)
| ID | 재현 케이스(Codex 증거 id) | a752cd7(보고서) | staging 지금 | 판정 |
|---|---|---|---|---|
| F01 | `http-root`·`http-api`·`http-world` | 200 평문 | production 2026-10-31: 301 → https, HSTS `max-age=2592000`(존 설정). staging workers.dev는 존 밖(200) | 해결됨(존 설정) — production 기준 |
| F02 | TLS 1.0/1.1 핸드셰이크 | 수락 | production 2026-10-31: 서버가 `protocol_version`으로 거부, 1.2·1.3만. staging workers.dev(Cloudflare 공용 도메인)는 1.0/1.1 수락 — 계정 설정 밖 → production workers.dev는 끔(ADR-0103 15) | 해결됨(존 설정) — production 기준 |
| F03 | `log-cross-site-plain-once`(외부 Origin + text/plain) | 204 기록 | **415** | 해결 |
| F03 | 외부 Origin + JSON | 204 | **403** `origin_not_allowed` | 해결 |
| F03 | `sampleRate: 1e-300` | 수락(가중 1e300) | **400**(로컬 `parseReport` = null) | 해결 |
| F03 | 같은 IP 반복 | 제한 없음 | 1 s 간격 5번째부터 **429**(순간 버스트는 한도를 조금 넘을 수 있음 — Rate Limiting 바인딩은 PoP 근사) | 해결(근사) |
| F04 | `stream-limit-after-read`(Content-Length 없는 48 KiB) | 끝까지 읽고 413 | **413**, 스트림 취소, 12 KiB만 생산(버퍼링 3 chunk) | 해결 |
| F04 | `utf8-byte-limit`(2,528자 = 7,528 B) | 204 수락 | JSON이면 **413**, Content-Type 없으면 415 | 해결 |
| F04 | 손상 UTF-8 | — | **400** `bad_encoding` | 해결 |
| F05 | `manifest-query`(쓰이지 않는 쿼리) | MISS(캐시 우회) | **400** `unexpected_query` | 해결 |
| F05 | `missing-object` → `world-missing-again` | MISS → MISS | **MISS → HIT**(404 300 s 네거티브 캐시) | 해결 |
| F05 | `manifest`·`manifest-range`·`conditional-match` | 200·206·304 | 200 HIT·206 BYPASS·304 BYPASS(유지) | 정상 |
| F07 | `range-out-of-bounds` | 500 / 1101 | **416**, `Content-Range: bytes */725`, 보안 헤더 유지 | 해결 |
| F07 | `range-syntax-invalid`(`bytes=bad`) | 206 전체 | **200** 전체(캐시 HIT) | 해결 |
| F07 | 사용자 입력 5xx | 1101 | 63+10 케이스 중 5xx 0(`nul`·`trace`는 Cloudflare 엣지 400/405) | 해결 |
| F06 | `frame-test.html`(127.0.0.1:8766 → staging iframe) | 표시됨 | 콘솔 `Framing … violates "frame-ancestors 'none'"` — **차단** | 해결 |
| F08 | OSV querybatch(lockfile 269 + 런타임 26) | 5패키지 20권고 | **0건**, `pnpm audit` 0건(285) | 해결 |

기타(보고서 §5): production workers.dev·프리뷰 끔(ADR-0103 15), Actions SHA 고정·dependabot·`security` 잡, 관측 로그 쿼리 지움(staging 확인), production 빌드 진단 도구 제외(번들 확인), 세이브 가져오기 상한(단위 테스트).

## 2. 실제 GPU 회귀 (staging, RTX 3050 Laptop, Chrome WebGPU, 1600×900)
타이틀 → 새 산책 → HUD(WebGPU, crossOriginIsolated, 셀 77–83 `.tkc`, WASM 1, 워커 스크립트 12, KTX2 6, 오디오 5–6) → 지도(`map.pmtiles`, 지명·빠른 이동) → 66 s 뒤 새로 고침 → "이어하기" ✅. 콘솔 오류 0, 4xx/5xx 응답 0. 스모크(`smoke.sh`) ✅.

## 3. 비용 회로 차단기 (ADR-0104)
- 판정 실데이터(2026-11-01): `breaker: ok (account projected extra $0.00)` — ours 최대 0.0 %, account KV 쓰기 7.7 %(주기 말 35.7 %, 다른 프로젝트).
- WAF 규칙 켜기/끄기 실검증: **완료(2026-11-08 후속, 사용자 승인)** — 존 한정 토큰(`CF_KILLSWITCH_TOKEN`)을 GitHub Secret·Windows 사용자 환경 변수에 등록하고 `staging.earthaimap.com`을 연결했다. API·활성 월드 파일 200→403→200, 정적 화면·production API 200 유지 확인. 최종 두 규칙 비활성(조건 발생 시 production 자동 차단 준비). Free 존은 기본 403 응답. usage run `42456075881` 성공·Secret 주입 확인·breaker ok. production 강제 차단은 시험하지 않았다(docs/13 §6.1).
- 감시 주기 실측(2026-11-01~08, `*/30`): 예약 실행 29회/7.2일(간격 3–7시간) — GitHub가 정각·30분 예약을 버림 → `13,43 * * * *`로 변경(후속 PR).

## 4. production 최종 판정 (2026-11-08, `https://earthaimap.com`)
배포: GitHub Deploy run #29(`main@9de2aea` = PR #30 + #31 + #32) — supersede ✅(대기 중이던 run #27·#28을 자동 취소), staging ✅, production 승인 → `wrangler deploy` 06:04 UTC 100 %, `https://earthaimap.com` 스모크 ✅.
Cloudflare API(설정 확인): production `workers.dev`·프리뷰 꺼짐(`tokyo-sanpo.kolom1357.workers.dev/api/health` → 404), `observability` 샘플링 0.1·`redact_query_string: true`, `limits.cpu_ms` 50, 바인딩 `LOG_LIMITER`(ratelimit)·`DEPLOY_ENV`.
도구: Codex `live_audit.py`·`extra_live.py`·`dependency_tls_audit.py`(대상 원본 그대로 earthaimap.com — 작업용 복사본에서 실행), `local_security_checks.mjs`(§1과 같은 작업용 변경), `frame-test.html`(127.0.0.1:8766), 실제 GPU Chrome.

| ID | 보고서(a752cd7) | production 지금 — 증거 | 판정 |
|---|---|---|---|
| F01 HTTP 평문·HSTS | `http-root`·`http-api`·`http-world` 200, HSTS 없음 | 6개 경로(문서·API·월드·없는 에셋·API 404·월드 404) 모두 `301 → https://…`(경로 유지), HTTPS 응답 HSTS `max-age=2592000` 한 번(중복 없음) | **해결**(존 설정) |
| F02 TLS 1.0/1.1 | 수락 | TLS 1.0·1.1 서버가 `protocol_version` 경고로 거부, 1.2·1.3 성공(`dependency_tls_audit.py`·직접 검사 둘 다) | **해결**(존 설정) |
| F03 오류 API 남용 | 외부 Origin + text/plain 204, 샘플률 1e-300 수락, 제한 없음 | `log-cross-site-plain-once` **415**, 외부 Origin JSON **403**, `sampleRate 1e-300` **400**, `kind:"test"`(자기 출처) **400**(production 거절), 요청 제한 바인딩 배포 확인(429 동작은 staging 실측 — production 부하 시험 안 함) | **해결** |
| F04 본문 제한 | 끝까지 읽고 413, 7,528 B 한글 204 | `log-oversize`(4,097 B) **413**; 배포 코드 로컬 재현: 48 KiB 스트림 12 KiB에서 취소 413, 7,528 B 한글 JSON 413(Content-Type 없으면 415) | **해결** |
| F05 캐시 우회·404 | 쿼리 MISS, 404 MISS→MISS | `manifest-query` **400**, `missing-object` → `world-missing-again` **MISS → HIT**, `manifest`·`-warm` HIT, `manifest-range` 206 BYPASS, `conditional-match` 304 | **해결** |
| F06 iframe | 외부 출처 iframe에 게임 표시 | 127.0.0.1:8766 iframe → 콘솔 `Framing 'https://earthaimap.com/' violates … "frame-ancestors 'none'"` 차단, 모든 응답 `X-Frame-Options: DENY` | **해결** |
| F07 Range·1101 | 범위 초과 500/1101, `bytes=bad` 206 | `range-out-of-bounds` **416** `bytes */725`(보안 헤더 유지), `range-syntax-invalid` **200** 전체(HIT), 사용자 입력 5xx 0(`nul`·`trace`는 Cloudflare 엣지 400/405) | **해결** |
| F08 의존성 | 5패키지 20권고 | OSV querybatch 269 + 런타임 26 → **0건**, `pnpm audit` 0건, CI `security` 잡 | **해결** |

보고서 §5 강화 항목: Actions SHA 고정·dependabot(첫 PR #31 병합)·`security` 잡 ✅, 대체 접근 경로(workers.dev) 꺼짐 ✅, 관측 로그 쿼리 지움 ✅(보존 7일은 요금제 고정), 디버그 기능 — production 번들에 `ui-sandbox`·`decode-probe`·`physics-probe`·`report=force` 없음 ✅(`?world=mini`는 경로 상수만, 픽스처 파일 없음), 세이브 가져오기 상한 ✅(단위 테스트), Referrer·Permissions-Policy ✅(PR #28).
남은 위험·보류: ① 킬 스위치는 토큰 등록·staging 실검증 완료했지만 실시간 과금 상한은 아님(예약·집계 지연, 다른 프로젝트·저장 비용은 차단 밖 — docs/13 §6.1) ② `/api/log` 요청 제한은 PoP 근사(순간 버스트 일부 통과) ③ Range·HEAD 요청은 여전히 R2 직행(요청 비용 억제 = 킬 스위치, 구조 개선 = ADR-0105 제안) ④ 독립 리뷰(승인 0명)·HSTS preload 등 운영 결정 항목은 범위 밖.

### 실제 GPU 회귀(production)
RTX 3050 Laptop(33.8 W)·Chrome WebGPU·1600×900, 새 컨텍스트(캐시 없음): 타이틀 15.7–17.1 s → 새 산책 → HUD(WebGPU, crossOriginIsolated, `.tkc` 77, KTX2 11, WASM 2, 워커 스크립트 16, 오디오 6) → 지도(`map.pmtiles`) → HUD 70 s 뒤 IndexedDB `save/v2` 생성 → 새로 고침 → "이어하기" ✅. 콘솔 오류 0, 4xx/5xx 응답 0.
첫 시도는 LAX 라우팅(아래)으로 첫 로드가 느려 타이틀이 120 s 안에 뜨지 않았다 — 같은 시각 staging·speed.cloudflare.com 대조로 배포 회귀가 아님을 확인한 뒤 대기 시간을 늘려 통과.

### 관찰: 한국 회선의 먼 PoP 라우팅(보안 아님, 성능)
2026-11-08 이 PC(서울)에서 earthaimap.com·staging(workers.dev) 모두 **LAX** PoP로 연결, 캐시 HIT 파일도 0.12 MB/s(1.71 MB 14 s, 큰 텍스처 60 s 초과). 같은 시각 `speed.cloudflare.com`은 ICN 18.8 MB/s. 10-31에는 HKG. 첫 로드 ≈ 26 MB라 이 상태면 첫 화면까지 수 분 — 배포 회귀가 아니라 Cloudflare가 이 회선의 요청을 어느 PoP로 보내는지의 문제(플랜·통신사 피어링에 따라 달라짐). 대응 후보는 PROGRESS Known Issues.
