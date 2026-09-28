// fixture 단계: tests/fixtures/{world-mini, plateau-mini} 생성(M01-T05 빌드 파이프라인 재사용) + plateau-mini 1셀 빌드 스냅샷. see docs/14-testing-perf.md §1, docs/modules/pipeline.md
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, type Logger, packCellKey } from '@sanpo/core';
import { cellBoundsWF } from '@sanpo/geo';
import { gunzip, readTkc, SECTION_REGISTRY, type SectionType, sectionHash } from '@sanpo/tile-format';
import { createPlateauReader } from '../readers/plateau/index.ts';
import { buildArea } from './build/assemble.ts';
import { DEM_MARGIN, readDemWindow, readDemWindowFiles, writeDemWindowFiles } from './build/dem-window.ts';
import type { AreaDef } from './build/manifest.ts';
import { extractPlateauMini } from './fixture-plateau.ts';
import { normalizePlateau } from './normalize-plateau.ts';
import { validateBuild, writeReport } from './validate.ts';

/** world-mini = 스크램블 교차로(L0_-1_0, 스폰) + 스크램블 스퀘어(L0_0_0)를 포함하는 2×2. */
export const WORLD_MINI_AREA: AreaDef = { id: 'world-mini', l0: { minIx: -1, maxIx: 0, minIz: -1, maxIz: 0 } };
/** plateau-mini 셀(스크램블 교차로). */
export const PLATEAU_MINI_CELL: CellKey = packCellKey(0, -1, 0);
export const PLATEAU_MINI_SOURCE = 'plateau-shibuya';
/** plateau-mini 스냅샷 빌드 ID(날짜·git과 무관하게 고정 → 스냅샷 안정). */
export const PLATEAU_MINI_BUILD_ID = '20260101-0000000-00000000';
const DEM_BASE = 'gsi-dem/dem_L0_-1_0';
const I18N: Record<string, { title: string; en: string; ko: string }> = {
  'plateau-shibuya': {
    title: 'Project PLATEAU 3D都市モデル（渋谷区）2025',
    en: 'Source: MLIT Project PLATEAU 3D city model (Shibuya-ku), processed',
    ko: '출처: 국토교통성 Project PLATEAU 3D 도시모델(시부야구)을 가공하여 작성',
  },
  'gsi-dem': {
    title: '基盤地図情報 数値標高モデル（DEM1A/5A）',
    en: 'Source: GSI Fundamental Geospatial Data, Digital Elevation Model, processed',
    ko: '출처: 국토지리원 기반지도정보 수치표고모델을 가공하여 작성',
  },
};

export interface LockSource {
  id: string;
  url: string;
  license: string;
  attribution: string;
}

/** schemas/attribution.schema.json 형식(픽스처 폴더 안에 함께 커밋). */
export function fixtureAttribution(lock: readonly LockSource[], ids: readonly string[], files: string[]) {
  const entries = ids.map((id) => {
    const s = lock.find((l) => l.id === id);
    const t = I18N[id];
    if (!s || !t) throw new Error(`fixtureAttribution: ${id} missing in lock or I18N`);
    const url = s.url.startsWith('http') ? s.url.split(' ')[0] : undefined;
    return {
      id,
      kind: 'data',
      title: t.title,
      ...(url ? { url } : {}),
      license: s.license,
      attribution: { ja: s.attribution, en: t.en, ko: t.ko },
      files,
      modified: true,
    };
  });
  return { entries };
}

function writeJson(path: string, v: unknown): void {
  writeFileSync(path, `${JSON.stringify(v, null, 2)}\n`);
}

export interface FixtureInput {
  repoRoot: string;
  buildId: string;
  lock: readonly LockSource[];
  log: Logger;
}

/** world-mini: buildArea(2×2) → validate(0 오류 필수) → tests/fixtures/world-mini로 복사 + ATTRIBUTION.json. */
export async function buildWorldMini(input: FixtureInput): Promise<string> {
  const { repoRoot, log } = input;
  const buildDir = join(repoRoot, 'data/build/fixtures/world-mini');
  const { minIx, maxIx, minIz, maxIz } = WORLD_MINI_AREA.l0;
  const cells: CellKey[] = [];
  for (let iz = minIz; iz <= maxIz; iz++) for (let ix = minIx; ix <= maxIx; ix++) cells.push(packCellKey(0, ix, iz));
  await buildArea({
    area: WORLD_MINI_AREA,
    cells,
    buildId: input.buildId,
    normalizedDir: join(repoRoot, 'data/normalized'),
    outDir: buildDir,
    plateauSources: [PLATEAU_MINI_SOURCE],
    log: log.child('world-mini'),
  });
  const report = await validateBuild(buildDir, join(repoRoot, 'schemas'), new Set(input.lock.map((l) => l.id)));
  writeReport(buildDir, report);
  if (report.errors.length > 0) throw new Error(`world-mini validate: ${report.errors.join('; ')}`);
  const out = join(repoRoot, 'tests/fixtures/world-mini');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of ['world.json', 'cells.idx', 'L0']) cpSync(join(buildDir, f), join(out, f), { recursive: true });
  const attribution = fixtureAttribution(
    input.lock,
    ['gsi-dem', PLATEAU_MINI_SOURCE],
    ['tests/fixtures/world-mini/**'],
  );
  writeJson(join(out, 'ATTRIBUTION.json'), attribution);
  return readFileSync(join(buildDir, 'report.md'), 'utf8');
}

/** plateau-mini: 원천 CityGML 발췌 + DEM 창 + 1셀 빌드 스냅샷(expected.json). GDAL 필요(컨테이너). */
export async function buildPlateauMini(input: FixtureInput): Promise<PlateauMiniSnapshot> {
  const { repoRoot, log } = input;
  const out = join(repoRoot, 'tests/fixtures/plateau-mini');
  for (const d of [PLATEAU_MINI_SOURCE, 'gsi-dem']) rmSync(join(out, d), { recursive: true, force: true });
  mkdirSync(join(out, 'gsi-dem'), { recursive: true });
  const picked = extractPlateauMini({
    sourceId: PLATEAU_MINI_SOURCE,
    rawRoot: join(repoRoot, 'data/raw', PLATEAU_MINI_SOURCE, 'extracted'),
    cell: PLATEAU_MINI_CELL,
    outRoot: join(out, PLATEAU_MINI_SOURCE),
    buildings: 5,
    roads: 3,
    maxMemberBytes: 60_000,
  });
  log.info(`plateau-mini: ${picked.files.join(', ')} ← ${picked.ids.join(', ')}`);
  const dem = await readDemWindow(
    join(repoRoot, 'data/normalized/terrain'),
    cellBoundsWF(PLATEAU_MINI_CELL),
    DEM_MARGIN,
    join(repoRoot, 'data/build/fixtures/.work'),
  );
  const note = 'dem_1m.tif(EPSG:6677 1 m, DEM1A+5A) window: cell L0_-1_0 ± 1 m, row = z (north→south), col = x';
  writeDemWindowFiles(join(out, DEM_BASE), dem, 'gsi-dem', note);
  writeJson(
    join(out, 'ATTRIBUTION.json'),
    fixtureAttribution(input.lock, ['gsi-dem', PLATEAU_MINI_SOURCE], ['tests/fixtures/plateau-mini/**']),
  );
  const snap = await plateauMiniSnapshot(out, join(repoRoot, 'data/build/fixtures/plateau-mini'), log);
  writeJson(join(out, 'expected.json'), snap);
  return snap;
}

export interface PlateauMiniSnapshot {
  buildings: number;
  roadPieces: number;
  /** 섹션 type → XXH64(glb = 저장 바이트, gzip 코덱 = 해제한 바이트 — zlib 버전 무관). */
  sections: Record<string, string>;
}

/** plateau-mini 원천 → normalize → 1셀 build → 섹션 해시. 단위 테스트와 fixture 단계가 같은 함수를 쓴다. */
export async function plateauMiniSnapshot(
  fixtureDir: string,
  workDir: string,
  log: Logger,
): Promise<PlateauMiniSnapshot> {
  rmSync(workDir, { recursive: true, force: true });
  const norm = await normalizePlateau({
    sources: [{ sourceId: PLATEAU_MINI_SOURCE, rawRoot: join(fixtureDir, PLATEAU_MINI_SOURCE) }],
    cells: [PLATEAU_MINI_CELL],
    outDir: join(workDir, 'normalized'),
    reader: createPlateauReader('citygml-sax'),
    log,
  });
  const stats = await buildArea({
    area: { id: 'plateau-mini', l0: { minIx: -1, maxIx: -1, minIz: 0, maxIz: 0 } },
    cells: [PLATEAU_MINI_CELL],
    buildId: PLATEAU_MINI_BUILD_ID,
    normalizedDir: join(workDir, 'normalized'),
    outDir: join(workDir, 'build'),
    plateauSources: [PLATEAU_MINI_SOURCE],
    log,
    dem: readDemWindowFiles(join(fixtureDir, DEM_BASE)),
  });
  const r = readTkc(new Uint8Array(readFileSync(join(workDir, 'build/L0/-1/0.tkc'))));
  if (!r.ok) throw new Error(`plateauMiniSnapshot: ${r.error.message}`);
  const sections: Record<string, string> = {};
  for (const e of r.value.header.sections) {
    const data = r.value.section(e.type as SectionType) ?? new Uint8Array(0);
    const gz = SECTION_REGISTRY[e.type as SectionType]?.codec.endsWith('gzip');
    const plain = gz ? await gunzip(data) : { ok: true as const, value: data };
    sections[e.type] = plain.ok ? sectionHash(plain.value) : 'corrupt';
  }
  return { buildings: stats[0]?.buildings ?? 0, roadPieces: norm.roadPieces, sections };
}

export function hasPlateauRaw(repoRoot: string): boolean {
  return existsSync(join(repoRoot, 'data/raw', PLATEAU_MINI_SOURCE, 'extracted/udx'));
}
