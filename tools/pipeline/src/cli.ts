// 데이터 빌드 CLI 엔트리(`pnpm pipeline <stage> …`). see docs/04-data-pipeline.md §2, docs/modules/pipeline.md
// 구현된 단계: normalize(PLATEAU 건물·도로). TODO(M01-T03~): fetch | derive | build | hlod | validate | publish.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type CellKey, createLogger, packCellKey } from '@sanpo/core';
import { createPlateauReader } from './readers/plateau/index.ts';
import { normalizePlateau } from './stages/normalize-plateau.ts';

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

async function normalize(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
      cells: { type: 'string' },
      source: { type: 'string' },
      reader: { type: 'string', default: 'citygml-sax' },
    },
  });
  const area = JSON.parse(readFileSync(join(REPO_ROOT, `data/areas/${values.area}.json`), 'utf8')) as AreaDef;
  const cells = values.cells ? values.cells.split(',').map(parseCellId) : areaCells(area);
  const readerName = values.reader === 'nusamai' ? 'nusamai' : 'citygml-sax';
  for (const sourceId of values.source ? [values.source] : plateauSources()) {
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

async function main(argv: string[]): Promise<void> {
  const [stage, ...rest] = argv;
  if (stage === 'normalize') return normalize(rest);
  log.error(`unknown or unimplemented stage "${stage ?? ''}". implemented: normalize`);
  process.exitCode = 2;
}

await main(process.argv.slice(2));
