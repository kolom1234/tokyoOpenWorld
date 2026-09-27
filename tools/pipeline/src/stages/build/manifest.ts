// 빌드 식별·매니페스트: buildId(YYYYMMDD-<git7>-<lock8>), world.json 직렬화. see docs/04-data-pipeline.md §2, docs/05-tile-format.md §2
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WORLD_ORIGIN } from '@sanpo/geo';
import { FORMAT_VERSION } from '@sanpo/tile-format';

export interface AreaDef {
  id: string;
  l0: { minIx: number; maxIx: number; minIz: number; maxIz: number };
}

/** 스폰 = 스크램블 교차로(05 §2 예시, M01-T01에서 WF 확인). */
const SPAWN_WF = [-22.3, 0, 8.6];
const LEVELS = [256, 1024, 4096, 16384];
const UNKNOWN_GIT = '0000000';

function readGitRef(gitDir: string, ref: string): string | undefined {
  const loose = join(gitDir, ref);
  if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
  const packed = join(gitDir, 'packed-refs');
  if (!existsSync(packed)) return undefined;
  const line = readFileSync(packed, 'utf8')
    .split('\n')
    .find((l) => l.endsWith(` ${ref}`));
  return line?.split(' ')[0];
}

/**
 * HEAD 커밋 7자리. git 실행 파일 없이 `.git`을 직접 읽는다(컨테이너에 git 없음, 소유자 불일치 경고 회피).
 * 워크트리(`.git` 파일)·읽기 실패 시 `SANPO_GIT_SHA` 또는 0000000.
 */
export function gitShort(repoRoot: string): string {
  const env = process.env.SANPO_GIT_SHA;
  if (env && /^[0-9a-f]{7,40}$/.test(env)) return env.slice(0, 7);
  let gitDir = join(repoRoot, '.git');
  try {
    if (!existsSync(join(gitDir, 'HEAD'))) {
      const m = /^gitdir: (.+)$/m.exec(readFileSync(gitDir, 'utf8'));
      gitDir = resolve(repoRoot, m?.[1]?.trim() ?? '.git');
    }
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
    const sha = head.startsWith('ref: ') ? readGitRef(gitDir, head.slice(5)) : head;
    return sha && /^[0-9a-f]{40}$/.test(sha) ? sha.slice(0, 7) : UNKNOWN_GIT;
  } catch {
    return UNKNOWN_GIT;
  }
}

/** `data/sources.lock.json` 바이트의 sha256 앞 8자리. */
export function lockHash8(repoRoot: string): string {
  return createHash('sha256')
    .update(readFileSync(join(repoRoot, 'data/sources.lock.json')))
    .digest('hex')
    .slice(0, 8);
}

/** 빌드 날짜(UTC): `SOURCE_DATE_EPOCH`(초)가 있으면 그것, 아니면 현재. */
export function buildDate(): Date {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : new Date();
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** buildId = `YYYYMMDD-<gitShort7>-<lockHash8>`(docs/04 §2). 같은 날·커밋·lock → 같은 ID → 같은 바이트. */
export function makeBuildId(repoRoot: string, date = buildDate()): string {
  return `${yyyymmdd(date)}-${gitShort(repoRoot)}-${lockHash8(repoRoot)}`;
}

/** buildId의 날짜 → createdAt(`YYYY-MM-DDT00:00:00Z`). 시각을 넣지 않아 재빌드 바이트가 같다. */
export function createdAtOf(buildId: string): string {
  const d = buildId.slice(0, 8);
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`;
}

/** world.json 텍스트(키 순서 고정, 2칸 들여쓰기, 끝 개행). 파일 참조 중 아직 없는 것(rail·map·materials)은 후속 태스크에서 생성. */
export function worldJson(o: { buildId: string; area: AreaDef }): string {
  const world = {
    schema: 1,
    formatVersion: FORMAT_VERSION,
    buildId: o.buildId,
    crs: { projected: WORLD_ORIGIN.epsg, E0: WORLD_ORIGIN.E0, N0: WORLD_ORIGIN.N0, heightDatum: 'TP' },
    cellSize: LEVELS[0],
    levels: LEVELS,
    areas: [{ id: o.area.id, l0: { ...o.area.l0 } }],
    spawn: { posWF: SPAWN_WF, yawDeg: 0 },
    files: {
      cellsIndex: 'cells.idx',
      materials: 'shared/materials/manifest.json',
      rail: 'global/rail.bin',
      map: 'global/map.pmtiles',
    },
    createdAt: createdAtOf(o.buildId),
  };
  return `${JSON.stringify(world, null, 2)}\n`;
}
