// normalize 단계(지형): GSI DEM1A(주) + DEM5A(결측 채움) → GDAL 재투영(EPSG:6677, 1 m) → 잔여 결측 보간 → data/normalized/terrain/dem_1m.tif. see docs/04-data-pipeline.md §4.2(terrain), §6
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Logger } from '@sanpo/core';
import { type CellBoundsWF, jisMesh3CodesInBBox, lonLatBBoxOfWF, wfToPrj } from '@sanpo/geo';
import {
  mergeWithFallback,
  type PrjGrid,
  readFloat32,
  targetExtentOf,
  valueStats,
  writeGridVrt,
} from '../lib/raster.ts';
import { DEM_NODATA, listDemZip, meshOfMember, parseFgdDem, readZipMember, writeTileVrt } from '../readers/dem.ts';

const run = promisify(execFile);

/** 주 → 보조 순. 1A = 1 m 항공레이저, 5A = 5 m 항공레이저. */
const GRADES = [
  { grade: 'DEM1A', resampling: 'bilinear' },
  { grade: 'DEM5A', resampling: 'cubic' }, // docs/04 §4.2: 5 m는 bicubic 재표본
] as const;
/** 잔여 결측 역거리 보간 탐색 반경(픽셀 = m). 1A·5A 모두 없는 곳은 드물고 좁다고 가정, 넘으면 실패. */
const FILL_MAX_DISTANCE_PX = 200;
const GTIFF_OPTIONS = ['COMPRESS=DEFLATE', 'PREDICTOR=3', 'TILED=YES', 'BLOCKXSIZE=256', 'BLOCKYSIZE=256'];

export interface NormalizeTerrainInput {
  /** `data/raw/gsi-dem` (FG-GML-<2차메시>-<grade>-<date>.zip). */
  rawDir: string;
  /** `data/normalized/terrain`. 작업 파일은 그 아래 `work/`(실행마다 재생성). */
  outDir: string;
  boundsWF: CellBoundsWF;
  log: Logger;
}

export interface GradeReport {
  grade: string;
  zips: string[];
  tiles: string[];
  missingTiles: string[];
  pointTypes: Record<string, number>;
}

export interface NormalizeTerrainResult {
  tif: string;
  grid: PrjGrid;
  grades: GradeReport[];
  fill: ReturnType<typeof mergeWithFallback>['stats'] & { interpolated: number };
  heightStats: ReturnType<typeof valueStats>;
}

/** WF 경계(정점 포함: min..max 양끝) → PRJ 정수 격자. */
export function gridOfBounds(b: CellBoundsWF): PrjGrid {
  const nw = wfToPrj({ x: b.minX, y: 0, z: b.minZ });
  const se = wfToPrj({ x: b.maxX, y: 0, z: b.maxZ });
  const eMin = Math.round(nw.easting);
  const nMax = Math.round(nw.northing);
  return {
    epsg: 'EPSG:6677',
    eMin,
    nMax,
    width: Math.round(se.easting) - eMin + 1,
    height: nMax - Math.round(se.northing) + 1,
  };
}

/** 한 등급의 필요한 3차 메시 타일을 VRT로 풀고 보고서를 만든다. */
async function extractGrade(
  rawDir: string,
  grade: string,
  meshes: Set<string>,
  workDir: string,
): Promise<{ vrts: string[]; report: GradeReport }> {
  const zipRe = new RegExp(`^FG-GML-(\\d{6})-${grade}-\\d{8}\\.zip$`);
  const zips = readdirSync(rawDir)
    .filter((n) => zipRe.test(n) && [...meshes].some((m) => m.startsWith(zipRe.exec(n)?.[1] ?? '-')))
    .sort();
  const report: GradeReport = { grade, zips, tiles: [], missingTiles: [], pointTypes: {} };
  const vrts: string[] = [];
  for (const zip of zips) {
    for (const member of await listDemZip(join(rawDir, zip))) {
      const mesh = meshOfMember(member);
      if (!mesh || !meshes.has(mesh)) continue;
      const tile = parseFgdDem(await readZipMember(join(rawDir, zip), member));
      for (const [k, n] of Object.entries(tile.pointTypes)) report.pointTypes[k] = (report.pointTypes[k] ?? 0) + n;
      vrts.push(writeTileVrt(tile, join(workDir, grade)));
      report.tiles.push(mesh);
    }
  }
  report.missingTiles = [...meshes].filter((m) => !report.tiles.includes(m)).sort();
  return { vrts, report };
}

/** 타일들을 목표 격자로 재투영·모자이크 → ENVI raw(.bin). */
async function warp(vrts: string[], grid: PrjGrid, resampling: string, outBin: string): Promise<void> {
  if (vrts.length === 0) throw new Error(`normalizeTerrain: no DEM tiles for ${outBin}`);
  const te = targetExtentOf(grid).map(String);
  await run(
    'gdalwarp',
    ['-q', '-overwrite', '-of', 'ENVI', '-ot', 'Float32', '-s_srs', 'EPSG:6668', '-t_srs', grid.epsg]
      .concat(['-te', ...te, '-ts', String(grid.width), String(grid.height), '-r', resampling])
      .concat(['-srcnodata', String(DEM_NODATA), '-dstnodata', String(DEM_NODATA), ...vrts, outBin]),
    { maxBuffer: 1 << 24 },
  );
}

async function fillAndWrite(mergedVrt: string, filledBin: string, tif: string): Promise<void> {
  await run('gdal', [
    'raster',
    'fill-nodata',
    '-q',
    '--overwrite',
    '--of',
    'ENVI',
    '-d',
    String(FILL_MAX_DISTANCE_PX),
    mergedVrt,
    filledBin,
  ]);
  const co = GTIFF_OPTIONS.flatMap((o) => ['-co', o]);
  await run('gdal_translate', ['-q', '-of', 'GTiff', ...co, filledBin, tif]);
}

export async function normalizeTerrain(input: NormalizeTerrainInput): Promise<NormalizeTerrainResult> {
  const { log } = input;
  const grid = gridOfBounds(input.boundsWF);
  const meshes = new Set(jisMesh3CodesInBBox(lonLatBBoxOfWF(input.boundsWF)));
  const workDir = join(input.outDir, 'work');
  rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  const layers: Float32Array[] = [];
  const grades: GradeReport[] = [];
  for (const { grade, resampling } of GRADES) {
    const { vrts, report } = await extractGrade(input.rawDir, grade, meshes, workDir);
    if (report.missingTiles.length > 0) log.warn(`${grade}: missing tiles ${report.missingTiles.join(',')}`);
    const bin = join(workDir, `${grade}.bin`);
    await warp(vrts, grid, resampling, bin);
    layers.push(readFloat32(bin, grid.width * grid.height));
    grades.push(report);
    log.info(
      `${grade}: ${report.tiles.length} tiles warped (${resampling}), points ${JSON.stringify(report.pointTypes)}`,
    );
  }
  const merged = mergeWithFallback(layers[0] as Float32Array, layers[1] as Float32Array, DEM_NODATA);
  const mergedVrt = writeGridVrt(join(workDir, 'merged.bin'), merged.values, grid, DEM_NODATA);
  const tif = join(input.outDir, 'dem_1m.tif');
  const filledBin = join(workDir, 'filled.bin');
  await fillAndWrite(mergedVrt, filledBin, tif);
  const heightStats = valueStats(readFloat32(filledBin, grid.width * grid.height), DEM_NODATA);
  if (heightStats.nodata > 0) {
    throw new Error(
      `normalizeTerrain: ${heightStats.nodata} px still nodata after fill (max ${FILL_MAX_DISTANCE_PX} px)`,
    );
  }
  const fill = { ...merged.stats, interpolated: merged.stats.remaining };
  return { tif, grid, grades, fill, heightStats };
}

/** 결과 메타(`dem_1m.json`)를 키 순서 고정으로 기록. */
export function writeTerrainMeta(res: NormalizeTerrainResult, gdalVersion: string): string {
  const path = res.tif.replace(/\.tif$/, '.json');
  const pct = (n: number): number => Math.round((n / res.fill.pixels) * 1e6) / 1e4;
  const meta = {
    source: 'gsi-dem',
    crs: res.grid.epsg,
    sampleConvention: 'pixel (col,row) center = (eMin + col, nMax - row) m; integer PRJ = integer WF',
    verticalDatum: 'GSI 標高 (JGD2024 vertical, 2025 revision) — PLATEAU(JGD2011) 대비 차이는 PROGRESS Known Issues',
    grid: res.grid,
    fill: {
      ...res.fill,
      primaryMissingPct: pct(res.fill.primaryMissing),
      filledBySecondaryPct: pct(res.fill.filledBySecondary),
      interpolatedPct: pct(res.fill.interpolated),
    },
    heightStats: res.heightStats,
    grades: res.grades,
    gdal: gdalVersion,
  };
  writeFileSync(path, `${JSON.stringify(meta, null, 2)}\n`);
  return path;
}

export function hasDemSources(rawDir: string): boolean {
  return existsSync(rawDir) && readdirSync(rawDir).some((n) => n.endsWith('.zip'));
}
