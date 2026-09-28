// 데이터 빌드 CLI 엔트리(`pnpm pipeline <stage> …`). see docs/04-data-pipeline.md §2, docs/modules/pipeline.md
// 구현된 단계: normalize(--layer plateau: 건물·도로, terrain: dem_1m.tif), build(L0: 지형·건물·meta → TKC),
// hlod-prep(23구 원경 건물·원경 DEM 타일), hlod(L1–L3 → TKC, cells.idx 병합), validate.
// TODO: fetch | derive | publish.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { type CellKey, createLogger, packCellKey } from '@sanpo/core';
import { createPlateauReader } from './readers/plateau/index.ts';
import { buildArea, unionBounds } from './stages/build/assemble.ts';
import { type AreaDef, makeBuildId } from './stages/build/manifest.ts';
import { buildPlateauMini, buildWorldMini, type LockSource } from './stages/fixture.ts';
import { fetchDemTiles, resampleFarDem, writeFarDem } from './stages/hlod/dem-far.ts';
import { runHlod } from './stages/hlod/run.ts';
import { extractTokyo23 } from './stages/hlod/tokyo23-lod1.ts';
import { normalizePlateau } from './stages/normalize-plateau.ts';
import { hasDemSources, normalizeTerrain, writeTerrainMeta } from './stages/normalize-terrain.ts';
import { reportMarkdown, validateBuild, writeReport } from './stages/validate.ts';

const run = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
/** 원거리 HLOD 전용 PLATEAU 소스(normalize 대상 아님). */
const HLOD_ONLY_SOURCES = new Set(['plateau-tokyo23']);
const log = createLogger().child('pipeline');

function parseCellId(s: string): CellKey {
  const m = /^L0_(-?\d+)_(-?\d+)$/.exec(s.trim());
  if (!m) throw new Error(`--cells: "${s}" is not an L0 cell id (e.g. L0_-1_0)`);
  return packCellKey(0, Number(m[1]), Number(m[2]));
}

function areaCells(area: AreaDef): CellKey[] {
  const out: CellKey[] = [];
  for (let ix = area.l0.minIx; ix <= area.l0.maxIx; ix++) {
    for (let iz = area.l0.minIz; iz <= area.l0.maxIz; iz++) out.push(packCellKey(0, ix, iz));
  }
  return out;
}

function lockSources(): LockSource[] {
  return (JSON.parse(readFileSync(join(REPO_ROOT, 'data/sources.lock.json'), 'utf8')) as { sources: LockSource[] })
    .sources;
}

function lockSourceIds(): string[] {
  return lockSources().map((s) => s.id);
}

function plateauSources(): string[] {
  return lockSourceIds().filter((id) => id.startsWith('plateau-') && !HLOD_ONLY_SOURCES.has(id));
}

function readArea(id: string): AreaDef {
  return JSON.parse(readFileSync(join(REPO_ROOT, `data/areas/${id}.json`), 'utf8')) as AreaDef;
}

async function normalizePlateauLayer(cells: CellKey[], source: string | undefined, reader: string): Promise<void> {
  const readerName = reader === 'nusamai' ? 'nusamai' : 'citygml-sax';
  const ids = source ? [source] : plateauSources();
  const res = await normalizePlateau({
    sources: ids.map((sourceId) => ({ sourceId, rawRoot: join(REPO_ROOT, 'data/raw', sourceId, 'extracted') })),
    cells,
    outDir: join(REPO_ROOT, 'data/normalized'),
    reader: createPlateauReader(readerName),
    log: log.child('plateau'),
  });
  const perSource = ids.map((id) => `${id} ${res.files.filter((f) => f.sourceId === id).length}`).join(', ');
  log.info(
    `plateau: files (${perSource}), ${res.features} features → ${res.buildings} buildings, ` +
      `${res.roadPieces} road pieces, ${res.written.length} cell files`,
  );
}

async function normalizeTerrainLayer(cells: CellKey[]): Promise<void> {
  const rawDir = join(REPO_ROOT, 'data/raw/gsi-dem');
  if (!hasDemSources(rawDir)) throw new Error(`no DEM zips in ${rawDir}`);
  const res = await normalizeTerrain({
    rawDir,
    outDir: join(REPO_ROOT, 'data/normalized/terrain'),
    boundsWF: unionBounds(cells),
    log: log.child('terrain'),
  });
  const { stdout } = await run('gdalinfo', ['--version']);
  const meta = writeTerrainMeta(res, stdout.trim());
  const f = res.fill;
  log.info(
    `terrain: ${res.grid.width}×${res.grid.height} px, 1A missing ${f.primaryMissing} → 5A ${f.filledBySecondary}, ` +
      `interpolated ${f.interpolated} → ${res.tif} (${meta})`,
  );
}

async function normalize(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
      cells: { type: 'string' },
      layer: { type: 'string', default: 'all' },
      source: { type: 'string' },
      reader: { type: 'string', default: 'citygml-sax' },
    },
  });
  const area = readArea(values.area);
  const cells = values.cells ? values.cells.split(',').map(parseCellId) : areaCells(area);
  const layer = values.layer;
  if (layer === 'all' || layer === 'plateau') await normalizePlateauLayer(cells, values.source, values.reader);
  if (layer === 'all' || layer === 'terrain') await normalizeTerrainLayer(cells);
}

async function build(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
      cells: { type: 'string' },
      'build-id': { type: 'string' },
    },
  });
  const area = readArea(values.area);
  const cells = values.cells ? values.cells.split(',').map(parseCellId) : areaCells(area);
  const buildId = values['build-id'] ?? makeBuildId(REPO_ROOT);
  const outDir = join(REPO_ROOT, 'data/build', buildId);
  const t0 = performance.now();
  const stats = await buildArea({
    area,
    cells,
    buildId,
    normalizedDir: join(REPO_ROOT, 'data/normalized'),
    outDir,
    plateauSources: plateauSources(),
    log: log.child('build'),
  });
  const bytes = stats.reduce((a, s) => a + s.bytes, 0);
  log.info(`build ${buildId}: ${stats.length} cells, ${bytes} B in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

async function validate(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { 'build-id': { type: 'string' } } });
  const buildId = values['build-id'] ?? makeBuildId(REPO_ROOT);
  const dir = join(REPO_ROOT, 'data/build', buildId);
  const report = await validateBuild(dir, join(REPO_ROOT, 'schemas'), new Set(lockSourceIds()));
  writeReport(dir, report);
  process.stdout.write(reportMarkdown(report));
  if (report.errors.length > 0) {
    log.error(`validate ${buildId}: ${report.errors.length} errors`);
    process.exitCode = 1;
  }
}

function hlodExtentOf(area: AreaDef): NonNullable<AreaDef['hlodExtentWF']> {
  if (!area.hlodExtentWF) throw new Error(`area ${area.id}: hlodExtentWF missing`);
  return area.hlodExtentWF;
}

/** HLOD 준비(원천 → data/derived): --step buildings(23구 zip → 원경 건물) | dem(標高タイル → 원경 격자) | all. */
async function hlodPrep(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
      step: { type: 'string', default: 'all' },
      workers: { type: 'string' },
    },
  });
  const area = readArea(values.area);
  const extent = hlodExtentOf(area);
  const derivedDir = join(REPO_ROOT, 'data/derived');
  if (values.step === 'all' || values.step === 'dem') {
    const rawDir = join(REPO_ROOT, 'data/raw/gsi-dem-tiles');
    const manifestSha = await fetchDemTiles(rawDir, extent, log.child('dem-tiles'));
    const t0 = performance.now();
    writeFarDem(join(derivedDir, 'terrain-far'), resampleFarDem(rawDir, extent));
    log.info(`far dem: manifest sha256 ${manifestSha}, resample ${Math.round(performance.now() - t0)} ms`);
  }
  if (values.step === 'all' || values.step === 'buildings') {
    const zip = join(REPO_ROOT, 'data/raw/plateau-tokyo23/13100_tokyo23-ku_2020_citygml_4_2_op.zip');
    const t0 = performance.now();
    const r = await extractTokyo23({
      zipPath: zip,
      sourceId: 'plateau-tokyo23',
      extent,
      derivedDir,
      log: log.child('tokyo23'),
      ...(values.workers ? { workers: Number(values.workers) } : {}),
    });
    log.info(
      `far buildings: ${r.members} members → ${r.buildings} bldgs in ${r.cells} L2 cells, ${Math.round((performance.now() - t0) / 1000)} s`,
    );
  }
}

/** HLOD 빌드(L1–L3 → data/build/<buildId>, cells.idx 병합). 먼저 build(L0)·hlod-prep. GDAL 필요(L1 dem_1m) → 컨테이너. */
async function hlod(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
      'build-id': { type: 'string' },
      levels: { type: 'string', default: '1,2,3' },
    },
  });
  const buildId = values['build-id'] ?? makeBuildId(REPO_ROOT);
  const levels = values.levels.split(',').map((v) => Number(v) as 1 | 2 | 3);
  const t0 = performance.now();
  const stats = await runHlod({
    area: readArea(values.area),
    buildId,
    normalizedDir: join(REPO_ROOT, 'data/normalized'),
    derivedDir: join(REPO_ROOT, 'data/derived'),
    outDir: join(REPO_ROOT, 'data/build', buildId),
    levels,
    log: log.child('hlod'),
  });
  for (const lv of [1, 2, 3]) {
    const s = stats.filter((c) => c.id.startsWith(`L${lv}_`));
    if (s.length === 0) continue;
    const max = s.reduce((a, c) => (c.bytes > a.bytes ? c : a));
    log.info(
      `L${lv}: ${s.length} cells, max ${max.bytes} B (${max.id}), over budget ${s.filter((c) => c.overBudget).length}`,
    );
  }
  log.info(`hlod ${buildId}: ${stats.length} cells in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

/** tests/fixtures 재생성(M01-T07). 원천·정규화 데이터와 GDAL이 필요 → 컨테이너 전용. */
async function fixture(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { only: { type: 'string' }, 'build-id': { type: 'string' } } });
  const input = {
    repoRoot: REPO_ROOT,
    buildId: values['build-id'] ?? makeBuildId(REPO_ROOT),
    lock: lockSources(),
    log: log.child('fixture'),
  };
  if (values.only !== 'plateau-mini') process.stdout.write(await buildWorldMini(input));
  if (values.only !== 'world-mini') log.info(`plateau-mini snapshot ${JSON.stringify(await buildPlateauMini(input))}`);
}

const STAGES: Record<string, (args: string[]) => Promise<void>> = {
  normalize,
  build,
  'hlod-prep': hlodPrep,
  hlod,
  validate,
  fixture,
};

async function main(argv: string[]): Promise<void> {
  const [stage, ...rest] = argv;
  const handler = stage ? STAGES[stage] : undefined;
  if (handler) return handler(rest);
  log.error(`unknown or unimplemented stage "${stage ?? ''}". implemented: ${Object.keys(STAGES).join(', ')}`);
  process.exitCode = 2;
}

await main(process.argv.slice(2));
