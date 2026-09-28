// 퍼블리시 업로더 2종: `s3`(R2 S3 호환 API, SigV4 — 단일 PUT·멀티파트·HEAD 검증) / `api`(Cloudflare REST, API 토큰 — wrangler와 같은 엔드포인트).
// + KV(포인터·빌드 목록)는 REST로. 비밀값은 환경 변수로만 받는다(로그·인자 금지). see docs/04-data-pipeline.md §4.7, docs/13-deployment.md §7
import { type SigV4Credentials, sha256Hex, signV4, uriEncode } from '../../lib/sigv4.ts';

/** 이보다 크면 멀티파트(파트 16 MiB). R2 단일 PUT 상한 ≈ 5 GiB보다 훨씬 작게 잡아 재시도 비용을 줄인다. */
export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
export const PART_SIZE = 16 * 1024 * 1024;
const CF_API = 'https://api.cloudflare.com/client/v4';

export interface ObjectPut {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** body sha256 hex(미리 계산된 값 재사용). */
  sha256: string;
}

export interface Uploader {
  readonly name: 's3' | 'api';
  put(o: ObjectPut): Promise<void>;
  /** 크기(없으면 undefined). api 업로더는 검증 불가 → undefined 반환하지 않고 null. */
  size(key: string): Promise<number | undefined | null>;
  delete(key: string): Promise<void>;
}

type FetchFn = typeof fetch;

/** TS DOM lib의 BodyInit은 Uint8Array<ArrayBufferLike>를 받지 않는다(런타임은 받음). */
const asBody = (b: Uint8Array | string): BodyInit => b as unknown as BodyInit;

async function ok(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const text = await res.text().catch(() => '');
  throw new Error(`${what}: HTTP ${res.status} ${text.slice(0, 300)}`);
}

export interface S3Options {
  accountId: string;
  bucket: string;
  cred: SigV4Credentials;
  fetch?: FetchFn;
  /** 기본 https://<account>.r2.cloudflarestorage.com */
  endpoint?: string;
}

type S3Call = (
  method: string,
  u: URL,
  body: Uint8Array | string | undefined,
  extra?: Record<string, string>,
) => Promise<Response>;

/** 멀티파트: Create → UploadPart(16 MiB) × n → Complete, 실패 시 Abort. */
async function multipart(call: S3Call, url: (key: string, q?: string) => URL, p: ObjectPut): Promise<void> {
  const init = await ok(
    await call('POST', url(p.key, '?uploads'), '', { 'content-type': p.contentType }),
    'CreateMultipartUpload',
  );
  const uploadId = /<UploadId>([^<]+)<\/UploadId>/.exec(await init.text())?.[1];
  if (!uploadId) throw new Error('CreateMultipartUpload: no UploadId');
  const id = encodeURIComponent(uploadId);
  try {
    const etags: string[] = [];
    for (let i = 0, n = 1; i < p.body.length; i += PART_SIZE, n++) {
      const res = await ok(
        await call('PUT', url(p.key, `?partNumber=${n}&uploadId=${id}`), p.body.subarray(i, i + PART_SIZE)),
        `UploadPart ${n}`,
      );
      etags.push(res.headers.get('etag') ?? '');
    }
    const parts = etags.map((e, i) => `<Part><PartNumber>${i + 1}</PartNumber><ETag>${e}</ETag></Part>`).join('');
    await ok(
      await call('POST', url(p.key, `?uploadId=${id}`), `<CompleteMultipartUpload>${parts}</CompleteMultipartUpload>`),
      'CompleteMultipartUpload',
    );
  } catch (e) {
    await call('DELETE', url(p.key, `?uploadId=${id}`), undefined).catch(() => undefined);
    throw e;
  }
}

/** R2 S3 호환(경로 스타일, region auto). */
export function createS3Uploader(o: S3Options): Uploader {
  const f = o.fetch ?? fetch;
  const base = o.endpoint ?? `https://${o.accountId}.r2.cloudflarestorage.com`;
  const url = (key: string, q = ''): URL => new URL(`${base}/${o.bucket}/${uriEncode(key, true)}${q}`);
  const call: S3Call = (method, u, body, extra = {}) => {
    const payloadHash = body === undefined ? sha256Hex('') : sha256Hex(body);
    const headers = signV4(
      {
        method,
        url: u,
        headers: { ...extra, 'x-amz-content-sha256': payloadHash },
        payloadHash,
        region: 'auto',
        service: 's3',
      },
      o.cred,
    );
    // host는 서명에만 쓰고 fetch가 직접 붙이게 한다(금지 헤더).
    const { host: _host, ...send } = headers;
    return f(u, { method, headers: send, ...(body === undefined ? {} : { body: asBody(body) }) });
  };
  return {
    name: 's3',
    async put(p) {
      if (p.body.length > MULTIPART_THRESHOLD) return multipart(call, url, p);
      await ok(await call('PUT', url(p.key), p.body, { 'content-type': p.contentType }), `PutObject ${p.key}`);
    },
    async size(key) {
      const res = await call('HEAD', url(key), undefined);
      if (res.status === 404) return undefined;
      await ok(res, `HeadObject ${key}`);
      return Number(res.headers.get('content-length'));
    },
    async delete(key) {
      const res = await call('DELETE', url(key), undefined);
      if (res.status !== 404) await ok(res, `DeleteObject ${key}`);
    },
  };
}

export interface ApiOptions {
  accountId: string;
  bucket: string;
  token: string;
  fetch?: FetchFn;
}

/** Cloudflare REST(R2 objects) — wrangler `r2 object put --remote`와 같은 엔드포인트. 크기 검증은 불가(null). */
export function createApiUploader(o: ApiOptions): Uploader {
  const f = o.fetch ?? fetch;
  const url = (key: string): string =>
    `${CF_API}/accounts/${o.accountId}/r2/buckets/${o.bucket}/objects/${uriEncode(key, true)}`;
  const auth = { authorization: `Bearer ${o.token}` };
  return {
    name: 'api',
    async put(p) {
      await ok(
        await f(url(p.key), {
          method: 'PUT',
          headers: { ...auth, 'content-type': p.contentType },
          body: asBody(p.body),
        }),
        `R2 PUT ${p.key}`,
      );
    },
    size: async () => null,
    async delete(key) {
      const res = await f(url(key), { method: 'DELETE', headers: auth });
      if (res.status !== 404) await ok(res, `R2 DELETE ${key}`);
    },
  };
}

export interface KvClient {
  get(key: string): Promise<string | undefined>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createKvClient(o: {
  accountId: string;
  namespaceId: string;
  token: string;
  fetch?: FetchFn;
}): KvClient {
  const f = o.fetch ?? fetch;
  const url = (key: string): string =>
    `${CF_API}/accounts/${o.accountId}/storage/kv/namespaces/${o.namespaceId}/values/${encodeURIComponent(key)}`;
  const auth = { authorization: `Bearer ${o.token}` };
  return {
    async get(key) {
      const res = await f(url(key), { headers: auth });
      if (res.status === 404) return undefined;
      return (await ok(res, `KV GET ${key}`)).text();
    },
    async put(key, value) {
      await ok(
        await f(url(key), { method: 'PUT', headers: { ...auth, 'content-type': 'text/plain' }, body: value }),
        `KV PUT ${key}`,
      );
    },
    async delete(key) {
      const res = await f(url(key), { method: 'DELETE', headers: auth });
      if (res.status !== 404) await ok(res, `KV DELETE ${key}`);
    },
  };
}

/** 토큰으로 접근 가능한 계정 1개(여럿이면 CLOUDFLARE_ACCOUNT_ID 필요). */
export async function resolveAccountId(token: string, f: FetchFn = fetch): Promise<string> {
  const res = await ok(
    await f(`${CF_API}/accounts?per_page=5`, { headers: { authorization: `Bearer ${token}` } }),
    'accounts',
  );
  const body = (await res.json()) as { result?: { id: string }[] };
  const ids = body.result?.map((a) => a.id) ?? [];
  if (ids.length !== 1) throw new Error(`accounts: ${ids.length} found — set CLOUDFLARE_ACCOUNT_ID`);
  return ids[0] as string;
}
