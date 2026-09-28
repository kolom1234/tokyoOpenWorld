// 통합(M02-T06): 실제 `wrangler dev --env local`(miniflare·workerd)에 world-mini 셀 1개 + KV 포인터를 시드하고
// /api/world/current, /world/* 200(엣지 캐시 MISS → HIT)·206·304·HEAD·404·400을 HTTP로 확인. 격리 persist 디렉터리 사용.
// `SANPO_SKIP_MINIFLARE=1`이면 건너뜀. see docs/13-deployment.md §4, docs/modules/worker.md
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const WORKER_DIR = resolve(import.meta.dirname, '..');
const WRANGLER = resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js');
const FIXTURE = resolve(WORKER_DIR, '../../tests/fixtures/world-mini');
const BUILD_ID = (JSON.parse(readFileSync(join(FIXTURE, 'world.json'), 'utf8')) as { buildId: string }).buildId;
const CELL = 'L0/0/0.tkc';
const CELL_BYTES = readFileSync(join(FIXTURE, CELL));
const SKIP = process.env.SANPO_SKIP_MINIFLARE === '1';

function freePort(): Promise<number> {
  return new Promise((ok) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
}

const wrangler = (args: string[]) =>
  run(process.execPath, [WRANGLER, ...args], { cwd: WORKER_DIR, env: { ...process.env, CI: '1' }, timeout: 120_000 });

describe.skipIf(SKIP)('worker on local miniflare (wrangler dev --env local)', () => {
  let proc: ChildProcess | undefined;
  let base = '';
  let persist = '';

  beforeAll(async () => {
    persist = mkdtempSync(join(tmpdir(), 'sanpo-mf-'));
    mkdirSync(resolve(WORKER_DIR, '../game/dist'), { recursive: true });
    const local = ['--local', '--env', 'local', '--persist-to', persist];
    await wrangler([
      'r2',
      'object',
      'put',
      `sanpo-world-local/world/${BUILD_ID}/${CELL}`,
      '--file',
      join(FIXTURE, CELL),
      '--content-type',
      'application/octet-stream',
      ...local,
    ]);
    await wrangler(['kv', 'key', 'put', 'CURRENT_BUILD:v1', BUILD_ID, '--binding', 'CONFIG', ...local]);
    const port = await freePort();
    proc = spawn(
      process.execPath,
      [
        WRANGLER,
        'dev',
        '--env',
        'local',
        '--port',
        String(port),
        '--ip',
        '127.0.0.1',
        '--persist-to',
        persist,
        '--show-interactive-dev-session=false',
      ],
      {
        cwd: WORKER_DIR,
        env: { ...process.env, CI: '1' },
        stdio: 'ignore',
      },
    );
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) {
      const up = await fetch(`${base}/api/health`).then(
        (r) => r.ok,
        () => false,
      );
      if (up) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('wrangler dev did not start');
  }, 180_000);

  afterAll(async () => {
    const p = proc;
    if (p?.pid !== undefined && p.exitCode === null) {
      const exited = new Promise((r) => p.once('exit', r));
      // Windows: kill은 wrangler만 끝내고 workerd 자식을 남길 수 있다 → 프로세스 트리 종료.
      if (process.platform === 'win32')
        await run('taskkill', ['/pid', String(p.pid), '/T', '/F']).catch(() => undefined);
      else p.kill();
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
    }
    // 파일 잠금이 늦게 풀릴 수 있다(Windows) — 재시도 후에도 실패하면 임시 폴더라 무시.
    if (persist) rmSync(persist, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }, 30_000);

  it('serves the KV build pointer', async () => {
    const r = await fetch(`${base}/api/world/current?fv=1`);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ buildId: BUILD_ID, formatVersion: 1 });
  });

  it('GET 200 (edge cache MISS then HIT) with immutable caching, isolation headers and ETag', async () => {
    const url = `${base}/world/${BUILD_ID}/${CELL}`;
    const a = await fetch(url);
    expect(a.status).toBe(200);
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array(CELL_BYTES));
    expect(a.headers.get('cache-control')).toContain('immutable');
    expect(a.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(a.headers.get('etag')).toBeTruthy();
    expect(a.headers.get('x-sanpo-cache')).toBe('MISS');
    let hit = '';
    for (let i = 0; i < 20 && hit !== 'HIT'; i++) {
      const b = await fetch(url);
      await b.arrayBuffer();
      hit = b.headers.get('x-sanpo-cache') ?? '';
    }
    expect(hit).toBe('HIT');
  });

  it('Range → 206 with Content-Range, If-None-Match → 304, HEAD → length', async () => {
    const url = `${base}/world/${BUILD_ID}/${CELL}`;
    const r = await fetch(url, { headers: { Range: 'bytes=0-15' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(`bytes 0-15/${CELL_BYTES.length}`);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array(CELL_BYTES.subarray(0, 16)));
    const etag = (await fetch(url, { method: 'HEAD' })).headers.get('etag') ?? '';
    const nm = await fetch(url, { headers: { 'If-None-Match': etag } });
    expect(nm.status).toBe(304);
    const h = await fetch(url, { method: 'HEAD' });
    expect(Number(h.headers.get('content-length'))).toBe(CELL_BYTES.length);
  });

  it('missing cell → 404 (short cache), bad path → 400', async () => {
    const nf = await fetch(`${base}/world/${BUILD_ID}/L0/99/99.tkc`);
    expect(nf.status).toBe(404);
    expect(nf.headers.get('cache-control')).toContain('max-age=300');
    expect((await fetch(`${base}/world/not-a-build/x.tkc`)).status).toBe(400);
  });
});
