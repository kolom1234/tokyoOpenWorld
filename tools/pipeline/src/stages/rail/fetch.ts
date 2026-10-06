// 철도 원천 받기(M07-T01·T02): 국토수치정보 N02(철도, CC BY 4.0) zip → sha256(lock 대조) → GeoJSON 꺼내기,
// ODPT 도쿄메트로 GTFS(키 = 환경 변수 ODPT_CONSUMER_KEY — 값은 로그·파일·URL 기록 어디에도 남기지 않는다). see docs/03-data-sources.md §1–2
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { readZip } from '../../lib/zip.ts';

export const N02_SOURCE = 'ksj-n02';
/** 2025년도판(令和7年度, 2025-06 공개) — 국토수치정보 다운로드 서비스. */
export const N02_URL = 'https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip';
export const N02_ZIP = 'N02-25_GML.zip';
/** 꺼낼 항목(UTF-8 GeoJSON): 선로 구간·역. */
export const N02_FILES = ['RailroadSection', 'Station'] as const;

export const ODPT_SOURCE = 'odpt-tokyometro';
/** ODPT 도쿄메트로 열차 GTFS(키는 쿼리 acl:consumerKey — 붙이는 곳은 이 함수 안뿐). */
export const ODPT_GTFS_URL = 'https://api.odpt.org/api/v4/files/TokyoMetro/data/TokyoMetro-Train-GTFS.zip';
export const ODPT_ZIP = 'TokyoMetro-Train-GTFS.zip';

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** lock sha256가 정해져 있으면(TBD 아님) 일치 확인. */
function checkLock(id: string, got: string, lockSha: string | undefined): void {
  if (lockSha && lockSha !== 'TBD' && lockSha !== got)
    throw new Error(`${id}: sha256 ${got} ≠ lock ${lockSha} (원천이 바뀌었다 — lock 갱신은 사람이 확인 뒤)`);
}

/** N02 zip(없으면 받기) → sha256 → `extracted/<이름>.geojson`. 반환 = sha256·꺼낸 파일. */
export async function fetchN02(rawDir: string, lockSha: string | undefined, log: Logger) {
  mkdirSync(rawDir, { recursive: true });
  const zipPath = join(rawDir, N02_ZIP);
  if (!existsSync(zipPath)) {
    const res = await fetch(N02_URL);
    if (!res.ok) throw new Error(`${N02_URL}: HTTP ${res.status}`);
    writeFileSync(zipPath, new Uint8Array(await res.arrayBuffer()));
  }
  const buf = new Uint8Array(readFileSync(zipPath));
  const sha = sha256(buf);
  checkLock(N02_SOURCE, sha, lockSha);
  const out = join(rawDir, 'extracted');
  mkdirSync(out, { recursive: true });
  const entries = readZip(buf);
  const files: string[] = [];
  for (const want of N02_FILES) {
    const e =
      [...entries.values()].find((x) => x.name.endsWith(`_${want}.geojson`) && /utf-?8/i.test(x.name)) ??
      [...entries.values()].find((x) => x.name.endsWith(`_${want}.geojson`));
    if (!e) throw new Error(`${N02_ZIP}: ${want}.geojson 없음 (${[...entries.keys()].slice(0, 12).join(', ')})`);
    const path = join(out, `${want}.geojson`);
    writeFileSync(path, e.read());
    files.push(path);
  }
  log.info(`${N02_SOURCE}: ${buf.byteLength} B sha256 ${sha} → ${files.length} geojson`);
  return { sha, files };
}

/**
 * ODPT 도쿄메트로 GTFS(없으면 받기). 키 = `ODPT_CONSUMER_KEY`(없으면 null — 호출자가 "키 대기"로 넘어간다).
 * 키가 든 URL·응답 헤더는 기록하지 않는다(오류도 상태 코드만).
 */
export async function fetchOdptGtfs(rawDir: string, lockSha: string | undefined, env: NodeJS.ProcessEnv, log: Logger) {
  mkdirSync(rawDir, { recursive: true });
  const zipPath = join(rawDir, ODPT_ZIP);
  if (!existsSync(zipPath)) {
    const key = env.ODPT_CONSUMER_KEY;
    if (!key) {
      log.warn(`${ODPT_SOURCE}: ODPT_CONSUMER_KEY 없음 — GTFS 키 대기(긴자선 시간표는 건너뜀)`);
      return null;
    }
    const u = new URL(ODPT_GTFS_URL);
    u.searchParams.set('acl:consumerKey', key);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`${ODPT_SOURCE}: HTTP ${res.status}`);
    writeFileSync(zipPath, new Uint8Array(await res.arrayBuffer()));
  }
  const buf = new Uint8Array(readFileSync(zipPath));
  const sha = sha256(buf);
  checkLock(ODPT_SOURCE, sha, lockSha);
  log.info(`${ODPT_SOURCE}: ${buf.byteLength} B sha256 ${sha}`);
  return { sha, zipPath };
}
