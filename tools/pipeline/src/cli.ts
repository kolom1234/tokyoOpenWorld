// 데이터 빌드 CLI 엔트리(`pnpm pipeline <stage> …`). see docs/04-data-pipeline.md §2, docs/modules/pipeline.md
// 구현된 단계: normalize(--layer plateau: 건물·도로, terrain: dem_1m.tif). TODO(M01-T04~): fetch | derive | build | hlod | validate | publish.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { type CellKey, createLogger, packCellKey } from '@sanpo/core';
import { type CellBoundsWF, cellBoundsWF } from '@sanpo/geo';
import { createPlateauReader } from './readers/plateau/index.ts';
import { normalizePlateau } from './stages/normalize-plateau.ts';
import { hasDemSources, normalizeTerrain, writeTerrainMeta } from './stages/normalize-terrain.ts';

const run = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
/** 원거리 HLOD 전용 PLATEAU 소스(normalize 대상 아님). */
const HLOD_ONLY_SOURCES = new Set(['plateau-tokyo23']);
const log = createLogger().child('pipeline');

interface AreaDef {
  id: string;
  l0: { minIx: number; maxIx: number; minIz: number; maxIz: number };
}

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

function plateauSources(): string[] {
  const lock = JSON.parse(readFileSync(join(REPO_ROOT, 'data/sources.lock.json'), 'utf8')) as {
    sources: { id: string }[];
  };
  return lock.sources.map((s) => s.id).filter((id) => id.startsWith('plateau-') && !HLOD_ONLY_SOURCES.has(id));
}

/** 셀 목록의 합집합 WF 경계(지형 격자 범위). */
function boundsOfCells(cells: readonly CellKey[]): CellBoundsWF {
  const bs = cells.map(cellBoundsWF);
  return {
    minX: Math.min(...bs.map((b) => b.minX)),
    minZ: Math.min(...bs.map((b) => b.minZ)),
    maxX: Math.max(...bs.map((b) => b.maxX)),
    maxZ: Math.max(...bs.map((b) => b.maxZ)),
  };
}

async function normalizePlateauLayer(cells: CellKey[], source: string | undefined, reader: string): Promise<void> {
  const readerName = reader === 'nusamai' ? 'nusamai' : 'citygml-sax';
  for (const sourceId of source ? [source] : plateauSources()) {
    const res = await normalizePlateau({
      sourceId,
      rawRoot: join(REPO_ROOT, 'data/raw', sourceId, 'extracted'),
      cells,
      outDir: join(REPO_ROOT, 'data/normalized'),
      reader: createPlateauReader(readerName),
      log: log.child(sourceId),
    });
    log.info(
      `${sourceId}: ${res.files.length} files, ${res.features} features → ${res.buildings} buildings, ` +
        `${res.roadPieces} road pieces, ${res.written.length} cell files`,
    );
  }
}

async function normalizeTerrainLayer(cells: CellKey[]): Promise<void> {
  const rawDir = join(REPO_ROOT, 'data/raw/gsi-dem');
  if (!hasDemSources(rawDir)) throw new Error(`no DEM zips in ${rawDir}`);
  const res = await normalizeTerrain({
    rawDir,
    outDir: join(REPO_ROOT, 'data/normalized/terrain'),
    boundsWF: boundsOfCells(cells),
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
  const area = JSON.parse(readFileSync(join(REPO_ROOT, `data/areas/${values.area}.json`), 'utf8')) as AreaDef;
  const cells = values.cells ? values.cells.split(',').map(parseCellId) : areaCells(area);
  const layer = values.layer;
  if (layer === 'all' || layer === 'plateau') await normalizePlateauLayer(cells, values.source, values.reader);
  if (layer === 'all' || layer === 'terrain') await normalizeTerrainLayer(cells);
}

async function main(argv: string[]): Promise<void> {
  const [stage, ...rest] = argv;
  if (stage === 'normalize') return normalize(rest);
  log.error(`unknown or unimplemented stage "${stage ?? ''}". implemented: normalize`);
  process.exitCode = 2;
}

await main(process.argv.slice(2));
