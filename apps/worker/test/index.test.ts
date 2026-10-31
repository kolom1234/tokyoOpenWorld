// Worker 라우터: 바인딩 없는 배포에서 월드 라우트 503 비활성, 헬스 체크, 보안 헤더(F06 — 프레이밍 금지·문서 정책과 같은 값).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Env } from '../src/env.ts';
import { WORKER_RESPONSE_HEADERS } from '../src/headers.ts';
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

  it('answers /api/health with liveness only, never binding details', async () => {
    for (const env of [{}, { CONFIG: { get: async () => null } }] satisfies Env[]) {
      const res = await get('/api/health', env);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.text()).toBe('{"ok":true}');
    }
  });

  it('rejects writes and unknown api paths', async () => {
    expect((await get('/api/world/current', {}, 'POST')).status).toBe(405);
    expect((await get('/api/nope')).status).toBe(404);
  });

  it('delegates other paths to static assets, adds isolation headers and keeps the document CSP', async () => {
    const docCsp = "default-src 'self'; frame-ancestors 'none'";
    const env: Env = {
      ASSETS: {
        fetch: async () =>
          new Response('<html></html>', { status: 200, headers: { 'Content-Security-Policy': docCsp } }),
      },
    };
    const res = await get('/', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(res.headers.get('Content-Security-Policy')).toBe(docCsp);
    expect(await res.text()).toBe('<html></html>');
  });

  it('adds anti-framing CSP, X-Frame-Options and the document policies to every Worker response, errors included (F06)', async () => {
    const env: Env = {
      WORLD: {
        get: async () => {
          throw new Error('boom');
        },
        head: async () => null,
      },
    };
    for (const [path, status] of [
      ['/api/health', 200],
      ['/api/nope', 404],
      ['/api/world/current?fv=1', 503],
      ['/world/20260927-abcdef0-12345678/x.bin', 500],
      ['/world/bad', 400],
    ] as const) {
      const res = await get(path, env);
      expect([path, res.status]).toEqual([path, status]);
      expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.has('Strict-Transport-Security')).toBe(false); // HSTS = 존 설정(ADR-0102)
    }
  });

  it('uses the same Referrer-Policy and Permissions-Policy values as public/_headers', () => {
    const text = readFileSync(resolve(import.meta.dirname, '../../game/public/_headers'), 'utf8');
    for (const name of ['Referrer-Policy', 'Permissions-Policy']) {
      const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${name}:`)) ?? '';
      expect(line.split(': ').slice(1).join(': ').trim()).toBe(WORKER_RESPONSE_HEADERS[name]);
    }
  });
});
