// `/api/log`(M11-T03): 허용 필드만·개인정보 지우기·크기 제한, Analytics Engine 한 점, 바인딩 없으면 기록 없이 204.
// F03(ADR-0103): JSON Content-Type·Origin 허용 목록·IP(해시) 요청 제한·샘플률 허용 값·production test 거절.
import { describe, expect, it } from 'vitest';
import type { Env, LogDataset, RateLimiter } from '../src/env.ts';
import { handleRequest } from '../src/index.ts';
import { clientKey, isAllowedOrigin } from '../src/log-guard.ts';
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

type Point = Parameters<LogDataset['writeDataPoint']>[0];
const recorder = (extra: Partial<Env> = {}): { env: Env; pts: Point[] } => {
  const pts: Point[] = [];
  return { pts, env: { LOGS: { writeDataPoint: (p) => pts.push(p) }, ...extra } };
};
/** 키별 고정 창 카운터(Workers Rate Limiting simple 흉내). */
const limiter = (limit: number): RateLimiter & { keys: string[] } => {
  const counts = new Map<string, number>();
  const keys: string[] = [];
  return {
    keys,
    async limit({ key }) {
      keys.push(key);
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return { success: n <= limit };
    },
  };
};

describe('/api/log abuse defence (F03)', () => {
  it('refuses non-JSON content types (text/plain simple POST) with 415 before writing', async () => {
    const { env, pts } = recorder();
    for (const ct of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', ''])
      expect((await handleRequest(post(REPORT, { 'Content-Type': ct }), env)).status).toBe(415);
    expect((await handleRequest(post(REPORT, { 'Content-Type': 'Application/JSON; charset=utf-8' }), env)).status).toBe(
      204,
    );
    expect(pts).toHaveLength(1);
  });

  it('allows only our origins when an Origin header is present (403 otherwise)', async () => {
    const { env, pts } = recorder();
    for (const o of ['https://evil.example', 'https://earthaimap.com.evil.example', 'null', 'http://earthaimap.com'])
      expect((await handleRequest(post(REPORT, { Origin: o }), env)).status).toBe(403);
    for (const o of [
      'https://earthaimap.com',
      'https://tokyo-sanpo-staging.kolom1357.workers.dev',
      'https://pr-30-tokyo-sanpo-staging.kolom1357.workers.dev',
      'http://localhost:5173',
      'http://127.0.0.1:8787',
    ])
      expect((await handleRequest(post(REPORT, { Origin: o }), env)).status).toBe(204);
    expect(pts).toHaveLength(5);
    expect(isAllowedOrigin('https://x-tokyo-sanpo-staging.other.workers.dev')).toBe(false);
  });

  it('rate-limits per hashed IP with 429 and never passes the raw IP to the limiter', async () => {
    const lim = limiter(2);
    const { env, pts } = recorder({ LOG_LIMITER: lim });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await handleRequest(post(REPORT), env)).status);
    expect(statuses).toEqual([204, 204, 429, 429]);
    expect(pts).toHaveLength(2);
    // 다른 IP는 따로 센다.
    expect((await handleRequest(post(REPORT, { 'CF-Connecting-IP': '198.51.100.7' }), env)).status).toBe(204);
    expect(lim.keys.every((k) => /^[0-9a-f]{16}$/.test(k) && !k.includes('203'))).toBe(true);
    expect(await clientKey(post(REPORT))).toBe(lim.keys[0]);
  });

  it('accepts only the game sample rates (no 1e-300 weighting) and defaults a missing rate to 1', () => {
    for (const rate of [1e-300, 0, -1, 0.5, 2, '0.01', Number.NaN])
      expect(parseReport({ ...REPORT, sampleRate: rate })).toBeNull();
    expect(parseReport({ ...REPORT, sampleRate: 0.01 })?.sampleRate).toBe(0.01);
    expect(parseReport({ ...REPORT, sampleRate: 1 })?.sampleRate).toBe(1);
    expect(parseReport({ kind: 'error' })?.sampleRate).toBe(1);
  });

  it('rejects kind:"test" in production only', async () => {
    const prod = recorder({ DEPLOY_ENV: 'production' });
    expect((await handleRequest(post({ ...REPORT, kind: 'test' }), prod.env)).status).toBe(400);
    expect((await handleRequest(post(REPORT), prod.env)).status).toBe(204);
    expect(prod.pts.map((p) => p.indexes)).toEqual([['error']]);
    const staging = recorder({ DEPLOY_ENV: 'staging' });
    expect((await handleRequest(post({ ...REPORT, kind: 'test' }), staging.env)).status).toBe(204);
  });
});
