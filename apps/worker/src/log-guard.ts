// `/api/log` 남용 방어(ADR-0103): Content-Type·Origin 허용 목록·IP 요청 제한(해시 키)(F03) + 실제 수신 바이트 본문 상한(F04). see docs/13-deployment.md §4
import type { Env } from './env.ts';
import { json } from './headers.ts';

/**
 * 게임을 서빙하는 출처. **보조 수단** — 브라우저 밖(curl 등)은 Origin을 빼거나 위조할 수 있으므로 단독 방어가 아니다
 * (Origin이 없는 요청은 통과 → 요청 제한·WAF 규칙이 막는다). 목적: 다른 사이트의 브라우저가 몰래 보내는 보고 차단.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  'https://earthaimap.com',
  'https://tokyo-sanpo-staging.kolom1357.workers.dev',
  // staging 커스텀 도메인(킬 스위치 실검증 — 존 WAF 아래, ADR-0104).
  'https://staging.earthaimap.com',
]);
const ALLOWED_ORIGIN_PATTERNS: readonly RegExp[] = [
  // staging 프리뷰 별칭(`pr-<N>-…`)·버전 프리뷰(`<8 hex>-…`) — 이 계정 서브도메인만.
  /^https:\/\/[a-z0-9-]+-tokyo-sanpo-staging\.kolom1357\.workers\.dev$/,
  // 로컬 개발(vite 5173·preview 4173·wrangler dev 8787 등).
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
];

export function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/** `application/json`(매개변수 허용, 대소문자 무시)만. text/plain 단순 POST(CORS 프리플라이트 없음)를 막는다. */
export function isJsonContentType(value: string | null): boolean {
  return value !== null && value.split(';')[0]?.trim().toLowerCase() === 'application/json';
}

/** IP 원문 대신 SHA-256 앞 8바이트(16 hex) — 요청 제한 키로만 쓰고 저장하지 않는다. */
export async function clientKey(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`sanpo-log:${ip}`));
  return Array.from(new Uint8Array(digest, 0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 본문을 읽기 전 검사. 거절이면 응답, 통과면 undefined. 순서: 415 → 403 → 429(제한 카운트는 앞 검사를 통과한 요청만). */
export async function guardLogRequest(request: Request, env: Env): Promise<Response | undefined> {
  if (!isJsonContentType(request.headers.get('Content-Type'))) return json(415, { error: 'unsupported_media_type' });
  const origin = request.headers.get('Origin');
  if (origin !== null && !isAllowedOrigin(origin)) return json(403, { error: 'origin_not_allowed' });
  if (env.LOG_LIMITER !== undefined) {
    const { success } = await env.LOG_LIMITER.limit({ key: await clientKey(request) });
    if (!success) return json(429, { error: 'rate_limited' });
  }
  return undefined;
}

export type BodyResult = { ok: true; text: string } | { ok: false; response: Response };

const tooLarge = (): BodyResult => ({ ok: false, response: json(413, { error: 'too_large' }) });

function concat(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * 본문을 **실제 수신 바이트**로 누적해 `maxBytes`를 넘는 순간 `reader.cancel()` → 413(나머지는 읽지 않는다, F04).
 * Content-Length는 빠른 거절용 보조(없거나 거짓이어도 스트림 누적이 정본). 상한 안에서만 UTF-8 엄격 디코딩 — 손상이면 400.
 */
export async function readLimitedText(request: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('body too large');
        return tooLarge();
      }
      chunks.push(value);
    }
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(concat(chunks, total)) };
  } catch {
    return { ok: false, response: json(400, { error: 'bad_encoding' }) };
  }
}
