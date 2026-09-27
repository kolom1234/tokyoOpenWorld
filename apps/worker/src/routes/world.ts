// `/world/<buildId>/<path>` → 엣지 캐시 → R2(Range·조건부). 200 전체 응답만 캐시. see docs/13-deployment.md §4
import { edgeCache } from '../cache.ts';
import type { Env, WorkerContext, WorldBucket, WorldObject, WorldObjectBody, WorldRange } from '../env.ts';
import { json, storageUnconfigured } from '../headers.ts';
import { parseWorldPath } from '../validate.ts';

/** buildId 경로는 내용이 바뀌지 않는다(새 데이터 = 새 buildId). */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** 없는 셀 요청 폭주 완화용 짧은 캐시. */
const NOT_FOUND_CACHE_CONTROL = 'public, max-age=300';

function hasBody(obj: WorldObject | WorldObjectBody): obj is WorldObjectBody {
  return 'body' in obj && obj.body !== null && obj.body !== undefined;
}

function objectHeaders(obj: WorldObject): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  headers.set('Accept-Ranges', 'bytes');
  return headers;
}

/** R2가 돌려준 실제 범위 → `Content-Range: bytes start-end/size`. */
export function contentRange(range: WorldRange, size: number): string {
  if (range.suffix !== undefined) return `bytes ${Math.max(0, size - range.suffix)}-${size - 1}/${size}`;
  const start = range.offset ?? 0;
  const end = range.length !== undefined ? Math.min(size, start + range.length) - 1 : size - 1;
  return `bytes ${start}-${end}/${size}`;
}

async function getObject(bucket: WorldBucket, key: string, request: Request): Promise<Response> {
  const obj = await bucket.get(key, { range: request.headers, onlyIf: request.headers });
  if (obj === null) return json(404, { error: 'not_found' }, NOT_FOUND_CACHE_CONTROL);
  const headers = objectHeaders(obj);
  if (!hasBody(obj)) {
    // 조건부 요청 불일치: If-None-Match/If-Modified-Since → 304, If-Match/If-Unmodified-Since → 412.
    const notModified = request.headers.has('If-None-Match') || request.headers.has('If-Modified-Since');
    return new Response(null, { status: notModified ? 304 : 412, headers });
  }
  if (request.headers.has('Range') && obj.range !== undefined) {
    headers.set('Content-Range', contentRange(obj.range, obj.size));
    return new Response(obj.body, { status: 206, headers });
  }
  return new Response(obj.body, { status: 200, headers });
}

async function headObject(bucket: WorldBucket, key: string): Promise<Response> {
  const obj = await bucket.head(key);
  if (obj === null) return new Response(null, { status: 404, headers: { 'Cache-Control': NOT_FOUND_CACHE_CONTROL } });
  const headers = objectHeaders(obj);
  headers.set('Content-Length', String(obj.size));
  return new Response(null, { status: 200, headers });
}

export async function handleWorldData(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  if (env.WORLD === undefined) return storageUnconfigured('WORLD');
  const parsed = parseWorldPath(new URL(request.url).pathname);
  if (parsed === undefined) return json(400, { error: 'bad_world_path' });
  if (request.method === 'HEAD') return headObject(env.WORLD, parsed.key);

  const cache = edgeCache();
  const cached = await cache?.match(request);
  if (cached !== undefined) return cached;
  const res = await getObject(env.WORLD, parsed.key, request);
  // 206·304·404는 캐시하지 않는다(Range 조각이 전체 응답으로 재사용되는 것 방지).
  if (cache !== undefined && ctx !== undefined && res.status === 200) {
    ctx.waitUntil(cache.put(new Request(request.url), res.clone()));
  }
  return res;
}
