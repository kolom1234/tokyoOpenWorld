// 바인딩이 있을 때의 월드 라우트: /api/world/current(KV), /world/*(R2 Range·조건부·HEAD·경로 검증).
// F05(ADR-0103): 쿼리 400, 캐시 키 = 경로만, 404 네거티브 캐시, current 엣지 캐시 — 인메모리 caches.default로 R2/KV 조회 수를 센다.
import { afterEach, describe, expect, it } from 'vitest';
import type { ConfigKv, Env, WorldBucket, WorldObject, WorldObjectBody } from '../src/env.ts';
import { handleRequest } from '../src/index.ts';
import { contentRange } from '../src/routes/world.ts';
import { parseWorldPath } from '../src/validate.ts';

const BUILD = '20260927-abcdef0-12345678';
const DATA = new TextEncoder().encode('0123456789');
const ETAG = '"etag-1"';

function meta(range?: WorldObject['range']): WorldObject {
  return {
    size: DATA.length,
    httpEtag: ETAG,
    ...(range ? { range } : {}),
    writeHttpMetadata: (h) => h.set('Content-Type', 'application/octet-stream'),
  };
}

/**
 * R2 get의 범위 객체·If-None-Match·If-Match만 흉내 내는 인메모리 버킷.
 * 실제 R2처럼 시작 ≥ 크기·끝이 객체 밖인 범위는 예외(운영 1101 원인 — F07), suffix는 크기로 자른다.
 */
function fakeBucket(keys: Set<string>): WorldBucket {
  return {
    async get(key, options): Promise<WorldObjectBody | WorldObject | null> {
      if (!keys.has(key)) return null;
      if (options?.onlyIf?.get('If-None-Match') === ETAG) return meta();
      const ifMatch = options?.onlyIf?.get('If-Match');
      if (ifMatch !== undefined && ifMatch !== null && ifMatch !== ETAG) return meta();
      const r = options?.range;
      if (r === undefined) return { ...meta(), body: new Blob([DATA]).stream() };
      let start: number;
      let end: number;
      if (r.suffix !== undefined) [start, end] = [Math.max(0, DATA.length - r.suffix), DATA.length - 1];
      else {
        start = r.offset ?? 0;
        end = r.length !== undefined ? start + r.length - 1 : DATA.length - 1;
      }
      if (start >= DATA.length || end >= DATA.length) throw new Error('InvalidRange: requested range not satisfiable');
      const body = new Blob([DATA.slice(start, end + 1)]).stream();
      return { ...meta({ offset: start, length: end - start + 1, suffix: undefined }), body };
    },
    async head(key) {
      return keys.has(key) ? meta() : null;
    },
  };
}

const kv = (entries: Record<string, string>): ConfigKv => ({ get: async (k) => entries[k] ?? null });
const call = (path: string, env: Env, init?: RequestInit) =>
  handleRequest(new Request(`https://example.test${path}`, init), env);

describe('/api/world/current', () => {
  const env: Env = { CONFIG: kv({ 'CURRENT_BUILD:v1': BUILD, 'CURRENT_BUILD:v2': 'not-a-build' }) };

  it('returns the active build with a short cache', async () => {
    const res = await call('/api/world/current?fv=1', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(await res.json()).toEqual({ buildId: BUILD, formatVersion: 1, baseUrl: `/world/${BUILD}` });
  });

  it('rejects bad fv, reports missing builds and refuses malformed KV values', async () => {
    expect((await call('/api/world/current', env)).status).toBe(400);
    expect((await call('/api/world/current?fv=01', env)).status).toBe(400);
    const missing = await call('/api/world/current?fv=3', env);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: 'no_build' });
    expect((await call('/api/world/current?fv=2', env)).status).toBe(500);
  });
});

describe('/world/*', () => {
  const env: Env = { WORLD: fakeBucket(new Set([`world/${BUILD}/cells/0_0.tkc`])) };
  const path = `/world/${BUILD}/cells/0_0.tkc`;

  it('serves the full object as immutable with isolation headers', async () => {
    const res = await call(path, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('ETag')).toBe(ETAG);
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(await res.text()).toBe('0123456789');
  });

  it('serves ranges as 206 with Content-Range', async () => {
    const res = await call(path, env, { headers: { Range: 'bytes=2-5' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(await res.text()).toBe('2345');
  });

  it('answers 304 on a matching If-None-Match and HEAD without body', async () => {
    expect((await call(path, env, { headers: { 'If-None-Match': ETAG } })).status).toBe(304);
    const head = await call(path, env, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('10');
  });

  it('returns cacheable 404 for missing objects and 400 for malformed paths', async () => {
    const missing = await call(`/world/${BUILD}/nope.bin`, env);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect((await call('/world/latest/cells.idx', env)).status).toBe(400);
    expect((await call(`/world/${BUILD}/a%2F..%2Fb`, env)).status).toBe(400);
    expect((await call('/world', env)).status).toBe(400);
  });
});

describe('helpers', () => {
  it('rejects dot segments and encoded characters in world paths', () => {
    expect(parseWorldPath(`/world/${BUILD}/cells/0_0.tkc`)).toEqual({
      buildId: BUILD,
      key: `world/${BUILD}/cells/0_0.tkc`,
    });
    expect(parseWorldPath(`/world/${BUILD}/../secret`)).toBeUndefined();
    expect(parseWorldPath(`/world/${BUILD}/./x`)).toBeUndefined();
    expect(parseWorldPath(`/world/${BUILD}/a//b`)).toBeUndefined();
    expect(parseWorldPath(`/world/${BUILD}/%2e%2e/x`)).toBeUndefined();
  });

  it('formats Content-Range for offset, open-ended and suffix ranges', () => {
    expect(contentRange({ offset: 2, length: 4 }, 10)).toBe('bytes 2-5/10');
    expect(contentRange({ offset: 7 }, 10)).toBe('bytes 7-9/10');
    expect(contentRange({ suffix: 3, offset: undefined }, 10)).toBe('bytes 7-9/10');
  });
});

/** Workers `caches.default` 흉내(키 = URL, 저장 = 복제본). 206은 실제 런타임처럼 거부. */
function installEdgeCache(): Map<string, Response> {
  const store = new Map<string, Response>();
  Object.assign(globalThis, {
    caches: {
      default: {
        async match(req: Request) {
          return store.get(req.url)?.clone();
        },
        async put(req: Request, res: Response) {
          if (res.status === 206) throw new TypeError('206 cannot be cached');
          store.set(req.url, res.clone());
        },
      },
    },
  });
  return store;
}

/** waitUntil 약속을 모아 두었다가 기다린다(응답 뒤 cache.put 완료). */
function context(): { waitUntil(p: Promise<unknown>): void; flush(): Promise<void> } {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => pending.push(p),
    flush: async () => {
      await Promise.all(pending.splice(0));
    },
  };
}

function countingBucket(keys: Set<string>): WorldBucket & { gets: number; heads: number } {
  const inner = fakeBucket(keys);
  const b = {
    gets: 0,
    heads: 0,
    get: (k: string, o?: Parameters<WorldBucket['get']>[1]) => {
      b.gets++;
      return inner.get(k, o);
    },
    head: (k: string) => {
      b.heads++;
      return inner.head(k);
    },
  };
  return b;
}

describe('edge cache (F05)', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'caches');
  });
  const path = `/world/${BUILD}/cells/0_0.tkc`;

  it('rejects query strings on /world/* without touching R2', async () => {
    const bucket = countingBucket(new Set([`world/${BUILD}/cells/0_0.tkc`]));
    for (const q of ['?v=1', '?cb=123', '?fv=1&x=y'])
      expect((await call(`${path}${q}`, { WORLD: bucket })).status).toBe(400);
    expect(bucket.gets + bucket.heads).toBe(0);
  });

  it('keys the cache by path only: MISS then HIT, one R2 read; a bare "?" shares the entry', async () => {
    installEdgeCache();
    const bucket = countingBucket(new Set([`world/${BUILD}/cells/0_0.tkc`]));
    const env: Env = { WORLD: bucket };
    const ctx = context();
    const first = await handleRequest(new Request(`https://example.test${path}`), env, ctx);
    expect([first.status, first.headers.get('X-Sanpo-Cache')]).toEqual([200, 'MISS']);
    await ctx.flush();
    for (const p of [path, `${path}?`]) {
      const again = await handleRequest(new Request(`https://example.test${p}`), env, ctx);
      expect([again.status, again.headers.get('X-Sanpo-Cache')]).toEqual([200, 'HIT']);
      expect(await again.text()).toBe('0123456789');
    }
    expect(bucket.gets).toBe(1);
  });

  it('negative-caches 404 on validated paths for 5 minutes (R2 read once)', async () => {
    const store = installEdgeCache();
    const bucket = countingBucket(new Set());
    const ctx = context();
    const missing = `/world/${BUILD}/nope.bin`;
    const a = await handleRequest(new Request(`https://example.test${missing}`), { WORLD: bucket }, ctx);
    await ctx.flush();
    const b = await handleRequest(new Request(`https://example.test${missing}`), { WORLD: bucket }, ctx);
    expect([a.status, a.headers.get('X-Sanpo-Cache')]).toEqual([404, 'MISS']);
    expect([b.status, b.headers.get('X-Sanpo-Cache')]).toEqual([404, 'HIT']);
    expect(b.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(bucket.gets).toBe(1);
    // 형식이 틀린 경로(400)는 캐시에도 R2에도 가지 않는다.
    await handleRequest(new Request('https://example.test/world/latest/x'), { WORLD: bucket }, ctx);
    await ctx.flush();
    expect([...store.keys()]).toEqual([`https://example.test${missing}`]);
  });

  it('keeps Range 206 and conditional 304 on the R2 path (BYPASS, never cached)', async () => {
    const store = installEdgeCache();
    const bucket = countingBucket(new Set([`world/${BUILD}/cells/0_0.tkc`]));
    const ctx = context();
    const range = await handleRequest(
      new Request(`https://example.test${path}`, { headers: { Range: 'bytes=2-5' } }),
      { WORLD: bucket },
      ctx,
    );
    const cond = await handleRequest(
      new Request(`https://example.test${path}`, { headers: { 'If-None-Match': ETAG } }),
      { WORLD: bucket },
      ctx,
    );
    await ctx.flush();
    expect([range.status, range.headers.get('X-Sanpo-Cache')]).toEqual([206, 'BYPASS']);
    expect([cond.status, cond.headers.get('X-Sanpo-Cache')]).toEqual([304, 'BYPASS']);
    expect(store.size).toBe(0);
  });

  it('serves /api/world/current from the edge for 30 s keyed by fv only (one KV read)', async () => {
    installEdgeCache();
    let reads = 0;
    const env: Env = {
      CONFIG: {
        get: async (k) => {
          reads++;
          return k === 'CURRENT_BUILD:v1' ? BUILD : null;
        },
      },
    };
    const ctx = context();
    for (const q of ['?fv=1', '?fv=1&x=1', '?x=2&fv=1']) {
      const res = await handleRequest(new Request(`https://example.test/api/world/current${q}`), env, ctx);
      await ctx.flush();
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    }
    expect(reads).toBe(1);
    await handleRequest(new Request('https://example.test/api/world/current?fv=7'), env, ctx);
    await ctx.flush();
    const again = await handleRequest(new Request('https://example.test/api/world/current?fv=7'), env, ctx);
    expect(again.status).toBe(404);
    expect(reads).toBe(2);
  });
});

describe('Range and error boundary (F07)', () => {
  const env: Env = { WORLD: fakeBucket(new Set([`world/${BUILD}/cells/0_0.tkc`])) };
  const path = `/world/${BUILD}/cells/0_0.tkc`;
  const ranged = (range: string) => call(path, env, { headers: { Range: range } });

  it('serves satisfiable single ranges as 206 (offset, open-ended, suffix, end past size clamped)', async () => {
    const cases: [string, string, string][] = [
      ['bytes=2-5', 'bytes 2-5/10', '2345'],
      ['bytes=7-', 'bytes 7-9/10', '789'],
      ['bytes=-3', 'bytes 7-9/10', '789'],
      ['bytes=-30', 'bytes 0-9/10', '0123456789'],
      ['bytes=5-100', 'bytes 5-9/10', '56789'],
      ['bytes=0-99999999999999999999', 'bytes 0-9/10', '0123456789'],
    ];
    for (const [range, cr, body] of cases) {
      const res = await ranged(range);
      expect([range, res.status, res.headers.get('Content-Range')]).toEqual([range, 206, cr]);
      expect(await res.text()).toBe(body);
    }
  });

  it('answers 416 with Content-Range bytes */size for unsatisfiable ranges (no 1101)', async () => {
    for (const range of [
      'bytes=999999999-999999999',
      'bytes=10-',
      'bytes=10-20',
      'bytes=-0',
      'bytes=99999999999999999999-',
    ]) {
      const res = await ranged(range);
      expect([range, res.status]).toEqual([range, 416]);
      expect(res.headers.get('Content-Range')).toBe('bytes */10');
      expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    }
    expect((await call(`/world/${BUILD}/missing.bin`, env, { headers: { Range: 'bytes=50-' } })).status).toBe(404);
  });

  it('ignores malformed Range syntax and returns the full 200 (RFC 9110)', async () => {
    for (const range of ['bytes=bad', 'bytes=0-1,3-4', 'items=0-1', 'bytes=5-2', 'bytes=-', 'bytes = 1-2', '']) {
      const res = await ranged(range);
      expect([range, res.status, res.headers.get('Content-Range')]).toEqual([range, 200, null]);
      expect(await res.text()).toBe('0123456789');
    }
  });

  it('keeps conditional 304/412 and ignores invalid dates', async () => {
    expect((await call(path, env, { headers: { 'If-None-Match': ETAG } })).status).toBe(304);
    expect((await call(path, env, { headers: { 'If-Match': '"other"' } })).status).toBe(412);
    expect((await call(path, env, { headers: { 'If-Modified-Since': 'not a date' } })).status).toBe(200);
  });

  it('never answers 5xx for user-controlled headers and paths', async () => {
    const headers: Record<string, string>[] = [
      { Range: 'bytes=999999999999999999999999999-1' },
      { Range: `bytes=${'9'.repeat(400)}-` },
      { Range: 'bytes=-99999999999999999999999' },
      { 'If-None-Match': 'W/"x", garbage,,*' },
      { 'If-Unmodified-Since': 'Tue, 99 Foo 9999' },
      { Range: 'bytes=3-4', 'If-None-Match': ETAG },
    ];
    for (const h of headers) expect((await call(path, env, { headers: h })).status).toBeLessThan(500);
    for (const p of [`/world/${BUILD}/${'a'.repeat(600)}`, '/world/%00', `/world/${BUILD}/x?%ff`, '/api/nope'])
      expect((await call(p, env)).status).toBeLessThan(500);
  });

  it('turns an unexpected exception into a 500 JSON without internals, with security headers and no-store', async () => {
    const broken: Env = {
      WORLD: {
        get: async () => {
          throw new Error('R2 internal: secret-bucket-id 7f3a');
        },
        head: async () => null,
      },
    };
    const res = await call(path, broken);
    expect(res.status).toBe(500);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: 'internal_error' });
    expect(text).not.toContain('secret');
  });
});
