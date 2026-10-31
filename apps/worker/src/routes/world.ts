// `/world/<buildId>/<path>` → 엣지 캐시 → R2(Range·조건부). 200 전체 응답 + 검증된 경로의 404(5분)만 캐시. 쿼리 문자열은 400(F05),
// Range는 엄격 해석(문법 오류 무시 → 200, 만족 불가 → 416, F07). ADR-0103. see docs/13-deployment.md §4
import { edgeCache } from '../cache.ts';
import type { Env, WorkerContext, WorldBucket, WorldObject, WorldObjectBody, WorldRange } from '../env.ts';
import { json, storageUnconfigured } from '../headers.ts';
import { clampRange, conditionalHeaders, isSatisfiable, parseRange } from '../range.ts';
import { parseWorldPath } from '../validate.ts';

/** buildId 경로는 내용이 바뀌지 않는다(새 데이터 = 새 buildId). */
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** 진단 헤더(`X-Sanpo-Cache`: HIT·MISS·BYPASS) — 스모크·perf 확인용. 응답 헤더가 불변이면 복사. */
function withCacheStatus(res: Response, status: 'HIT' | 'MISS' | 'BYPASS'): Response {
  const out = new Response(res.body, res);
  out.headers.set('X-Sanpo-Cache', status);
  return out;
}

/** 없는 객체 반복 요청이 R2를 다시 조회하지 않게 엣지에도 넣는 짧은 캐시(검증된 경로만 — 새 데이터는 새 buildId라 늦게 생기는 키는 없다). */
const NOT_FOUND_CACHE_CONTROL = 'public, max-age=300';
/** 엣지 캐시에 넣는 상태: 200 전체 응답·404(206 조각·304·412는 넣지 않는다). */
const CACHEABLE_STATUSES = new Set([200, 404]);

/** 캐시 키 = 출처 + 경로(쿼리·헤더 제외) — 같은 객체가 URL 변형으로 여러 키가 되지 않게. */
function cacheKey(url: URL): Request {
  return new Request(`${url.origin}${url.pathname}`);
}

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

/** R2 읽기 계획: 해석된 범위(없으면 전체)·조건부 헤더(없으면 무조건). */
interface ReadPlan {
  range?: WorldRange;
  onlyIf?: Headers;
}

/** 만족할 수 없는 범위 → 416 + 전체 크기만 담은 Content-Range(RFC 9110 §15.5.17 — 시작·끝 자리는 별표). */
function unsatisfiable(size: number): Response {
  const res = json(416, { error: 'range_not_satisfiable' });
  res.headers.set('Content-Range', `bytes */${size}`);
  return res;
}

/** 범위 읽기를 R2가 거절했을 때(예: 시작 ≥ 크기 — 예외): head로 크기를 보고 404·416, 끝이 넘친 범위는 잘라 한 번 다시. */
async function rangeFallback(bucket: WorldBucket, key: string, plan: ReadPlan, range: WorldRange): Promise<Response> {
  const meta = await bucket.head(key);
  if (meta === null) return json(404, { error: 'not_found' }, NOT_FOUND_CACHE_CONTROL);
  if (!isSatisfiable(range, meta.size)) return unsatisfiable(meta.size);
  return getObject(bucket, key, { ...plan, range: clampRange(range, meta.size) }, false);
}

async function getObject(bucket: WorldBucket, key: string, plan: ReadPlan, retry = true): Promise<Response> {
  let obj: WorldObjectBody | WorldObject | null;
  try {
    obj = await bucket.get(key, plan);
  } catch (e) {
    // 범위 밖 offset 등 사용자 입력으로 R2가 던지면 1101 대신 416/404(F07). 범위가 없거나 재시도도 실패면 최상위 500(index.ts).
    if (plan.range === undefined || !retry) throw e;
    return rangeFallback(bucket, key, plan, plan.range);
  }
  if (obj === null) return json(404, { error: 'not_found' }, NOT_FOUND_CACHE_CONTROL);
  const headers = objectHeaders(obj);
  if (!hasBody(obj)) {
    // 조건부 요청 불일치: If-None-Match/If-Modified-Since → 304, If-Match/If-Unmodified-Since → 412.
    const notModified = plan.onlyIf?.has('If-None-Match') === true || plan.onlyIf?.has('If-Modified-Since') === true;
    return new Response(null, { status: notModified ? 304 : 412, headers });
  }
  if (plan.range !== undefined) {
    // R2가 던지지 않고 돌려줘도(구현 차이) 시작 ≥ 크기면 416.
    if (!isSatisfiable(plan.range, obj.size)) {
      await obj.body.cancel();
      return unsatisfiable(obj.size);
    }
    headers.set('Content-Range', contentRange(obj.range ?? plan.range, obj.size));
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

/** 처음부터 만족 불가한 범위(suffix 0·거대한 시작): 크기만 보고 416(없으면 404). */
async function unsatisfiableFor(bucket: WorldBucket, key: string): Promise<Response> {
  const meta = await bucket.head(key);
  return meta === null ? json(404, { error: 'not_found' }, NOT_FOUND_CACHE_CONTROL) : unsatisfiable(meta.size);
}

export async function handleWorldData(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  if (env.WORLD === undefined) return storageUnconfigured('WORLD');
  const url = new URL(request.url);
  // 게임은 /world/*에 쿼리를 쓰지 않는다 — 무의미한 쿼리로 캐시를 우회해 R2 읽기를 늘리는 요청 차단(F05).
  if (url.search !== '') return json(400, { error: 'unexpected_query' });
  const parsed = parseWorldPath(url.pathname);
  if (parsed === undefined) return json(400, { error: 'bad_world_path' });
  if (request.method === 'HEAD') return headObject(env.WORLD, parsed.key);

  // 엣지 캐시는 평범한 GET만(클라이언트 셀 fetch). 유효한 Range·조건부 요청은 R2가 직접(206/304/412) — 캐시 구현마다 다른 동작을 피한다.
  // 문법이 틀린 Range는 무시 = 평범한 GET(캐시를 탄다, RFC 9110 §14.2).
  const range = parseRange(request.headers.get('Range'));
  const onlyIf = conditionalHeaders(request);
  if (range.kind === 'unsatisfiable') return unsatisfiableFor(env.WORLD, parsed.key);
  const plan: ReadPlan = { ...(range.kind === 'range' ? { range: range.range } : {}), ...(onlyIf ? { onlyIf } : {}) };
  const plain = plan.range === undefined && plan.onlyIf === undefined;
  const cache = plain ? edgeCache() : undefined;
  const key = cacheKey(url);
  const cached = await cache?.match(key);
  if (cached !== undefined) return withCacheStatus(cached, 'HIT');
  const res = await getObject(env.WORLD, parsed.key, plan);
  if (cache !== undefined && ctx !== undefined && CACHEABLE_STATUSES.has(res.status)) {
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  return withCacheStatus(res, cache === undefined ? 'BYPASS' : 'MISS');
}
