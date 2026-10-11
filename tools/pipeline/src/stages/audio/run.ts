// 오디오 단계(M09-T04 — ADR-0079): content/audio/library.json → 원천 받기(sha256 lock) → 베드 루프·발소리 조각 → Opus(OGG) + manifest.json
// → data/derived/audio/<hash>/ → (--build-id) 빌드 shared/audio/(R2 공유 에셋 — 지연 로딩, 첫 로드 예산 밖). 컨테이너 전용(ffmpeg).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import type { AudioManifest, AudioManifestEntry } from '@sanpo/tile-format';
import { type AudioLock, fetchAudioSources } from './fetch.ts';
import { decodePcm, encodeOpus } from './ffmpeg.ts';
import type { AudioLibrary, AudioOutput } from './library.ts';
import { BED_TARGET_DBFS, makeLoop, normalizeRms, pickLoopWindow } from './loop.ts';
import { sliceSteps } from './steps.ts';

/** 처리 규칙 버전 — 바꾸면 해시가 바뀌어 다시 만든다. */
const AUDIO_RULES = 1;
const BED_KBPS = 64;
const STEP_KBPS = 48;

export interface BuildAudioInput {
  library: AudioLibrary;
  lock: AudioLock;
  updateLock: boolean;
  rawDir: string;
  derivedDir: string;
  log: Logger;
  force?: boolean;
}

export interface OutputReport {
  id: string;
  kind: AudioOutput['kind'];
  bytes: number;
  durS: number;
  startS?: number;
  tonal?: number;
  crest?: number;
  gainDb?: number;
  steps?: number;
}

function hashOf(lib: AudioLibrary, lock: AudioLock): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({ rules: AUDIO_RULES, outputs: lib.outputs, sha: lock.sha256, kb: [BED_KBPS, STEP_KBPS] }));
  return h.digest('hex').slice(0, 16);
}

async function buildOne(
  o: AudioOutput,
  srcPath: string,
  dir: string,
): Promise<{ entry: AudioManifestEntry; report: OutputReport }> {
  const file = `${o.id}.ogg`;
  const out = join(dir, file);
  if (o.kind === 'bed') {
    const pcm = await decodePcm(srcPath, 2);
    const pick = pickLoopWindow(pcm, o.loopS);
    const loop = makeLoop(pcm, pick.startS, o.loopS);
    const gainDb = normalizeRms(loop, BED_TARGET_DBFS);
    await encodeOpus(loop, out, BED_KBPS);
    const bytes = statSync(out).size;
    return {
      entry: { file, bytes, kind: 'bed', durS: o.loopS, source: o.source },
      report: {
        id: o.id,
        kind: 'bed',
        bytes,
        durS: o.loopS,
        startS: pick.startS,
        tonal: pick.tonal,
        crest: pick.crest,
        gainDb,
      },
    };
  }
  const sheet = sliceSteps(await decodePcm(srcPath, 1), o.maxSteps);
  await encodeOpus(sheet.pcm, out, STEP_KBPS);
  const bytes = statSync(out).size;
  const durS = sheet.pcm.data.length / sheet.pcm.rate;
  return {
    entry: { file, bytes, kind: 'steps', durS, steps: sheet.steps, source: o.source },
    report: { id: o.id, kind: 'steps', bytes, durS, steps: sheet.steps.length },
  };
}

/** 반환 = 결과 폴더·manifest·출력별 보고(로그·PR 기록용). 같은 해시가 있으면 재사용. */
export async function buildAudio(
  i: BuildAudioInput,
): Promise<{ dir: string; manifest: AudioManifest; reports: OutputReport[]; cached: boolean }> {
  const paths = await fetchAudioSources({
    sources: i.library.sources,
    rawDir: i.rawDir,
    lock: i.lock,
    updateLock: i.updateLock,
    log: i.log,
  });
  const hash = hashOf(i.library, i.lock);
  const dir = join(i.derivedDir, 'audio', hash);
  const manifestPath = join(dir, 'manifest.json');
  if (!i.force && existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AudioManifest;
    const reports = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as OutputReport[];
    return { dir, manifest, reports, cached: true };
  }
  mkdirSync(dir, { recursive: true });
  const files: Record<string, AudioManifestEntry> = {};
  const reports: OutputReport[] = [];
  for (const o of i.library.outputs) {
    const r = await buildOne(o, paths.get(o.source) as string, dir);
    files[o.id] = r.entry;
    reports.push(r.report);
    i.log.info(`${o.id}: ${(r.report.bytes / 1024).toFixed(0)} KiB ${JSON.stringify(r.report)}`);
  }
  const used = new Set(i.library.outputs.map((o) => o.source));
  const credits = i.library.sources
    .filter((s) => used.has(s.id))
    .map((s) => ({ id: s.id, title: s.title, author: s.author, license: s.license, url: s.url }));
  const manifest: AudioManifest = { schema: 1, hash, files, credits };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(reports, null, 1)}\n`);
  return { dir, manifest, reports, cached: false };
}

/** 빌드 shared/audio/로 복사(manifest + ogg — report.json 제외). 반환 = 대상 폴더. */
export function installAudio(dir: string, buildDir: string): string {
  const dst = join(buildDir, 'shared', 'audio');
  mkdirSync(dst, { recursive: true });
  cpSync(dir, dst, { recursive: true, filter: (src) => !src.endsWith('report.json') });
  return dst;
}
