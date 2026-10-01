// L0 셀 조립: 지형 성형(M05-T01) → terrain.mesh + terrain.height + buildings.mesh + roads.mesh(보도·연석) + collision.bin + meta.json → TKC,
// 영역 빌드(cells.idx·world.json). see docs/04-data-pipeline.md §4.3–4.4, docs/05-tile-format.md §1–3
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, type Logger, unpackCellKey } from '@sanpo/core';
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
import { terrainLookup } from '../../lib/mesh-lookup.ts';
import type { BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { burnOuterEdges, outerEdgesAround } from '../derive/edge-burn.ts';
import { type FootprintSource, footprintGrid, footprintSources } from '../derive/footprints.ts';
import type { LocalGrid } from '../derive/grid.ts';
import { buildMarkings } from '../derive/markings/index.ts';
import type { PropCatalog } from '../derive/props/context.ts';
import type { WireBuf } from '../derive/props/wires.ts';
import { roadIndex, roadRaster } from '../derive/roads.ts';
import { SHAPE_PAD, type ShapedGround, shapeGround } from '../derive/terrain-shape.ts';
import { paintVegetation } from '../derive/vegetation.ts';
import { OSM_SOURCE, type OsmRecord } from '../normalize-osm.ts';
import { aroundReader, readLayer } from './area-reader.ts';
import { type Aabb, BUILDING_MATERIAL, buildBuildings } from './buildings-mesh.ts';
import { type CellBuildStats, cellStats } from './cell-stats.ts';
import { buildCollision } from './collision.ts';
import { encodeDecals } from './decals-mesh.ts';
import {
  CELL_SIZE_M,
  type CellWindow,
  cropWindow,
  DEM_MARGIN,
  type DemWindow,
  paddedCellWindow,
  readDemWindow,
} from './dem-window.ts';
import { encodeTerrainHeight } from './heightfield.ts';
import { type AreaDef, worldJson } from './manifest.ts';
import { LANDMARK_MATERIAL, type OverrideCellOutput, type OverrideSet, overrideCell } from './overrides/index.ts';
import { type PropCellOutput, propsCell } from './props-cell.ts';
import { buildRoads } from './roads-mesh.ts';
import { buildTerrainGeometry, encodeTerrainMesh, TERRAIN_MATERIAL } from './terrain-mesh.ts';

/** 성형 창 여유(m) = 성형 국소 반경 + 법선 여유. */
export const BUILD_MARGIN = SHAPE_PAD + DEM_MARGIN;

const TERRAIN_SOURCE = 'gsi-dem';

export interface CellBuildInput {
  key: CellKey;
  buildId: string;
  /** 여유 BUILD_MARGIN 창(paddedCellWindow). */
  window: CellWindow;
  buildings: readonly BuildingRecord[];
  /** 셀 + 8-이웃 건물 발자국(성형 평탄화 — 여유 샘플을 이웃과 같게). 없으면 buildings에서. */
  footprintsAround?: readonly FootprintSource[];
  /** 이 셀과 8-이웃 셀의 도로 조각(`_SURF` 분류·성형·연석 판정, 경계 샘플을 이웃과 같게). */
  roads: readonly RoadRecord[];
  /** 이 셀 도로 조각(보도 메시). 없으면 roads 중 이 셀 안 조각을 쓰지 않는다(메시 없음). */
  cellRoads?: readonly RoadRecord[];
  /** 이 셀 OSM 레코드(노면 표시, M05-T02). 없으면 decals.mesh 없음. */
  osm?: readonly OsmRecord[];
  /** 소품 카탈로그(M05-T03). 없으면 props.inst·소품 콜라이더·전선 없음. */
  props?: PropCatalog;
  /** 건물이 없는 셀의 meta.json sources(영역의 PLATEAU 소스). */
  metaFallbackSources: readonly string[];
  /** 랜드마크 오버라이드(M05-T05, content/overrides). 없으면 overrides.mesh 없음. */
  overrides?: OverrideSet;
}

/** 랜드마크 부품 충돌 삼각형을 건물 충돌 스트림 뒤에 붙인다(같이 단순화·청크). */
function withOverrideCollider(
  c: { pos: Float32Array; idx: Uint32Array },
  ov: OverrideCellOutput | null,
): { pos: Float32Array; idx: Uint32Array } {
  if (!ov || ov.collider.idx.length === 0) return c;
  const base = c.pos.length / 3;
  return {
    pos: Float32Array.from([...c.pos, ...ov.collider.pos]),
    idx: Uint32Array.from([...c.idx, ...ov.collider.idx.map((k) => k + base)]),
  };
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

/** 넓은 창 배열 → 여유 margin 창(257 + 2·margin)². */
function crop<T extends Uint8Array | Float32Array>(w: CellWindow, arr: T, margin: number): T {
  const stride = w.size + 2 * margin;
  const off = w.margin - margin;
  const out = new (arr.constructor as new (n: number) => T)(stride * stride);
  for (let r = 0; r < stride; r++)
    out.set(arr.subarray((r + off) * w.stride + off, (r + off) * w.stride + off + stride), r * stride);
  return out;
}

/** 성형(M05-T01): 넓은 창 → 성형 높이(여유 1 창)·`_SURF`·RTIN 허용 오차(257²). */
function shapeCell(input: CellBuildInput, originWF: Vec3Tuple) {
  const wide = input.window;
  const grid: LocalGrid = { x0: -wide.margin, z0: -wide.margin, n: wide.stride };
  const cls = roadRaster(input.roads, originWF[0], originWF[2], grid);
  const fp = input.footprintsAround ?? footprintSources(input.buildings);
  const flat = footprintGrid(fp, originWF[0], originWF[2], grid);
  const shaped: ShapedGround = shapeGround(grid, wide.values, cls, flat);
  const index = roadIndex(input.roads);
  burnOuterEdges(shaped, outerEdgesAround(input.roads, index, originWF[0], originWF[2], shaped));
  return {
    shaped,
    index,
    window: cropWindow(wide, shaped.ground, DEM_MARGIN),
    // 지형 `_SURF` = 도로 분류 + 녹지 덧칠(M05-T04 — 성형 cls는 그대로).
    surf: crop(wide, input.osm ? paintVegetation(cls, input.osm, originWF[0], originWF[2], grid) : cls, 0),
    tol: crop(wide, shaped.tol, 0),
    flat,
  };
}

/** 노면 표시(M05-T02) + 전선(M05-T03): 셀 OSM → decals.mesh(없으면 null). */
async function markCell(
  input: CellBuildInput,
  originWF: Vec3Tuple,
  terrainAt: (x: number, z: number) => number | undefined,
  wires: WireBuf | undefined,
) {
  const marks = input.osm
    ? buildMarkings({ osm: input.osm, roads: input.roads, ox: originWF[0], oz: originWF[2], terrainAt })
    : undefined;
  const decals = marks ? await encodeDecals(marks.decals, wires) : null;
  const tris = (marks ? marks.decals.idx.length / 3 : 0) + (wires ? wires.idx.length / 3 : 0);
  return { decals, decalTris: decals ? tris : 0, marks };
}

/** 소품(M05-T03): 카탈로그가 있을 때만(plateau-mini 스냅샷 등은 없음). */
function propCell(
  input: CellBuildInput,
  originWF: Vec3Tuple,
  sc: ReturnType<typeof shapeCell>,
  terrainAt: (x: number, z: number) => number | undefined,
): Promise<PropCellOutput> | null {
  if (!input.props) return null;
  return propsCell({
    key: input.key,
    catalog: input.props,
    ox: originWF[0],
    oz: originWF[2],
    osm: input.osm ?? [],
    buildings: input.buildings,
    roads: input.roads,
    index: sc.index,
    shaped: sc.shaped,
    footprints: sc.flat,
    terrainAt,
  });
}

function roadSources(records: readonly RoadRecord[]): string[] {
  return [...new Set(records.map((r) => r.source))].sort();
}

export interface CellParts {
  sc: ReturnType<typeof shapeCell>;
  terrain: Awaited<ReturnType<typeof buildTerrainGeometry>>;
  bld: Awaited<ReturnType<typeof buildBuildings>>;
  roads: Awaited<ReturnType<typeof buildRoads>>;
  own: readonly RoadRecord[];
  decals: Uint8Array | null;
  col: Awaited<ReturnType<typeof buildCollision>>;
  props: PropCellOutput | null;
  ov: OverrideCellOutput | null;
}

async function cellSections(input: CellBuildInput, p: CellParts): Promise<TkcSectionInput[]> {
  const { bld, roads, own, col, props } = p;
  const metaSources = bld.sources.length > 0 ? bld.sources : [...input.metaFallbackSources];
  const meta = { buildings: bld.meta, pois: [], placeNames: [], signals: [], interactables: [] };
  const sections: TkcSectionInput[] = [
    { type: 'terrain.mesh', sources: [TERRAIN_SOURCE], data: await encodeTerrainMesh(p.terrain) },
    { type: 'terrain.height', sources: [TERRAIN_SOURCE], data: await encodeTerrainHeight(p.sc.window) },
    { type: 'meta.json', sources: metaSources, data: await encodeMeta(meta) },
  ];
  if (bld.glb) sections.push({ type: 'buildings.mesh', sources: bld.sources, data: bld.glb });
  if (p.ov?.glb) {
    const ovSources = [...new Set([...bld.sources, OSM_SOURCE, TERRAIN_SOURCE])].sort();
    sections.push({ type: 'overrides.mesh', sources: ovSources, data: p.ov.glb });
  }
  if (roads.glb) sections.push({ type: 'roads.mesh', sources: [TERRAIN_SOURCE, ...roadSources(own)], data: roads.glb });
  if (p.decals) sections.push({ type: 'decals.mesh', sources: [OSM_SOURCE, TERRAIN_SOURCE], data: p.decals });
  const propSources = [...new Set([OSM_SOURCE, TERRAIN_SOURCE, ...roadSources(own), ...bld.sources])].sort();
  if (props?.inst) sections.push({ type: 'props.inst', sources: propSources, data: props.inst });
  if (props?.trees) sections.push({ type: 'trees.inst', sources: propSources, data: props.trees });
  if (col.data) {
    const colSources = [
      ...new Set([
        ...bld.sources,
        ...(roads.collider.idx.length > 0 ? roadSources(own) : []),
        ...((props?.colliders.length ?? 0) > 0 ? propSources : []),
      ]),
    ].sort();
    sections.push({ type: 'collision.bin', sources: colSources, data: col.data });
  }
  return sections;
}

/** 셀 1개 → TKC 바이트 + 통계. 같은 입력 → 같은 바이트. */
export async function buildCell(input: CellBuildInput): Promise<{ tkc: Uint8Array; stats: CellBuildStats }> {
  const { level, ix, iz } = unpackCellKey(input.key);
  const originWF: Vec3Tuple = [ix * CELL_SIZE_M, 0, iz * CELL_SIZE_M];
  const sc = shapeCell(input, originWF);
  const terrain = await buildTerrainGeometry(sc.window, sc.surf, sc.tol);
  const terrainAt = terrainLookup({ pos: terrain.positions, idx: terrain.indices });
  const ov = input.overrides ? await overrideCell(input.overrides, input.buildings, originWF, terrainAt) : null;
  const bld = await buildBuildings(input.buildings, originWF, ov?.renderSkip);
  const own = input.cellRoads ?? [];
  const roads = await buildRoads(own, sc.index, originWF[0], originWF[2], sc.shaped, terrainAt);
  const props = await propCell(input, originWF, sc, terrainAt);
  const { decals, decalTris, marks } = await markCell(input, originWF, terrainAt, props?.wires);
  const bc = withOverrideCollider(bld.collision, ov);
  const col = await buildCollision(bc.pos, bc.idx, roads.collider, props?.colliders);
  const parts: CellParts = { sc, terrain, bld, roads, own, decals, col, props, ov };
  const [y0, y1] = yRange(terrain.positions);
  const cellBox: Aabb = { min: [0, y0, 0], max: [CELL_SIZE_M, y1, CELL_SIZE_M] };
  const local = outward(union(union(cellBox, bld.aabbLocal), ov?.aabbLocal ?? null));
  const add = (v: Vec3Tuple): Vec3Tuple => v.map((c, k) => c + (originWF[k] as number)) as Vec3Tuple;
  const tris = terrain.indices.length / 3 + bld.tris + roads.tris + decalTris + (ov?.tris ?? 0);
  const materials = [
    TERRAIN_MATERIAL,
    ...(bld.glb ? [BUILDING_MATERIAL] : []),
    ...(ov?.glb ? [LANDMARK_MATERIAL] : []),
  ];
  const tkc = writeTkc(
    {
      cell: { level, ix, iz },
      buildId: input.buildId,
      originWF,
      aabbWF: { min: add(local.min), max: add(local.max) },
      materials: materials.sort(),
      stats: { tris, colliderTris: col.tris, instances: (props?.stats.instances ?? 0) + (props?.treeStats.trees ?? 0) },
    },
    await cellSections(input, parts),
  );
  return { tkc, stats: cellStats(input.key, tkc.byteLength, parts, decalTris, marks?.stats ?? null) };
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
  /** 소품 카탈로그(M05-T03, content/props/catalog.json). */
  props?: PropCatalog;
  /** 랜드마크 오버라이드(M05-T05, content/overrides). */
  overrides?: OverrideSet;
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

/** 영역 빌드: 셀 TKC(행 = iz, 열 = ix 순) + cells.idx + world.json. */
export async function buildArea(input: AreaBuildInput): Promise<CellBuildStats[]> {
  const { log, outDir } = input;
  const cells = [...input.cells].sort((a, b) => a - b);
  const dem =
    input.dem ??
    (await readDemWindow(
      join(input.normalizedDir, 'terrain'),
      unionBounds(cells),
      BUILD_MARGIN,
      join(outDir, '.work'),
    ));
  const files = aroundReader(input.normalizedDir);
  rmSync(outDir, { recursive: true, force: true });
  const index: CellsIndexEntry[] = [];
  const stats: CellBuildStats[] = [];
  for (const key of cells) {
    const { ix, iz } = unpackCellKey(key);
    const { tkc, stats: s } = await buildCell({
      key,
      buildId: input.buildId,
      window: paddedCellWindow(dem, ix, iz, BUILD_MARGIN),
      buildings: readLayer<BuildingRecord>(input.normalizedDir, 'buildings', key),
      footprintsAround: files.footprintsAround(key),
      roads: files.roadsAround(key),
      cellRoads: files.roadsOf(key),
      osm: readLayer<OsmRecord>(input.normalizedDir, 'osm', key),
      ...(input.props ? { props: input.props } : {}),
      ...(input.overrides ? { overrides: input.overrides } : {}),
      metaFallbackSources: input.plateauSources,
    });
    const dir = join(outDir, 'L0', String(ix));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${iz}.tkc`), tkc);
    // flags bit0 = 수작업 오버라이드 포함(05 §5).
    const flags = (s.overrides?.landmarks.length ?? 0) > 0 ? 1 : 0;
    index.push({ level: 0, ix, iz, flags, byteLength: tkc.byteLength, hash32: tkcHash32(tkc) });
    stats.push(s);
    log.info(
      `${s.id}: ${s.bytes} B, terrain ${s.terrainVertices} v, buildings ${s.buildings} (${s.buildingVertices} v), roads ${s.roadsTris} tris (curb ${s.curbM} m, edge ${s.walkEdgeM} m), decals ${s.decalTris} tris ${JSON.stringify(s.markings)}, props ${JSON.stringify(s.props)}, trees ${JSON.stringify(s.trees)}, overrides ${JSON.stringify(s.overrides)}, collider ${s.colliderTris} tris / ${s.colliderShapes}`,
    );
  }
  writeFileSync(join(outDir, 'cells.idx'), writeCellsIndex(index));
  writeFileSync(join(outDir, 'world.json'), worldJson({ buildId: input.buildId, area: input.area }));
  return stats;
}

export type { CellBuildStats } from './cell-stats.ts';
