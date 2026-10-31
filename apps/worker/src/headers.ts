// Worker 응답 공통 헤더(격리·보안)의 단일 출처 + JSON 응답 헬퍼. see docs/13-deployment.md §3
/**
 * 모든 Worker 응답에 붙는 헤더. COOP/COEP → crossOriginIsolated(SharedArrayBuffer).
 * 문서용 CSP는 HTML이 Worker를 거치지 않으므로 game `public/_headers`, HSTS는 Cloudflare 존 설정(ADR-0102).
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

/**
 * Worker가 직접 만든 응답(`/api/*`·`/world/*`·오류 응답)에만 더하는 정책(F06, ADR-0103). JSON·바이너리라 아무것도 불러오지 않는다 →
 * CSP `default-src 'none'`, 프레이밍 금지. Referrer·Permissions-Policy는 `_headers`(ADR-0102)와 같은 값(테스트가 대조).
 * 정적 에셋 위임 응답에는 붙이지 않는다 — 문서 CSP(`_headers`)를 덮어쓰면 게임이 깨진다.
 */
export const WORKER_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=()',
};

/** `workerResponse` = Worker가 만든 응답이면 WORKER_RESPONSE_HEADERS도. */
export function withSecurityHeaders(response: Response, workerResponse = true): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  if (workerResponse) for (const [name, value] of Object.entries(WORKER_RESPONSE_HEADERS)) out.headers.set(name, value);
  return out;
}

export function json(status: number, body: unknown, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cacheControl },
  });
}

/** 저장소 바인딩 미구성 응답(ADR-0015). 클라이언트는 `error` 코드로 "월드 데이터 준비 중"을 표시한다. */
export function storageUnconfigured(binding: 'WORLD' | 'CONFIG'): Response {
  return json(503, {
    error: 'world_storage_unconfigured',
    message: `${binding} binding is not configured on this deployment; world data is disabled.`,
  });
}
