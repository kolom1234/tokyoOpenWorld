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
- WAF 규칙 켜기/끄기 실검증: **대기** — 존 WAF 토큰(`CF_KILLSWITCH_TOKEN`)과 staging 커스텀 도메인 `staging.earthaimap.com`이 필요(PROGRESS Blockers). 단위 테스트(규칙 식·멱등 ensure·PATCH·사용자 응답 거부 시 기본 차단)와 게임 점검 화면 테스트는 통과.

## 4. production 최종 판정
배포·승인 뒤 같은 스크립트와 TLS·HTTP 리다이렉트·HSTS·iframe 검사를 `https://earthaimap.com` 대상으로 다시 돌려 여기에 F01–F08 최종표(해결/부분/미해결 + 증거)를 남긴다.
