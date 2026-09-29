// publish(M02-T06): SigV4(AWS 테스트 벡터), S3 업로더(단일 PUT·멀티파트·HEAD), 퍼블리시 흐름(world-mini → 키·타입·매니페스트·검증·KV),
// 재시도, gc 선택, wrangler.jsonc 대상. 네트워크 없음(가짜 fetch/업로더). see docs/04-data-pipeline.md §4.7
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createLogger } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SHA256, signV4 } from '../src/lib/sigv4.ts';
import {
  BUILDS_KEY,
  type BuildEntry,
  buildFiles,
  CURRENT_KEY,
  FILES_KEY,
  gcBuilds,
  publishBuild,
  selectGc,
} from '../src/stages/publish/publish.ts';
import { readTargets, stripJsonc } from '../src/stages/publish/targets.ts';
import {
  createS3Uploader,
  type KvClient,
  MULTIPART_THRESHOLD,
  type Uploader,
} from '../src/stages/publish/uploaders.ts';

const REPO = resolve(import.meta.dirname, '../../..');
const WORLD_MINI = resolve(REPO, 'tests/fixtures/world-mini');
const log = createLogger({ level: 'error' });

function fakeKv(): KvClient & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return {
    m,
    get: async (k) => m.get(k),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
  };
}

function fakeUploader(
  failOnce?: string,
): Uploader & { objects: Map<string, { bytes: number; type: string }>; deleted: string[] } {
  const objects = new Map<string, { bytes: number; type: string }>();
  const deleted: string[] = [];
  let failed = false;
  return {
    name: 's3',
    objects,
    deleted,
    async put(p) {
      if (failOnce && p.key.endsWith(failOnce) && !failed) {
        failed = true;
        throw new Error('flaky');
      }
      objects.set(p.key, { bytes: p.body.length, type: p.contentType });
    },
    size: async (k) => objects.get(k)?.bytes,
    async delete(k) {
      deleted.push(k);
      objects.delete(k);
    },
  };
}

describe('sigv4', () => {
  it('matches the AWS SigV4 test suite get-vanilla signature', () => {
    const h = signV4(
      {
        method: 'GET',
        url: new URL('https://example.amazonaws.com/'),
        headers: {},
        payloadHash: EMPTY_SHA256,
        region: 'us-east-1',
        service: 'service',
        date: new Date('2015-08-30T12:36:00Z'),
      },
      { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
    );
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });
});

describe('s3 uploader', () => {
  it('uses single PUT below the threshold and multipart above it; never sends Host itself', async () => {
    const calls: string[] = [];
    const f = (async (u: URL | string, init?: RequestInit) => {
      const url = new URL(String(u));
      const h = new Headers(init?.headers);
      expect(h.has('host')).toBe(false);
      expect(h.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AK\//);
      calls.push(`${init?.method} ${url.pathname}${url.search}`);
      if (url.search === '?uploads')
        return new Response('<InitiateMultipartUploadResult><UploadId>U1</UploadId></InitiateMultipartUploadResult>');
      if (url.searchParams.has('partNumber'))
        return new Response(null, { headers: { etag: `"e${url.searchParams.get('partNumber')}"` } });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'content-length': '3' } });
      return new Response('');
    }) as typeof fetch;
    const up = createS3Uploader({
      accountId: 'acc',
      bucket: 'b',
      cred: { accessKeyId: 'AK', secretAccessKey: 'SK' },
      fetch: f,
    });
    await up.put({
      key: 'world/x/L0/-1/0.tkc',
      body: new Uint8Array(3),
      contentType: 'application/octet-stream',
      sha256: '',
    });
    expect(calls).toEqual(['PUT /b/world/x/L0/-1/0.tkc']);
    expect(await up.size('world/x/L0/-1/0.tkc')).toBe(3);
    calls.length = 0;
    await up.put({
      key: 'big.bin',
      body: new Uint8Array(MULTIPART_THRESHOLD + 1),
      contentType: 'application/octet-stream',
      sha256: '',
    });
    expect(calls[0]).toBe('POST /b/big.bin?uploads');
    expect(calls.filter((c) => c.includes('partNumber'))).toHaveLength(5); // 64 MiB + 1 B / 16 MiB
    expect(calls.at(-1)).toBe('POST /b/big.bin?uploadId=U1');
  });
});

describe('publish', () => {
  it('lists shared/materials manifest and KTX2 arrays but no other shared files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sanpo-publish-'));
    try {
      mkdirSync(join(dir, 'shared', 'materials'), { recursive: true });
      mkdirSync(join(dir, '.work'), { recursive: true });
      for (const f of ['manifest.json', 'albedo.ktx2', 'notes.txt'])
        writeFileSync(join(dir, 'shared', 'materials', f), 'x');
      writeFileSync(join(dir, 'shared', 'readme.json'), 'x');
      writeFileSync(join(dir, '.work', 'dem.tif'), 'x');
      writeFileSync(join(dir, 'world.json'), '{}');
      expect(buildFiles(dir)).toEqual(['shared/materials/albedo.ktx2', 'shared/materials/manifest.json', 'world.json']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const BUILD_ID = (
    JSON.parse(require('node:fs').readFileSync(resolve(WORLD_MINI, 'world.json'), 'utf8')) as { buildId: string }
  ).buildId;

  it('uploads world.json, cells.idx and every .tkc under world/<buildId>/, then manifest, verifies sizes and records KV', async () => {
    expect(buildFiles(WORLD_MINI)).toEqual([
      'L0/-1/-1.tkc',
      'L0/-1/0.tkc',
      'L0/0/-1.tkc',
      'L0/0/0.tkc',
      'cells.idx',
      'world.json',
    ]);
    const up = fakeUploader('L0/0/0.tkc');
    const kv = fakeKv();
    const r = await publishBuild({
      buildDir: WORLD_MINI,
      buildId: BUILD_ID,
      formatVersion: 1,
      uploader: up,
      kv,
      log,
      setCurrent: true,
      now: () => new Date('2026-09-29T00:00:00Z'),
    });
    expect(r.verified).toBe('size');
    expect(r.files).toHaveLength(6);
    expect(up.objects.get(`world/${BUILD_ID}/world.json`)?.type).toBe('application/json');
    expect(up.objects.get(`world/${BUILD_ID}/L0/0/0.tkc`)?.type).toBe('application/octet-stream');
    expect(up.objects.has(`world/${BUILD_ID}/manifest.json`)).toBe(true);
    expect(kv.m.get(CURRENT_KEY(1))).toBe(BUILD_ID);
    expect(JSON.parse(kv.m.get(FILES_KEY(BUILD_ID)) ?? '[]')).toContain('manifest.json');
    expect(JSON.parse(kv.m.get(BUILDS_KEY(1)) ?? '[]')).toEqual([
      { buildId: BUILD_ID, publishedAt: '2026-09-29T00:00:00.000Z', files: 6, bytes: r.bytes },
    ]);
  });

  it('refuses a build dir whose world.json buildId differs', async () => {
    await expect(
      publishBuild({
        buildDir: WORLD_MINI,
        buildId: '20990101-0000000-00000000',
        formatVersion: 1,
        uploader: fakeUploader(),
        kv: fakeKv(),
        log,
        setCurrent: false,
      }),
    ).rejects.toThrow(/buildId/);
  });
});

describe('gc', () => {
  const b = (buildId: string, day: string): BuildEntry => ({
    buildId,
    publishedAt: `2026-09-${day}T00:00:00.000Z`,
    files: 1,
    bytes: 1,
  });

  it('keeps current, the one published right before it (rollback target) and anything younger than 7 days', () => {
    const builds = [b('a', '01'), b('b', '05'), b('c', '10'), b('d', '20'), b('e', '28')];
    const now = new Date('2026-09-29T00:00:00Z');
    expect(selectGc(builds, 'c', now).sort()).toEqual(['a', 'd']); // 롤백 상태: 직전 = b, e는 7일 이내
    expect(selectGc(builds, 'e', now).sort()).toEqual(['a', 'b', 'c']);
    expect(selectGc(builds, undefined, now).sort()).toEqual(['a', 'b', 'c', 'd']); // 현재 없음: 최신(e)만 직전 취급
  });

  it('deletes files listed in KV and prunes the build list (dry run deletes nothing)', async () => {
    const kv = fakeKv();
    kv.m.set(BUILDS_KEY(1), JSON.stringify([b('old', '01'), b('prev', '10'), b('cur', '20')]));
    kv.m.set(CURRENT_KEY(1), 'cur');
    kv.m.set(FILES_KEY('old'), JSON.stringify(['world.json', 'L0/0/0.tkc']));
    const up = fakeUploader();
    expect(
      await gcBuilds({ uploader: up, kv, formatVersion: 1, log, dryRun: true, now: new Date('2026-09-29T00:00:00Z') }),
    ).toEqual(['old']);
    expect(up.deleted).toEqual([]);
    await gcBuilds({ uploader: up, kv, formatVersion: 1, log, dryRun: false, now: new Date('2026-09-29T00:00:00Z') });
    expect(up.deleted.sort()).toEqual(['world/old/L0/0/0.tkc', 'world/old/world.json']);
    expect((JSON.parse(kv.m.get(BUILDS_KEY(1)) ?? '[]') as BuildEntry[]).map((x) => x.buildId)).toEqual([
      'prev',
      'cur',
    ]);
    expect(kv.m.has(FILES_KEY('old'))).toBe(false);
  });
});

describe('targets', () => {
  it('reads R2/KV bindings from apps/worker/wrangler.jsonc (dev = env.staging)', () => {
    expect(stripJsonc('{ "a": "http://x", // c\n /* b */ "b": [1,], }')).toBe('{ "a": "http://x", \n  "b": [1] }');
    const t = readTargets(resolve(REPO, 'apps/worker/wrangler.jsonc'));
    expect(t.dev.bucket).toBe('sanpo-world-dev');
    expect(t.prod.bucket).toBe('sanpo-world-prod');
    expect(t.dev.kvNamespaceId).not.toBe(t.prod.kvNamespaceId);
  });
});
