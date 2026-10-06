// publish: data/build/<buildId> → R2 `world/<buildId>/**`(동시성·재시도) → 매니페스트 → 검증(S3 HEAD 또는 Worker HEAD) → KV 빌드 목록·(선택) 현재 포인터.
// gc: 현재 + 직전 1개 + 7일 이내만 남기고 삭제(파일 목록은 KV `BUILD_FILES:<id>`). see docs/04-data-pipeline.md §4.7, docs/13-deployment.md §8
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Logger } from '@sanpo/core';
import { readCellsIndex } from '@sanpo/tile-format';
import { sha256Hex } from '../../lib/sigv4.ts';
import type { KvClient, Uploader } from './uploaders.ts';

export const CURRENT_KEY = (fv: number): string => `CURRENT_BUILD:v${fv}`;
export const BUILDS_KEY = (fv: number): string => `BUILDS:v${fv}`;
export const FILES_KEY = (buildId: string): string => `BUILD_FILES:${buildId}`;
const RETRIES = 3;
/** 검증 HEAD는 압축을 끈다(엣지가 JSON을 압축하면 Content-Length가 빠진다). */
const IDENTITY = { 'accept-encoding': 'identity' };

export interface BuildEntry {
  buildId: string;
  publishedAt: string;
  files: number;
  bytes: number;
}

export interface PublishFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PublishReport {
  buildId: string;
  files: PublishFile[];
  bytes: number;
  uploadMs: number;
  verified: 'size' | 'worker' | 'none';
  setCurrent: boolean;
}

/** 동시성 제한 병렬 실행(순서 보존 결과). */
export async function mapLimit<T, R>(
  items: readonly T[],
  n: number,
  fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

async function withRetry<T>(what: string, fn: () => Promise<T>, log: Logger): Promise<T> {
  for (let a = 1; ; a++) {
    try {
      return await fn();
    } catch (e) {
      if (a > RETRIES) throw e;
      log.warn(`${what}: retry ${a}/${RETRIES}`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 500 * 2 ** (a - 1)));
    }
  }
}

/** 공유 에셋: 머티리얼 KTX2 배열·manifest(M03-T01, materials --build-id가 설치). */
const SHARED_FILE_RE = /^shared\/materials\/[A-Za-z0-9_-]+\.(json|ktx2)$/;
/** 전역 파일(M07): 철도 망·시간표. */
const GLOBAL_FILE_RE = /^global\/(rail\.bin|timetables\/[A-Za-z0-9_-]+\.json)$/;

/** 퍼블리시 대상: world.json, cells.idx, L<n>/**.tkc, shared/materials/*(보고서·작업 파일 제외). 정렬된 상대 경로. */
export function buildFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        const relDir = relative(dir, p).replaceAll('\\', '/');
        if (
          /^L[0-3]$|^-?\d+$/.test(name) ||
          ['shared', 'shared/materials', 'global', 'global/timetables'].includes(relDir)
        )
          walk(p);
        continue;
      }
      const rel = relative(dir, p).replaceAll('\\', '/');
      if (
        rel === 'world.json' ||
        rel === 'cells.idx' ||
        /^L[0-3]\/-?\d+\/-?\d+\.tkc$/.test(rel) ||
        SHARED_FILE_RE.test(rel) ||
        GLOBAL_FILE_RE.test(rel)
      )
        out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/** world.json buildId·cells.idx ↔ 파일 목록 일치(퍼블리시 전 마지막 확인). */
export function checkBuildDir(dir: string, buildId: string, files: readonly string[]): void {
  const world = JSON.parse(readFileSync(join(dir, 'world.json'), 'utf8')) as { buildId: string; formatVersion: number };
  if (world.buildId !== buildId) throw new Error(`world.json buildId ${world.buildId} ≠ ${buildId}`);
  const idx = readCellsIndex(readFileSync(join(dir, 'cells.idx')));
  if (!idx.ok) throw new Error(`cells.idx: ${idx.error.code}`);
  const tkc = files.filter((f) => f.endsWith('.tkc'));
  if (tkc.length !== idx.value.size) throw new Error(`cells.idx ${idx.value.size} entries ≠ ${tkc.length} .tkc files`);
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  return path.endsWith('.ktx2') ? 'image/ktx2' : 'application/octet-stream';
}

export interface PublishInput {
  buildDir: string;
  buildId: string;
  formatVersion: number;
  uploader: Uploader;
  kv: KvClient;
  log: Logger;
  concurrency?: number;
  setCurrent: boolean;
  /** 배포된 Worker의 `/world` 루트(예: https://…/world) — HEAD로 크기 검증. */
  verifyBaseUrl?: string;
  now?: () => Date;
}

async function verify(input: PublishInput, files: PublishFile[]): Promise<PublishReport['verified']> {
  const { uploader, buildId } = input;
  const n = input.concurrency ?? 16;
  const bad: string[] = [];
  if (uploader.name === 's3') {
    await mapLimit(files, n, async (f) => {
      if ((await uploader.size(`world/${buildId}/${f.path}`)) !== f.bytes) bad.push(f.path);
    });
  } else if (input.verifyBaseUrl) {
    await mapLimit(files, n, async (f) => {
      const res = await fetch(`${input.verifyBaseUrl}/${buildId}/${f.path}`, { method: 'HEAD', headers: IDENTITY });
      if (!res.ok || Number(res.headers.get('content-length')) !== f.bytes) bad.push(`${f.path} (${res.status})`);
    });
  } else return 'none';
  if (bad.length > 0) throw new Error(`verify: ${bad.length} mismatched, e.g. ${bad.slice(0, 5).join(', ')}`);
  return uploader.name === 's3' ? 'size' : 'worker';
}

export async function publishBuild(input: PublishInput): Promise<PublishReport> {
  const { buildDir, buildId, uploader, kv, log, formatVersion } = input;
  const paths = buildFiles(buildDir);
  checkBuildDir(buildDir, buildId, paths);
  const t0 = performance.now();
  let done = 0;
  const files = await mapLimit(paths, input.concurrency ?? 16, async (path) => {
    const body = new Uint8Array(readFileSync(join(buildDir, path)));
    const sha256 = sha256Hex(body);
    await withRetry(
      path,
      () => uploader.put({ key: `world/${buildId}/${path}`, body, contentType: contentType(path), sha256 }),
      log,
    );
    if (++done % 50 === 0) log.info(`uploaded ${done}/${paths.length}`);
    return { path, bytes: body.length, sha256 };
  });
  const bytes = files.reduce((a, f) => a + f.bytes, 0);
  const publishedAt = (input.now?.() ?? new Date()).toISOString();
  const manifest = new TextEncoder().encode(
    `${JSON.stringify({ buildId, formatVersion, publishedAt, bytes, files })}\n`,
  );
  await uploader.put({
    key: `world/${buildId}/manifest.json`,
    body: manifest,
    contentType: 'application/json',
    sha256: sha256Hex(manifest),
  });
  const uploadMs = performance.now() - t0;
  const verified = await verify(input, files);
  await kv.put(FILES_KEY(buildId), JSON.stringify([...paths, 'manifest.json']));
  const builds = JSON.parse((await kv.get(BUILDS_KEY(formatVersion))) ?? '[]') as BuildEntry[];
  const entry: BuildEntry = { buildId, publishedAt, files: files.length, bytes };
  await kv.put(BUILDS_KEY(formatVersion), JSON.stringify([...builds.filter((b) => b.buildId !== buildId), entry]));
  if (input.setCurrent) await kv.put(CURRENT_KEY(formatVersion), buildId);
  return { buildId, files, bytes, uploadMs, verified, setCurrent: input.setCurrent };
}

/** 퍼블리시된 빌드를 Worker(`<baseUrl>/<buildId>/<path>`) HEAD로 크기 대조. 반환 = 불일치 목록. */
export async function verifyViaWorker(
  buildDir: string,
  buildId: string,
  baseUrl: string,
  concurrency = 16,
): Promise<string[]> {
  const bad: string[] = [];
  await mapLimit(buildFiles(buildDir), concurrency, async (path) => {
    const bytes = statSync(join(buildDir, path)).size;
    const res = await fetch(`${baseUrl}/${buildId}/${path}`, { method: 'HEAD', headers: IDENTITY });
    if (!res.ok || Number(res.headers.get('content-length')) !== bytes) bad.push(`${path} (${res.status})`);
  });
  return bad;
}

/** gc 대상 선택(순수): 현재·직전 1개·keepDays 이내는 남긴다. */
export function selectGc(
  builds: readonly BuildEntry[],
  current: string | undefined,
  now: Date,
  keepDays = 7,
): string[] {
  const sorted = [...builds].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  // 직전 1개 = 현재보다 먼저 퍼블리시된 것 중 가장 최근(롤백 대상). 현재가 목록에 없으면 가장 최근 것.
  const cur = sorted.find((b) => b.buildId === current);
  const previous = sorted.find((b) => b.buildId !== current && (!cur || b.publishedAt < cur.publishedAt))?.buildId;
  const cutoff = now.getTime() - keepDays * 86_400_000;
  return sorted
    .filter((b) => b.buildId !== current && b.buildId !== previous && Date.parse(b.publishedAt) < cutoff)
    .map((b) => b.buildId);
}

export interface GcInput {
  uploader: Uploader;
  kv: KvClient;
  formatVersion: number;
  log: Logger;
  dryRun: boolean;
  now?: Date;
  keepDays?: number;
}

export async function gcBuilds(input: GcInput): Promise<string[]> {
  const { kv, uploader, formatVersion, log } = input;
  const builds = JSON.parse((await kv.get(BUILDS_KEY(formatVersion))) ?? '[]') as BuildEntry[];
  const current = await kv.get(CURRENT_KEY(formatVersion));
  const victims = selectGc(builds, current, input.now ?? new Date(), input.keepDays);
  for (const id of victims) {
    const files = JSON.parse((await kv.get(FILES_KEY(id))) ?? '[]') as string[];
    log.info(`gc ${id}: ${files.length} files${input.dryRun ? ' (dry run)' : ''}`);
    if (input.dryRun) continue;
    await mapLimit(files, 16, (f) => withRetry(f, () => uploader.delete(`world/${id}/${f}`), log));
    await kv.delete(FILES_KEY(id));
  }
  if (!input.dryRun && victims.length > 0) {
    await kv.put(BUILDS_KEY(formatVersion), JSON.stringify(builds.filter((b) => !victims.includes(b.buildId))));
  }
  return victims;
}
