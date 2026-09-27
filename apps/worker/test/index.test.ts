// Worker 라우터: 바인딩 없는 배포에서 월드 라우트 503 비활성, 헬스 체크, 보안 헤더.
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env.ts';
import { handleRequest } from '../src/index.ts';

const get = (path: string, env: Env = {}, method = 'GET') =>
  handleRequest(new Request(`https://example.test${path}`, { method }), env);

describe('@sanpo/worker router', () => {
  it('disables /api/world/current with 503 when CONFIG is not bound', async () => {
    const res = await get('/api/world/current?fv=1');
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ error: 'world_storage_unconfigured' });
  });

  it('disables /world/* with 503 when WORLD is not bound', async () => {
    const res = await get('/world/20260927-abcdef0-12345678/cells.idx');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: 'world_storage_unconfigured' });
  });

  it('reports binding presence on /api/health without values', async () => {
    const env: Env = { CONFIG: { get: async () => null } };
    const res = await get('/api/health', env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, bindings: { world: false, config: true } });
  });

  it('rejects writes and unknown api paths', async () => {
    expect((await get('/api/world/current', {}, 'POST')).status).toBe(405);
    expect((await get('/api/nope')).status).toBe(404);
  });

  it('delegates other paths to static assets and adds isolation headers', async () => {
    const env: Env = { ASSETS: { fetch: async () => new Response('<html></html>', { status: 200 }) } };
    const res = await get('/', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(await res.text()).toBe('<html></html>');
  });
});
