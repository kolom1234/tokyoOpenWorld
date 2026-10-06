// L0 셀 조립: 지형 성형(M05-T01) → terrain.mesh + terrain.height + buildings.mesh + roads.mesh(보도·연석) + collision.bin + meta.json → TKC,
// 영역 빌드(cells.idx·world.json). see docs/04-data-pipeline.md §4.3–4.4, docs/05-tile-format.md §1–3
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, type Logger, unpackCellKey } from '@sanpo/core';
import {
  type CellMeta,
  type CellsIndexEntry,
  gzip,
  type RailNetwork,
  type TkcSectionInput,
  tkcHash32,
  type Vec3Tuple,
  writeCellsIndex,
  writeTkc,
} from '@sanpo/tile-format';
import { terrainLookup } from '../../lib/mesh-lookup.ts';
import type { BridgeRecord, BuildingRecord, RoadRecord } from '../../readers/plateau/types.ts';
import { burnOuterEdges, outerEdgesAround } from '../derive/edge-burn.ts';
import { type FootprintSource, footprintGrid, footprintSources } from '../derive/footprints.ts';
import type { LocalGrid } from '../derive/grid.ts';
import { buildMarkings, type MarkingInput } from '../derive/markings/index.ts';
import type { PropCatalog } from '../derive/props/context.ts';
import type { WireBuf } from '../derive/props/wires.ts';
import { roadIndex, roadRaster } from '../derive/roads.ts';
import { walkwaysOf } from '../derive/stairs.ts';
import { SHAPE_PAD, type ShapedGround, shapeGround } from '../derive/terrain-shape.ts';
import { paintVegetation } from '../derive/vegetation.ts';
import { OSM_SOURCE, type OsmRecord } from '../normalize-osm.ts';
import { aroundReader, railNetworkFor, readLayer } from './area-reader.ts';
import { crop, mergeStreams, outward, union, unionBounds, withOverrideCollider, yRange } from './assemble-util.ts';
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
  demHeightAt,
  paddedCellWindow,
  readDemWindow,
} from './dem-window.ts';
import { encodeTerrainHeight } from './heightfield.ts';
import { type LanesCellStats, lanesCell } from './lanes-cell.ts';
import { type AreaDef, worldJson } from './manifest.ts';
import { type NavCellOutput, navCell } from './nav-cell.ts';
import { LANDMARK_MATERIAL, type OverrideCellOutput, type OverrideSet, overrideCell } from './overrides/index.ts';
import { type PropCellOutput, propsCell } from './props-cell.ts';
import { trackBuildings } from './rail-buildings.ts';
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
  /** 셀 + 8-이웃 신호 점·신호 횡단 선(차선 정지선 신호 — M06-T05). 없으면 lanes.bin 없음. */
  signalsAround?: readonly OsmRecord[];
  /** 셀 + 8-이웃 OSM 차도 선(신호 그룹 도로 방향 — M06-T02). 없으면 osm 중 차도. */
  vehicleRoadsAround?: readonly OsmRecord[];
  /** PLATEAU 道路標示(셀 + 8-이웃)·OSM 횡단 보정(M06 사전 2, ADR-0058). */
  markings?: Pick<MarkingInput, 'plateau' | 'corrections'>;
  /** 소품 카탈로그(M05-T03). 없으면 props.inst·소품 콜라이더·전선 없음. */
  props?: PropCatalog;
  /** 건물이 없는 셀의 meta.json sources(영역의 PLATEAU 소스). */
  metaFallbackSources: readonly string[];
  /** 랜드마크 오버라이드(M05-T05, content/overrides). 없으면 overrides.mesh 없음. */
  overrides?: OverrideSet;
  /** 이 셀 교량(PLATEAU brid, M05-T08)·셀 + 8-이웃 교량(계단 끝 상판 높이). overrides가 있을 때만 쓴다. */
  bridges?: readonly BridgeRecord[];
  bridgesAround?: readonly BridgeRecord[];
  /** 이웃 포함 OSM 계단 선(교량 면 계단 통로 걷어내기). */
  stepsAround?: readonly OsmRecord[];
  /** 셀 밖까지 WF 지면 높이(영역 DEM) — 이웃 셀 계단 통로. 없으면 셀 지형만. */
  groundAround?: (x: number, z: number) => number | undefined;
  /** 철도 망(M07-T01) — overrides.mesh 선로 메시. */
  rail?: RailNetwork;
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
  const o = { roads: input.roads, ox: originWF[0], oz: originWF[2], terrainAt, ...input.markings };
  const marks = input.osm ? buildMarkings({ osm: input.osm, ...o }) : undefined;
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
    ...(input.vehicleRoadsAround ? { vehicleRoadsAround: input.vehicleRoadsAround } : {}),
    buildings: input.buildings,
    roads: input.roads,
    index: sc.index,
    shaped: sc.shaped,
    footprints: sc.flat,
    footprintRings: input.footprintsAround ?? footprintSources(input.buildings),
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
  nav: NavCellOutput | null;
  lanes: { bytes: Uint8Array | null; stats: LanesCellStats } | null;
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
  if (p.nav?.bytes) sections.push({ type: 'nav.bin', sources: propSources, data: p.nav.bytes });
  if (p.lanes?.bytes) sections.push({ type: 'lanes.bin', sources: [OSM_SOURCE, TERRAIN_SOURCE], data: p.lanes.bytes });
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

/** 내비(M06-T03): OSM이 있는 셀만(픽스처 스냅샷 등은 없음). */
function navOf(
  input: CellBuildInput,
  originWF: Vec3Tuple,
  sc: ReturnType<typeof shapeCell>,
  props: PropCellOutput | null,
  bands: Parameters<typeof navCell>[0]['bands'],
): Promise<NavCellOutput> {
  const { ix, iz } = unpackCellKey(input.key);
  return navCell({
    ix,
    iz,
    ox: originWF[0],
    oz: originWF[2],
    roads: input.roads,
    footprints: input.footprintsAround ?? footprintSources(input.buildings),
    osm: input.osm ?? [],
    ...(input.vehicleRoadsAround ? { vehicleRoadsAround: input.vehicleRoadsAround } : {}),
    shaped: sc.shaped,
    bands,
    colliders: props?.colliders ?? [],
    ...(input.props?.signalSites ? { signalSites: input.props.signalSites } : {}),
    ...(input.props?.signalRules ? { signalRules: input.props.signalRules } : {}),
  });
}

/** 셀 1개 → TKC 바이트 + 통계. 같은 입력 → 같은 바이트. */
export async function buildCell(input: CellBuildInput): Promise<{ tkc: Uint8Array; stats: CellBuildStats }> {
  const { level, ix, iz } = unpackCellKey(input.key);
  const originWF: Vec3Tuple = [ix * CELL_SIZE_M, 0, iz * CELL_SIZE_M];
  const sc = shapeCell(input, originWF);
  const terrain = await buildTerrainGeometry(sc.window, sc.surf, sc.tol);
  const terrainAt = terrainLookup({ pos: terrain.positions, idx: terrain.indices });
  const ov = input.overrides
    ? await overrideCell(input.overrides, input.buildings, originWF, terrainAt, {
        ...walkwaysOf(input, originWF, terrainAt),
        ...(input.rail ? { rail: input.rail } : {}),
      })
    : null;
  // 선로 위 건물(M07-T04): 충돌 제외, 낮은 승강장 지붕은 렌더도 제외.
  const tb = trackBuildings(input.buildings, input.rail);
  const renderSkip = new Set([...(ov?.renderSkip ?? []), ...tb.renderSkip]);
  const bld = await buildBuildings(input.buildings, originWF, renderSkip, tb.colliderSkip);
  const own = input.cellRoads ?? [];
  const roads = await buildRoads(own, sc.index, originWF[0], originWF[2], sc.shaped, terrainAt);
  const props = await propCell(input, originWF, sc, terrainAt);
  const { decals, decalTris, marks } = await markCell(input, originWF, terrainAt, props?.wires);
  const bc = withOverrideCollider(bld.collision, ov);
  const ground = ov ? mergeStreams(roads.collider, ov.walkCollider) : roads.collider;
  const col = await buildCollision(bc.pos, bc.idx, ground, [...(props?.colliders ?? []), ...(ov?.walkShapes ?? [])]);
  const nav = input.osm ? await navOf(input, originWF, sc, props, marks?.bands ?? []) : null;
  const lanes =
    input.vehicleRoadsAround && input.signalsAround
      ? await lanesCell({
          ox: originWF[0],
          oz: originWF[2],
          roads: input.roads,
          vehicleRoadsAround: input.vehicleRoadsAround,
          signalsAround: input.signalsAround,
          shaped: sc.shaped,
          ...(input.props?.signalSites ? { signalSites: input.props.signalSites } : {}),
          ...(input.props?.signalRules ? { signalRules: input.props.signalRules } : {}),
          ...(input.props?.signalRules ? { signalRules: input.props.signalRules } : {}),
        })
      : null;
  const parts: CellParts = { sc, terrain, bld, roads, own, decals, col, props, ov, nav, lanes };
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
  /** OSM 횡단 선 보정(M06 사전 2, content/markings). */
  crossingCorrections?: MarkingInput['corrections'];
  /** 철도(M07-T01): 있으면 global/rail.bin을 먼저 만들고 셀 overrides.mesh에 선로 메시. */
  rail?: { repoRoot: string; derivedDir: string };
}

/** 영역 빌드: 셀 TKC(행 = iz, 열 = ix 순) + cells.idx + world.json. */
export { unionBounds };

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
  const rail = await railNetworkFor(input, outDir);
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
      vehicleRoadsAround: files.vehicleRoadsAround(key),
      signalsAround: files.signalsAround(key),
      markings: { plateau: files.markingsAround(key), corrections: input.crossingCorrections ?? [] },
      ...(input.props ? { props: input.props } : {}),
      ...(input.overrides
        ? {
            overrides: input.overrides,
            bridges: files.bridgesOf(key),
            bridgesAround: files.bridgesAround(key),
            stepsAround: files.stepsAround(key),
            groundAround: (x: number, z: number) => demHeightAt(dem, x, z),
            ...(rail ? { rail } : {}),
          }
        : {}),
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
      `${s.id}: ${s.bytes} B, terrain ${s.terrainVertices} v, buildings ${s.buildings} (${s.buildingVertices} v), roads ${s.roadsTris} tris (curb ${s.curbM} m, edge ${s.walkEdgeM} m), decals ${s.decalTris} tris ${JSON.stringify(s.markings)}, props ${JSON.stringify(s.props)}, trees ${JSON.stringify(s.trees)}, overrides ${JSON.stringify(s.overrides)}, collider ${s.colliderTris} tris / ${s.colliderShapes}, nav ${JSON.stringify(s.nav)}, lanes ${JSON.stringify(s.lanes)}`,
    );
  }
  writeFileSync(join(outDir, 'cells.idx'), writeCellsIndex(index));
  writeFileSync(join(outDir, 'world.json'), worldJson({ buildId: input.buildId, area: input.area }));
  return stats;
}

export type { CellBuildStats } from './cell-stats.ts';
