// L0 셀 조립: terrain.mesh + terrain.height + buildings.mesh + meta.json → TKC, 영역 빌드(cells.idx·world.json). see docs/04-data-pipeline.md §4.4, docs/05-tile-format.md §1–3
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, cellIdString, type Logger, unpackCellKey } from '@sanpo/core';
import { type CellBoundsWF, cellBoundsWF } from '@sanpo/geo';
import {
  type CellMeta,
  type CellsIndexEntry,
  gzip,
  type TkcSectionInput,
  tkcHash32,
  type Vec3Tuple,
  writeCellsIndex,
  writeTkc,
} from '@sanpo/tile-format';
import { readNdjsonGz } from '../../lib/ndjson-gz.ts';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { type Aabb, BUILDING_MATERIAL, buildBuildings } from './buildings-mesh.ts';
import { CELL_SIZE_M, type CellWindow, cellWindow, DEM_MARGIN, type DemWindow, readDemWindow } from './dem-window.ts';
import { encodeTerrainHeight } from './heightfield.ts';
import { type AreaDef, worldJson } from './manifest.ts';
import { buildTerrainGeometry, encodeTerrainMesh, TERRAIN_MATERIAL } from './terrain-mesh.ts';

const TERRAIN_SOURCE = 'gsi-dem';

export interface CellBuildStats {
  id: string;
  bytes: number;
  terrainVertices: number;
  terrainTris: number;
  buildingVertices: number;
  buildingTris: number;
  buildings: number;
}

export interface CellBuildInput {
  key: CellKey;
  buildId: string;
  window: CellWindow;
  buildings: readonly BuildingRecord[];
  /** 건물이 없는 셀의 meta.json sources(영역의 PLATEAU 소스). */
  metaFallbackSources: readonly string[];
}

/** mm 단위로 바깥쪽 반올림(헤더 JSON 숫자 안정화). */
function outward(b: Aabb): Aabb {
  const lo = (v: number): number => Math.floor(v * 1000) / 1000;
  const hi = (v: number): number => Math.ceil(v * 1000) / 1000;
  return { min: b.min.map(lo) as Vec3Tuple, max: b.max.map(hi) as Vec3Tuple };
}

function union(a: Aabb, b: Aabb | null): Aabb {
  if (!b) return a;
  const pick = (f: (x: number, y: number) => number, x: Vec3Tuple, y: Vec3Tuple): Vec3Tuple =>
    [0, 1, 2].map((k) => f(x[k] as number, y[k] as number)) as Vec3Tuple;
  return { min: pick(Math.min, a.min, b.min), max: pick(Math.max, a.max, b.max) };
}

function yRange(positions: Float32Array): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i] as number);
    hi = Math.max(hi, positions[i] as number);
  }
  return [lo, hi];
}

async function encodeMeta(meta: CellMeta): Promise<Uint8Array> {
  const ordered: CellMeta = {
    buildings: meta.buildings,
    pois: meta.pois,
    placeNames: meta.placeNames,
    signals: meta.signals,
    interactables: meta.interactables,
  };
  return gzip(new TextEncoder().encode(JSON.stringify(ordered)));
}

/** 셀 1개 → TKC 바이트 + 통계. 같은 입력 → 같은 바이트. */
export async function buildCell(input: CellBuildInput): Promise<{ tkc: Uint8Array; stats: CellBuildStats }> {
  const { level, ix, iz } = unpackCellKey(input.key);
  const originWF: Vec3Tuple = [ix * CELL_SIZE_M, 0, iz * CELL_SIZE_M];
  const terrain = await buildTerrainGeometry(input.window);
  const bld = await buildBuildings(input.buildings, originWF);
  const [y0, y1] = yRange(terrain.positions);
  const local = outward(union({ min: [0, y0, 0], max: [CELL_SIZE_M, y1, CELL_SIZE_M] }, bld.aabbLocal));
  const add = (v: Vec3Tuple): Vec3Tuple => v.map((c, k) => c + (originWF[k] as number)) as Vec3Tuple;
  const metaSources = bld.sources.length > 0 ? bld.sources : [...input.metaFallbackSources];
  const meta = { buildings: bld.meta, pois: [], placeNames: [], signals: [], interactables: [] };
  const sections: TkcSectionInput[] = [
    { type: 'terrain.mesh', sources: [TERRAIN_SOURCE], data: await encodeTerrainMesh(terrain) },
    { type: 'terrain.height', sources: [TERRAIN_SOURCE], data: await encodeTerrainHeight(input.window) },
    { type: 'meta.json', sources: metaSources, data: await encodeMeta(meta) },
  ];
  if (bld.glb) sections.push({ type: 'buildings.mesh', sources: bld.sources, data: bld.glb });
  const terrainTris = terrain.indices.length / 3;
  const tkc = writeTkc(
    {
      cell: { level, ix, iz },
      buildId: input.buildId,
      originWF,
      aabbWF: { min: add(local.min), max: add(local.max) },
      materials: bld.glb ? [BUILDING_MATERIAL, TERRAIN_MATERIAL].sort() : [TERRAIN_MATERIAL],
      stats: { tris: terrainTris + bld.tris, colliderTris: 0, instances: 0 },
    },
    sections,
  );
  const stats: CellBuildStats = {
    id: cellIdString(input.key),
    bytes: tkc.byteLength,
    terrainVertices: terrain.positions.length / 3,
    terrainTris,
    buildingVertices: bld.vertices,
    buildingTris: bld.tris,
    buildings: bld.meta.length,
  };
  return { tkc, stats };
}

export interface AreaBuildInput {
  area: AreaDef;
  cells: readonly CellKey[];
  buildId: string;
  /** `data/normalized`. */
  normalizedDir: string;
  /** `data/build/<buildId>` — 실행마다 비우고 다시 쓴다. */
  outDir: string;
  plateauSources: readonly string[];
  log: Logger;
  /** 테스트용: GDAL 없이 DEM 창 주입. */
  dem?: DemWindow;
}

/** 셀 목록의 합집합(양끝 포함) WF 경계. */
export function unionBounds(cells: readonly CellKey[]): CellBoundsWF {
  const bs = cells.map(cellBoundsWF);
  const pick = (f: (...v: number[]) => number, k: keyof CellBoundsWF): number => f(...bs.map((b) => b[k]));
  return {
    minX: pick(Math.min, 'minX'),
    minZ: pick(Math.min, 'minZ'),
    maxX: pick(Math.max, 'maxX'),
    maxZ: pick(Math.max, 'maxZ'),
  };
}

function readBuildings(normalizedDir: string, key: CellKey): BuildingRecord[] {
  const f = join(normalizedDir, 'buildings', `${cellIdString(key)}.ndjson.gz`);
  return existsSync(f) ? readNdjsonGz<BuildingRecord>(f) : [];
}

/** 영역 빌드: 셀 TKC(행 = iz, 열 = ix 순) + cells.idx + world.json. */
export async function buildArea(input: AreaBuildInput): Promise<CellBuildStats[]> {
  const { log, outDir } = input;
  const cells = [...input.cells].sort((a, b) => a - b);
  const dem =
    input.dem ??
    (await readDemWindow(join(input.normalizedDir, 'terrain'), unionBounds(cells), DEM_MARGIN, join(outDir, '.work')));
  rmSync(outDir, { recursive: true, force: true });
  const index: CellsIndexEntry[] = [];
  const stats: CellBuildStats[] = [];
  for (const key of cells) {
    const { ix, iz } = unpackCellKey(key);
    const { tkc, stats: s } = await buildCell({
      key,
      buildId: input.buildId,
      window: cellWindow(dem, ix, iz),
      buildings: readBuildings(input.normalizedDir, key),
      metaFallbackSources: input.plateauSources,
    });
    const dir = join(outDir, 'L0', String(ix));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${iz}.tkc`), tkc);
    index.push({ level: 0, ix, iz, flags: 0, byteLength: tkc.byteLength, hash32: tkcHash32(tkc) });
    stats.push(s);
    log.info(
      `${s.id}: ${s.bytes} B, terrain ${s.terrainVertices} v, buildings ${s.buildings} (${s.buildingVertices} v)`,
    );
  }
  writeFileSync(join(outDir, 'cells.idx'), writeCellsIndex(index));
  writeFileSync(join(outDir, 'world.json'), worldJson({ buildId: input.buildId, area: input.area }));
  return stats;
}
