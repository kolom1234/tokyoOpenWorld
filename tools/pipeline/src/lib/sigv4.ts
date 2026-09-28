// AWS Signature V4(헤더 서명) — R2 S3 호환 API용 최소 구현(node:crypto). see https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html
import { createHash, createHmac } from 'node:crypto';

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface SignInput {
  method: string;
  url: URL;
  /** 서명할 헤더(소문자 키 권장). host는 url에서 자동. */
  headers: Record<string, string>;
  /** 본문 sha256 hex 또는 'UNSIGNED-PAYLOAD'. */
  payloadHash: string;
  region: string;
  service: string;
  /** 서명 시각(테스트 주입). */
  date?: Date;
}

export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

const hmac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 인코딩(S3 규칙: 경로는 '/' 유지). */
export function uriEncode(s: string, keepSlash: boolean): string {
  return [...new TextEncoder().encode(s)]
    .map((b) => {
      const c = String.fromCharCode(b);
      if (/[A-Za-z0-9\-._~]/.test(c) || (keepSlash && c === '/')) return c;
      return `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

function canonicalQuery(url: URL): string {
  const pairs = [...url.searchParams.entries()].map(([k, v]) => [uriEncode(k, false), uriEncode(v, false)] as const);
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join('&');
}

function amzDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** 서명된 헤더 집합(입력 헤더 + host + x-amz-date + Authorization) 반환. */
export function signV4(input: SignInput, cred: SigV4Credentials): Record<string, string> {
  const now = amzDate(input.date ?? new Date());
  const day = now.slice(0, 8);
  const headers: Record<string, string> = { ...input.headers, host: input.url.host, 'x-amz-date': now };
  const names = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]),
  );
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonical = [
    input.method,
    uriEncode(decodeURIComponent(input.url.pathname), true),
    canonicalQuery(input.url),
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', now, scope, sha256Hex(canonical)].join('\n');
  const kDate = hmac(`AWS4${cred.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
