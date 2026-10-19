// `/api/log`(M11-T03): 허용 필드만·개인정보 지우기·크기 제한, Analytics Engine 한 점, 바인딩 없으면 기록 없이 204.
import { describe, expect, it } from 'vitest';
import type { Env, LogDataset } from '../src/env.ts';
import { handleRequest } from '../src/index.ts';
import { parseReport, scrub } from '../src/routes/log.ts';

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://sanpo.test/api/log', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers },
  });

const REPORT = {
  kind: 'error',
  message: 'TypeError: x is undefined at https://earthaimap.com/assets/main.js?v=1#a (mail me a@b.co, id 9876543)',
  frame: 'https://earthaimap.com/assets/main-abc.js?token=zz:12:34',
  buildId: '20261019-abcdef0-12345678',
  version: 'f2a39f9',
  backend: 'webgpu',
  gpuTier: 2,
  browser: 'chrome 141',
  lang: 'ko',
  mode: 'walk',
  sampleRate: 0.01,
  email: 'leak@example.com',
  ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
};

describe('/api/log', () => {
  it('scrubs emails, URL hosts/queries and long numbers', () => {
    expect(scrub(REPORT.message, 200)).toBe('TypeError: x is undefined at /assets/main.js (mail me <email>, id <n>)');
    expect(scrub(REPORT.frame, 160)).toBe('/assets/main-abc.js');
    expect(scrub('a'.repeat(500), 200)).toHaveLength(200);
  });

  it('keeps only allowed fields (no IP, UA or unknown keys) and writes one data point', async () => {
    const pts: Parameters<LogDataset['writeDataPoint']>[0][] = [];
    const env = { LOGS: { writeDataPoint: (p) => pts.push(p) } } as Env;
    const res = await handleRequest(post(REPORT), env);
    expect(res.status).toBe(204);
    expect(pts).toHaveLength(1);
    const p = pts[0];
    expect(p?.indexes).toEqual(['error']);
    expect(p?.doubles).toEqual([2, 0.01]);
    const all = JSON.stringify(p);
    for (const leak of ['203.0.113.9', 'leak@example.com', 'Mozilla', 'a@b.co', '9876543', 'earthaimap.com', 'token'])
      expect(all).not.toContain(leak);
    expect(p?.blobs?.slice(3)).toEqual(['20261019-abcdef0-12345678', 'f2a39f9', 'webgpu', 'chrome 141', 'ko', 'walk']);
  });

  it('rejects bad kinds, bad JSON, oversize bodies and GET; 204 without a binding', async () => {
    expect(parseReport({ kind: 'spam' })).toBeNull();
    expect((await handleRequest(post('{'), {} as Env)).status).toBe(400);
    expect((await handleRequest(post({ kind: 'nope' }), {} as Env)).status).toBe(400);
    expect((await handleRequest(post({ kind: 'error', message: 'x'.repeat(5000) }), {} as Env)).status).toBe(413);
    expect((await handleRequest(new Request('https://sanpo.test/api/log'), {} as Env)).status).toBe(405);
    expect((await handleRequest(post({ kind: 'test' }), {} as Env)).status).toBe(204);
  });
});
