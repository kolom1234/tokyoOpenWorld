// 데이터 빌드 CLI 엔트리(`pnpm pipeline <stage> …`). see docs/04-data-pipeline.md §2, docs/modules/pipeline.md
// 구현된 단계: normalize(--layer plateau: 건물·도로, terrain: dem_1m.tif), build(L0: 지형·건물·meta → TKC),
// hlod-prep(23구 원경 건물·원경 DEM 타일), hlod(L1–L3 → TKC, cells.idx 병합), materials(KTX2 배열)·avatar(Quaternius → 게임 GLB)·trees(수종 에셋 — cli-assets.ts), validate, publish·gc(R2 + KV).
// TODO: fetch | derive.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { type CellKey, createLogger, packCellKey } from '@sanpo/core';
import { FORMAT_VERSION } from '@sanpo/tile-format';
import * as assetStages from './cli-assets.ts';
import { createPlateauReader } from './readers/plateau/index.ts';
import { buildArea, unionBounds } from './stages/build/assemble.ts';
import { type AreaDef, makeBuildId } from './stages/build/manifest.ts';
import { readOverrides } from './stages/build/overrides/index.ts';
import { readCatalog } from './stages/derive/props/context.ts';
import { buildPlateauMini, buildWorldMini, type LockSource } from './stages/fixture.ts';
import { fetchDemTiles, resampleFarDem, writeFarDem } from './stages/hlod/dem-far.ts';
import { runHlod } from './stages/hlod/run.ts';
import { extractTokyo23 } from './stages/hlod/tokyo23-lod1.ts';
import { normalizeOsmFromLock } from './stages/normalize-osm.ts';
import { normalizePlateau } from './stages/normalize-plateau.ts';
import { hasDemSources, normalizeTerrain, writeTerrainMeta } from './stages/normalize-terrain.ts';
import { buildFiles, gcBuilds, publishBuild, verifyViaWorker } from './stages/publish/publish.ts';
import { createClients, type PublishEnv, readTargets } from './stages/publish/targets.ts';
import { reportMarkdown, validateBuild, writeReport } from './stages/validate.ts';
import { checkRoadGaps, GAP_LIMIT_M } from './stages/validate-roads.ts';

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
  if (layer === 'all' || layer === 'osm') await normalizeOsmLayer(cells);
}

/** OSM 간토 PBF → data/normalized/osm(컨테이너 전용, osmium). */
async function normalizeOsmLayer(cells: CellKey[]): Promise<void> {
  await normalizeOsmFromLock(REPO_ROOT, lockSources(), cells, log.child('osm'));
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
    props: readCatalog(REPO_ROOT),
    overrides: readOverrides(REPO_ROOT),
  });
  const bytes = stats.reduce((a, s) => a + s.bytes, 0);
  log.info(`build ${buildId}: ${stats.length} cells, ${bytes} B in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

async function validate(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { 'build-id': { type: 'string' } } });
  const buildId = values['build-id'] ?? makeBuildId(REPO_ROOT);
  const dir = join(REPO_ROOT, 'data/build', buildId);
  const report = await validateBuild(dir, join(REPO_ROOT, 'schemas'), new Set(lockSourceIds()));
  // M05-T01 수락: 무작위 교차로 50곳 보도 가장자리·연석 vs 지형 간극(< 2 cm).
  const gaps = await checkRoadGaps(dir, join(REPO_ROOT, 'data/normalized'));
  log.info(`road gaps ${JSON.stringify(gaps)}`);
  if (gaps.over > 0 || gaps.curbUncovered > 0)
    report.errors.push(
      `roads: ${gaps.over} edge samples ≥ ${GAP_LIMIT_M} m, ${gaps.curbUncovered} curb samples uncovered`,
    );
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

const WRANGLER_JSONC = join(REPO_ROOT, 'apps/worker/wrangler.jsonc');

function targetOf(env: string | undefined) {
  const t = readTargets(WRANGLER_JSONC)[env as PublishEnv];
  if (!t) throw new Error(`--env ${env}: dev | prod`);
  return t;
}

/** R2 퍼블리시(docs/04 §4.7): --env dev|prod, --set-current(KV 포인터), --verify-url(배포된 Worker /world로 HEAD 검증), --uploader s3|api. 호스트에서 실행(토큰 = 환경 변수). */
async function publish(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      'build-id': { type: 'string' },
      env: { type: 'string', default: 'dev' },
      'set-current': { type: 'boolean', default: false },
      'verify-url': { type: 'string' },
      uploader: { type: 'string' },
      concurrency: { type: 'string', default: '16' },
      'verify-only': { type: 'boolean', default: false },
    },
  });
  const buildId = values['build-id'] ?? makeBuildId(REPO_ROOT);
  const target = targetOf(values.env);
  const plog = log.child('publish');
  if (values['verify-only']) {
    const url = values['verify-url'];
    if (!url) throw new Error('--verify-only needs --verify-url');
    const dir = join(REPO_ROOT, 'data/build', buildId);
    const bad = await verifyViaWorker(dir, buildId, url, Number(values.concurrency));
    plog.info(
      `verify ${buildId} via ${url}: ${buildFiles(dir).length} files, ${bad.length} mismatched ${bad.slice(0, 5).join(', ')}`,
    );
    if (bad.length > 0) process.exitCode = 1;
    return;
  }
  const { uploader, kv } = await createClients(target, process.env, plog, values.uploader as 's3' | 'api' | undefined);
  const r = await publishBuild({
    buildDir: join(REPO_ROOT, 'data/build', buildId),
    buildId,
    formatVersion: FORMAT_VERSION,
    uploader,
    kv,
    log: plog,
    concurrency: Number(values.concurrency),
    setCurrent: values['set-current'],
    ...(values['verify-url'] ? { verifyBaseUrl: values['verify-url'] } : {}),
  });
  plog.info(
    `published ${buildId} → ${target.bucket}: ${r.files.length} files, ${(r.bytes / 1e6).toFixed(1)} MB in ${(r.uploadMs / 1000).toFixed(1)} s, ` +
      `verified ${r.verified}, current ${r.setCurrent ? 'set' : 'unchanged'}`,
  );
}

/** 오래된 빌드 삭제(현재 + 직전 1개 + 7일 이내 유지). 기본은 목록만, --apply로 삭제. */
async function gc(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { env: { type: 'string', default: 'dev' }, apply: { type: 'boolean', default: false } },
  });
  const target = targetOf(values.env);
  const glog = log.child('gc');
  const { uploader, kv } = await createClients(target, process.env, glog);
  const removed = await gcBuilds({ uploader, kv, formatVersion: FORMAT_VERSION, log: glog, dryRun: !values.apply });
  glog.info(`gc ${target.env}: ${removed.length} builds ${values.apply ? 'deleted' : 'would be deleted (--apply)'}`);
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

/** 플레이어 아바타 GLB(M05 결정 2, ADR-0048): data/raw Quaternius zip(sha256 lock) → apps/game/src/assets. 호스트 Node로 실행 가능. */
const assets = { repoRoot: REPO_ROOT, log, lockSources };

const STAGES: Record<string, (args: string[]) => Promise<void>> = {
  normalize,
  build,
  'hlod-prep': hlodPrep,
  hlod,
  materials: (args) => assetStages.materials(assets, args),
  avatar: () => assetStages.avatar(assets),
  trees: () => assetStages.trees(assets),
  signage: () => assetStages.signage(assets),
  validate,
  publish,
  gc,
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
