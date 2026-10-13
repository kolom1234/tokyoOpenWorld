// 오디오 원천 받기 + sha256 고정(data/sources.lock.json `freesound-audio`.sha256 맵) — materials/fetch.ts와 같은 규칙: 불일치 = 중단, 미기록 = --update-lock일 때만 기록.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { sha256Of } from '../materials/fetch.ts';
import { type AudioSource, rawNameOf } from './library.ts';

export const AUDIO_LOCK_ID = 'freesound-audio';

export interface AudioLock {
  id: typeof AUDIO_LOCK_ID;
  sha256: Record<string, string>;
  [k: string]: unknown;
}

export interface FetchAudioInput {
  sources: readonly AudioSource[];
  rawDir: string;
  lock: AudioLock;
  updateLock: boolean;
  log: Logger;
  fetchFn?: (url: string) => Promise<Response>;
}

/** 반환 = 원천 id → 로컬 경로. */
export async function fetchAudioSources(o: FetchAudioInput): Promise<Map<string, string>> {
  const fetchFn = o.fetchFn ?? ((u: string) => fetch(u, { headers: { 'User-Agent': 'tokyo-sanpo-pipeline' } }));
  mkdirSync(o.rawDir, { recursive: true });
  const out = new Map<string, string>();
  for (const s of o.sources) {
    const name = rawNameOf(s);
    const path = join(o.rawDir, name);
    if (!existsSync(path)) {
      const res = await fetchFn(s.preview);
      if (!res.ok) throw new Error(`${s.id}: HTTP ${res.status} ${s.preview}`);
      writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
      o.log.info(`downloaded ${name}`);
    }
    const sha = sha256Of(readFileSync(path));
    const locked = o.lock.sha256[name];
    if (locked === undefined) {
      if (!o.updateLock)
        throw new Error(`${name}: not in sources.lock ${AUDIO_LOCK_ID}.sha256 (run with --update-lock)`);
      o.lock.sha256[name] = sha;
    } else if (locked !== sha) {
      throw new Error(`${name}: sha256 ${sha} ≠ lock ${locked}`);
    }
    out.set(s.id, path);
  }
  return out;
}
