// 바인딩이 있을 때의 월드 라우트: /api/world/current(KV), /world/*(R2 Range·조건부·HEAD·경로 검증).
import { describe, expect, it } from 'vitest';
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

/** R2 get의 Range(`bytes=a-b`)·If-None-Match만 흉내 내는 인메모리 버킷. */
function fakeBucket(keys: Set<string>): WorldBucket {
  return {
    async get(key, options): Promise<WorldObjectBody | WorldObject | null> {
      if (!keys.has(key)) return null;
      if (options?.onlyIf?.get('If-None-Match') === ETAG) return meta();
      const m = /^bytes=(\d+)-(\d+)$/.exec(options?.range?.get('Range') ?? '');
      const [start, end] = m ? [Number(m[1]), Number(m[2])] : [0, DATA.length - 1];
      const body = new Blob([DATA.slice(start, end + 1)]).stream();
      return { ...meta(m ? { offset: start, length: end - start + 1, suffix: undefined } : undefined), body };
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
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
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
