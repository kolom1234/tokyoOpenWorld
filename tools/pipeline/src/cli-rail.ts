// CLI 철도 단계(cli.ts에서 분리, M07): fetch(N02·ODPT GTFS → data/raw, sha256 lock), rail(OSM 철도 정규화 → 노선 파생 → global/rail.bin),
// timetables(합성 + GTFS → global/timetables). see docs/04-data-pipeline.md §4.3, docs/10-simulation.md §6
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Logger } from '@sanpo/core';
import { gunzip, parseRail } from '@sanpo/tile-format';
import { buildRailGlobal } from './stages/build/rail-global.ts';
import { fetchN02, fetchOdptGtfs, N02_SOURCE, N02_URL, ODPT_SOURCE } from './stages/rail/fetch.ts';
import { buildTimetables } from './stages/timetables/index.ts';

export interface RailCtx {
  repoRoot: string;
  log: Logger;
}

interface LockEntry {
  id: string;
  url: string;
  sha256: string;
  retrievedAt: string | null;
  [k: string]: unknown;
}

function readLock(repoRoot: string): { path: string; file: { sources: LockEntry[] } } {
  const path = join(repoRoot, 'data/sources.lock.json');
  return { path, file: JSON.parse(readFileSync(path, 'utf8')) as { sources: LockEntry[] } };
}

/** `fetch --source ksj-n02|odpt-tokyometro [--update-lock]` — 원천 받기 + sha256(lock 대조, --update-lock이면 기록). */
export async function fetchSources(ctx: RailCtx, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { source: { type: 'string', default: N02_SOURCE }, 'update-lock': { type: 'boolean', default: false } },
  });
  const lock = readLock(ctx.repoRoot);
  const entry = lock.file.sources.find((s) => s.id === values.source);
  if (!entry) throw new Error(`fetch: ${values.source} not in sources.lock.json`);
  const rawDir = join(ctx.repoRoot, 'data/raw', values.source);
  const flog = ctx.log.child('fetch');
  let sha: string | undefined;
  if (values.source === N02_SOURCE) sha = (await fetchN02(rawDir, entry.sha256, flog)).sha;
  else if (values.source === ODPT_SOURCE) sha = (await fetchOdptGtfs(rawDir, entry.sha256, process.env, flog))?.sha;
  else throw new Error(`fetch: ${values.source} 미구현 (ksj-n02 | odpt-tokyometro)`);
  if (!sha || !values['update-lock']) return;
  entry.sha256 = sha;
  entry.retrievedAt = new Date().toISOString().slice(0, 10);
  if (values.source === N02_SOURCE) entry.url = N02_URL;
  writeFileSync(lock.path, `${JSON.stringify(lock.file, null, 2)}\n`);
  flog.info(`lock ${values.source} sha256 갱신`);
}

/** `rail --build-id <id>` — 철도 전역 빌드(global/rail.bin) + rail-report.json + 시간표(global/timetables). 컨테이너 전용(GDAL). */
export async function rail(ctx: RailCtx, args: string[], buildIdOf: () => string): Promise<void> {
  const { values } = parseArgs({ args, options: { 'build-id': { type: 'string' } } });
  const buildId = values['build-id'] ?? buildIdOf();
  const buildDir = join(ctx.repoRoot, 'data/build', buildId);
  const rlog = ctx.log.child('rail');
  const { network, report } = await buildRailGlobal({
    repoRoot: ctx.repoRoot,
    buildDir,
    normalizedDir: join(ctx.repoRoot, 'data/normalized'),
    derivedDir: join(ctx.repoRoot, 'data/derived'),
    log: rlog,
  });
  writeFileSync(
    join(buildDir, 'rail-report.json'),
    `${JSON.stringify(report, null, 1)}
`,
  );
  buildTimetables({ repoRoot: ctx.repoRoot, buildDir, network, log: ctx.log.child('timetables') });
  for (const t of report)
    rlog.info(
      `${t.id}: ${t.lengthM} m (tunnel ${t.tunnelM} m, bridge ${t.bridgeM} m), N02 ${t.n02MeanM} m, stops ${t.stops.map((s) => `${s.station}@${s.s}${s.side} Δ${s.centroidDiffM}`).join(' ')}`,
    );
}

/** `timetables --build-id <id> [--gtfs <lineId>=<dir|zip>]` — 기존 빌드의 global/rail.bin으로 시간표만 다시 컴파일(컨테이너 불필요). */
export async function timetables(ctx: RailCtx, args: string[], buildIdOf: () => string): Promise<void> {
  const { values } = parseArgs({ args, options: { 'build-id': { type: 'string' }, gtfs: { type: 'string' } } });
  const buildId = values['build-id'] ?? buildIdOf();
  const buildDir = join(ctx.repoRoot, 'data/build', buildId);
  const raw = await gunzip(new Uint8Array(readFileSync(join(buildDir, 'global/rail.bin'))));
  const net = raw.ok ? parseRail(raw.value) : undefined;
  if (!net?.ok) throw new Error(`timetables: ${buildId}/global/rail.bin 읽기 실패`);
  const report = buildTimetables({
    repoRoot: ctx.repoRoot,
    buildDir,
    network: net.value,
    log: ctx.log.child('timetables'),
    ...(values.gtfs ? { gtfsSource: Object.fromEntries([values.gtfs.split('=', 2) as [string, string]]) } : {}),
  });
  const bad = report.filter((r) => r.violations.length > 0 || r.outsideServiceDay.length > 0);
  if (bad.length > 0) throw new Error(`timetables: 간격·운행일 위반 ${bad.map((r) => r.line).join(', ')}`);
}
