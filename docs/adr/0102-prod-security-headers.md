# ADR-0102: production 보안 후속 — health 축소, 문서 정책 헤더, HSTS·www 리다이렉트는 Cloudflare 존 설정
- Status: Accepted
- Date: 2026-10-31

## Context
- 공개(2026-10-19, earthaimap.com) 뒤 보안 점검: ① `/api/health`가 `{"ok":true,"bindings":{"world":…,"config":…}}`로 배포 구성을 외부에 보인다 ② `www.earthaimap.com`은 DNS 레코드가 없다(권한 NS 응답 NXDOMAIN, 2026-10-31) ③ 문서 응답에 Referrer-Policy·Permissions-Policy가 없다.
- 2026-10-31 공개 응답 실측: `Strict-Transport-Security: max-age=2592000`이 Worker 응답과 정적 에셋 응답 모두에 이미 붙는다(존 설정 — `_headers`·Worker 코드에는 없음). `http://` → 301 `https://`(Always Use HTTPS).
- 정적 에셋(HTML 포함)은 Worker를 호출하지 않는다(`run_worker_first` = `/world/*`·`/api/*`만). 무료 플랜이라 Worker 요청은 하루 100,000으로 아낀다(docs/13 §6).

## Decision
1. **`/api/health` = `{"ok":true}`만**(200, no-store). 인증 경로는 두지 않는다(비밀값을 새로 들이지 않는다 — Worker는 비밀값 없음 불변식). 저장소 미구성은 이미 `/api/world/current`·`/world/*` 503 `world_storage_unconfigured`로 드러난다(ADR-0015의 "health는 바인딩 유무 보고"를 대체). 스모크는 본문이 정확히 `{"ok":true}`인지 본다.
2. **문서 정책 헤더는 `apps/game/public/_headers`의 `/*`**: `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`(쓰지 않는 accelerometer·camera·display-capture·geolocation·gyroscope·magnetometer·microphone·midi·payment·usb만 끔 — gamepad·fullscreen·autoplay는 기본값). HTML이 Worker를 거치지 않으므로 Worker(`headers.ts`)에 넣어도 페이지에는 닿지 않는다 → Worker 공통 헤더는 그대로(격리·nosniff). Chromium이 모르는 기능 이름은 콘솔 오류를 내므로 넣지 않는다.
3. **HSTS는 Cloudflare 존 설정만**(SSL/TLS → Edge Certificates → HSTS). `_headers`·Worker에는 넣지 않는다(이중 출처·값 불일치 방지 — `apps/game/test/headers.test.ts`가 막는다).
4. **www → apex 301은 Cloudflare Redirect Rule**(대시보드, 사람): proxied `www` 레코드(`AAAA 100::`) + Single Redirect `http.host eq "www.earthaimap.com"` → `concat("https://earthaimap.com", http.request.uri.path)` 301, 쿼리 유지. 절차 = docs/13 §9 4단계.

## Consequences
- 배포 상태 진단은 `/api/world/current?fv=1`(buildId)·`wrangler deployments list`로 한다. health로 바인딩을 볼 수 없다.
- www 리다이렉트는 Worker 요청·코드 없이 엣지에서 끝난다(무료 플랜 Redirect Rules 10개 안). wrangler 배포는 존 규칙·DNS를 건드리지 않는다.
- HSTS 강화(max-age 1년·includeSubDomains·preload)는 www 리다이렉트 확인 뒤 대시보드에서 따로 결정한다(preload는 되돌리기 어렵다).

## Alternatives
- health 상세를 공유 비밀 헤더로만 제공 → 비밀값 관리·회전 부담, 쓰는 곳 없음 → 기각.
- Worker에서 Host가 `www.`면 301 → 정적 에셋이 Worker보다 먼저 응답하므로 `/`는 리다이렉트되지 않고, www에서 받은 페이지의 `/api`만 apex로 넘어가 CORP same-origin에 막힌다. `run_worker_first: true`로 바꾸면 모든 에셋 요청이 Worker 요청(무료 한도)이 된다 → 기각.
- 리다이렉트 전용 Worker + `www` 커스텀 도메인 → 같은 일을 Worker 요청 비용으로 한다 → 기각.
