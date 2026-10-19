// 활성 빌드 포인터(M11-T06 — 롤백 1분 이내): KV `CURRENT_BUILD:v<fv>`만 바꾼다(파일 재업로드 없음). 대상은 이미 퍼블리시된(`BUILDS:v<fv>` 목록에 있는) 빌드만.
import type { Logger } from '@sanpo/core';
import { BUILDS_KEY, CURRENT_KEY } from './publish.ts';
import type { KvClient } from './uploaders.ts';

export interface PointerState {
  current: string | null;
  builds: string[];
}

export async function readPointer(kv: KvClient, formatVersion: number): Promise<PointerState> {
  const builds = JSON.parse((await kv.get(BUILDS_KEY(formatVersion))) ?? '[]') as { buildId: string }[];
  return { current: (await kv.get(CURRENT_KEY(formatVersion))) ?? null, builds: builds.map((b) => b.buildId) };
}

/** 포인터를 buildId로(목록에 없으면 거부). 반환 = 바꾸기 전 값(되돌리기용). */
export async function setCurrentBuild(
  kv: KvClient,
  formatVersion: number,
  buildId: string,
  log: Logger,
): Promise<string | null> {
  const s = await readPointer(kv, formatVersion);
  if (!s.builds.includes(buildId))
    throw new Error(`build ${buildId} is not published (known: ${s.builds.join(', ') || 'none'})`);
  await kv.put(CURRENT_KEY(formatVersion), buildId);
  log.info(`current ${s.current ?? '(none)'} → ${buildId}`);
  return s.current;
}
