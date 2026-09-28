// 23구 원경 건물 추출: plateau-tokyo23 zip의 udx/bldg/*.gml을 풀지 않고 `unzip -p` 스트림 → SAX 리더 → FarBuilding
// → L2 셀(중심점) 버킷 → data/derived/far-buildings/L2_<ix>_<iz>.ndjson.gz(id 정렬, 결정론). 멤버 단위로 워커 스레드 병렬.
// see docs/04-data-pipeline.md §4.5, ADR-0024
import { execFile, spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Worker } from 'node:worker_threads';
import { cellIdString, type Logger } from '@sanpo/core';
import { type CellBoundsWF, cellOf } from '@sanpo/geo';
import { readNdjsonGz, writeNdjsonGz } from '../../lib/ndjson-gz.ts';
import { createCityGmlSaxReader } from '../../readers/plateau/citygml-sax.ts';
import { type FarBuilding, farBuildingOf, farFromRow, farToLine } from './far-buildings.ts';

const run = promisify(execFile);
export const FAR_BUILDINGS_DIR = 'far-buildings';

/** zip 안 건물 GML 멤버(정렬). */
export async function listBldgMembers(zipPath: string): Promise<string[]> {
  const { stdout } = await run('unzip', ['-Z1', zipPath], { maxBuffer: 1 << 26 });
  return stdout
    .split('\n')
    .filter((m) => /\/udx\/bldg\/[^/]+\.gml$/.test(m))
    .sort();
}

/** 멤버 1개 → (L2 셀 id, 줄) 목록. 범위 밖 건물은 버린다. */
export async function extractMember(
  zipPath: string,
  member: string,
  sourceId: string,
  extent: CellBoundsWF,
): Promise<{ cell: string; line: string; id: string }[]> {
  const child = spawn('unzip', ['-p', zipPath, member], { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  const exit = new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? 0)));
  const out: { cell: string; line: string; id: string }[] = [];
  const reader = createCityGmlSaxReader();
  for await (const f of reader.readChunks(child.stdout as AsyncIterable<string>, { sourceId })) {
    if (f.layer !== 'buildings') continue;
    const fb = farBuildingOf(f);
    if (!fb || fb.cx < extent.minX || fb.cx >= extent.maxX || fb.cz < extent.minZ || fb.cz >= extent.maxZ) continue;
    out.push({ cell: cellIdString(cellOf(2, fb.cx, fb.cz)), line: farToLine(fb), id: fb.id });
  }
  const code = await exit;
  if (code !== 0) throw new Error(`unzip -p ${member}: exit ${code}`);
  return out;
}

export interface ExtractInput {
  zipPath: string;
  sourceId: string;
  extent: CellBoundsWF;
  /** 보통 data/derived. */
  derivedDir: string;
  log: Logger;
  workers?: number;
}

type Row = { cell: string; line: string; id: string };

/** 워커 스레드 N개가 멤버를 나눠 처리(멤버 순서와 무관하게 결과는 id 정렬로 결정론). */
async function runPool(input: ExtractInput, members: string[]): Promise<Row[]> {
  const n = Math.max(1, Math.min(input.workers ?? availableParallelism() - 1, members.length));
  const rows: Row[] = [];
  let next = 0;
  let done = 0;
  const t0 = performance.now();
  const one = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL('./tokyo23-lod1.worker.ts', import.meta.url));
      const feed = (): void => {
        if (next >= members.length) {
          void w.terminate().then(() => resolve());
          return;
        }
        const member = members[next++] as string;
        w.postMessage({ zipPath: input.zipPath, member, sourceId: input.sourceId, extent: input.extent });
      };
      w.on('message', (m: { rows?: Row[]; error?: string }) => {
        if (m.error) return reject(new Error(m.error));
        rows.push(...(m.rows ?? []));
        done++;
        if (done % 25 === 0)
          input.log.info(
            `far buildings: ${done}/${members.length} members, ${rows.length} bldgs, ${Math.round((performance.now() - t0) / 1000)} s`,
          );
        feed();
      });
      w.on('error', reject);
      feed();
    });
  await Promise.all(Array.from({ length: n }, one));
  return rows;
}

/** 전체 추출 → 셀 파일 쓰기. 같은 gml:id(메시 경계 중복)는 첫 것만. */
export async function extractTokyo23(
  input: ExtractInput,
): Promise<{ members: number; buildings: number; cells: number }> {
  const members = await listBldgMembers(input.zipPath);
  const rows = await runPool(input, members);
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byCell = new Map<string, string[]>();
  let last = '';
  let buildings = 0;
  for (const r of rows) {
    if (r.id === last) continue;
    last = r.id;
    let list = byCell.get(r.cell);
    if (!list) {
      list = [];
      byCell.set(r.cell, list);
    }
    list.push(r.line);
    buildings++;
  }
  for (const [cell, lines] of byCell)
    writeNdjsonGz(join(input.derivedDir, FAR_BUILDINGS_DIR, `${cell}.ndjson.gz`), lines);
  return { members: members.length, buildings, cells: byCell.size };
}

/** L2 셀 원경 건물 읽기(파일 없으면 빈 배열). */
export function readFarBuildings(derivedDir: string, l2CellId: string): FarBuilding[] {
  const f = join(derivedDir, FAR_BUILDINGS_DIR, `${l2CellId}.ndjson.gz`);
  try {
    return readNdjsonGz<Parameters<typeof farFromRow>[0]>(f).map(farFromRow);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}
