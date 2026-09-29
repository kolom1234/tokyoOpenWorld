// ambientCG zip 받기 + sha256 고정(data/sources.lock.json `ambientcg`.sha256 맵). 불일치 = 중단, 미기록 = --update-lock일 때만 기록.
// see docs/03-data-sources.md §4·§7
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { AMBIENTCG_GET, zipNameOf } from './library.ts';

export interface AmbientLock {
  id: 'ambientcg';
  sha256: Record<string, string>;
  [k: string]: unknown;
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface FetchAssetsInput {
  assets: readonly string[];
  rawDir: string;
  lock: AmbientLock;
  /** 새 파일의 해시를 lock에 기록(최초 선정·자산 추가 시). false면 미기록 = 오류. */
  updateLock: boolean;
  log: Logger;
  fetchFn?: (url: string) => Promise<Response>;
}

/** 반환 = asset → 로컬 zip 경로. lock.sha256은 updateLock일 때 갱신(호출자가 파일에 저장). */
export async function fetchAssets(o: FetchAssetsInput): Promise<Map<string, string>> {
  const fetchFn = o.fetchFn ?? ((u: string) => fetch(u));
  mkdirSync(o.rawDir, { recursive: true });
  const out = new Map<string, string>();
  for (const asset of o.assets) {
    const name = zipNameOf(asset);
    const path = join(o.rawDir, name);
    if (!existsSync(path)) {
      const res = await fetchFn(`${AMBIENTCG_GET}${name}`);
      if (!res.ok) throw new Error(`ambientCG ${name}: HTTP ${res.status}`);
      writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
      o.log.info(`downloaded ${name}`);
    }
    const sha = sha256Of(readFileSync(path));
    const locked = o.lock.sha256[name];
    if (locked === undefined) {
      if (!o.updateLock) throw new Error(`${name}: not in sources.lock ambientcg.sha256 (run with --update-lock)`);
      o.lock.sha256[name] = sha;
    } else if (locked !== sha) {
      throw new Error(`${name}: sha256 ${sha} ≠ lock ${locked}`);
    }
    out.set(asset, path);
  }
  return out;
}
