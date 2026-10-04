// Recast 타일 굽기(M06-T03, ADR-0063): 삼각형(WF) + 삼각형별 area → 64 m Detour 타일 바이트. recast-navigation(WASM)의 저수준 함수로
// 생성기(generateTileNavMeshData)와 같은 순서이되 area를 경사 판정 대신 입력값으로(보도·횡단·생활도로·보행로), 폴리곤 flags = area → 걷기·횡단.
import {
  allocCompactHeightfield,
  allocContourSet,
  allocHeightfield,
  allocPolyMesh,
  allocPolyMeshDetail,
  buildCompactHeightfield,
  buildContours,
  buildDistanceField,
  buildPolyMesh,
  buildPolyMeshDetail,
  buildRegions,
  createHeightfield,
  createNavMeshData,
  createRcConfig,
  erodeWalkableArea,
  filterLedgeSpans,
  filterLowHangingWalkableObstacles,
  filterWalkableLowHeightSpans,
  freeCompactHeightfield,
  freeContourSet,
  freeHeightfield,
  freePolyMesh,
  freePolyMeshDetail,
  init,
  NavMeshCreateParams,
  Recast,
  RecastBuildContext,
  type RecastPolyMesh,
  type RecastPolyMeshDetail,
  rasterizeTriangles,
  TriangleAreasArray,
  TrianglesArray,
  VerticesArray,
} from '@recast-navigation/core';
import { NAV_AREA, NAV_FLAG, NAV_TILE_M } from '@sanpo/tile-format';

/** 보행자 에이전트(10 §4.2): 반경 0.3 m, 키 1.8 m, 연석 0.15 m를 넘는 오름 0.25 m. 복셀 0.2 × 0.05 m. */
export const NAV_AGENT = { radius: 0.3, height: 1.8, climb: 0.25 } as const;
export const NAV_CS = 0.2;
export const NAV_CH = 0.05;
/** 타일 테두리(복셀) — 침식 반경 + 여유. 입력은 타일 ± BORDER·CS까지 있어야 이음매가 맞는다. */
export const NAV_BORDER_VX = 5;

let ready: Promise<void> | undefined;
export const initRecast = (): Promise<void> => {
  ready ??= init();
  return ready;
};

export interface NavTriangles {
  pos: Float32Array;
  idx: Uint32Array;
  /** 삼각형별 NAV_AREA. */
  areas: Uint8Array;
  minY: number;
  maxY: number;
}

const flagOf = (area: number): number => (area === NAV_AREA.crossing ? NAV_FLAG.cross : NAV_FLAG.walk);

function rcConfig() {
  const tileVx = Math.round(NAV_TILE_M / NAV_CS);
  const c = createRcConfig({
    cs: NAV_CS,
    ch: NAV_CH,
    walkableSlopeAngle: 50,
    walkableHeight: Math.ceil(NAV_AGENT.height / NAV_CH),
    walkableClimb: Math.floor(NAV_AGENT.climb / NAV_CH),
    walkableRadius: Math.ceil(NAV_AGENT.radius / NAV_CS),
    maxEdgeLen: Math.round(12 / NAV_CS),
    maxSimplificationError: 1.3,
    minRegionArea: 8 * 8,
    mergeRegionArea: 20 * 20,
    maxVertsPerPoly: 6,
    detailSampleDist: NAV_CS * 6,
    detailSampleMaxError: NAV_CH * 1,
    tileSize: tileVx,
    borderSize: NAV_BORDER_VX,
  });
  c.width = tileVx + 2 * NAV_BORDER_VX;
  c.height = tileVx + 2 * NAV_BORDER_VX;
  return c;
}

function createParams(
  pmesh: RecastPolyMesh,
  dmesh: RecastPolyMeshDetail,
  cs: number,
  ch: number,
  tx: number,
  tz: number,
) {
  const params = new NavMeshCreateParams();
  params.setPolyMeshCreateParams(pmesh);
  params.setPolyMeshDetailCreateParams(dmesh);
  params.setWalkableHeight(NAV_AGENT.height);
  params.setWalkableRadius(NAV_AGENT.radius);
  params.setWalkableClimb(NAV_AGENT.climb);
  params.setCellSize(cs);
  params.setCellHeight(ch);
  params.setBuildBvTree(true);
  params.setTileX(tx);
  params.setTileY(tz);
  return params;
}

/** 타일 (tx, tz) 하나. 걷는 면이 없으면 null. */
export function buildNavTile(t: NavTriangles, tx: number, tz: number): Uint8Array | null {
  if (t.idx.length === 0) return null;
  const cfg = rcConfig();
  const ctx = new RecastBuildContext();
  const pad = NAV_BORDER_VX * NAV_CS;
  const bmin: [number, number, number] = [tx * NAV_TILE_M - pad, t.minY - 1, tz * NAV_TILE_M - pad];
  const bmax: [number, number, number] = [(tx + 1) * NAV_TILE_M + pad, t.maxY + 3, (tz + 1) * NAV_TILE_M + pad];
  const verts = new VerticesArray();
  verts.copy(t.pos);
  const tris = new TrianglesArray();
  tris.copy(new Int32Array(t.idx.buffer, t.idx.byteOffset, t.idx.length));
  const areas = new TriangleAreasArray();
  areas.copy(t.areas);
  const hf = allocHeightfield();
  const chf = allocCompactHeightfield();
  const cset = allocContourSet();
  const pmesh = allocPolyMesh();
  const dmesh = allocPolyMeshDetail();
  try {
    if (!createHeightfield(ctx, hf, cfg.width, cfg.height, bmin, bmax, cfg.cs, cfg.ch)) throw new Error('heightfield');
    const nt = t.idx.length / 3;
    if (!rasterizeTriangles(ctx, verts, t.pos.length / 3, tris, areas, nt, hf, cfg.walkableClimb))
      throw new Error('rasterize');
    filterLowHangingWalkableObstacles(ctx, cfg.walkableClimb, hf);
    filterLedgeSpans(ctx, cfg.walkableHeight, cfg.walkableClimb, hf);
    filterWalkableLowHeightSpans(ctx, cfg.walkableHeight, hf);
    if (!buildCompactHeightfield(ctx, cfg.walkableHeight, cfg.walkableClimb, hf, chf)) throw new Error('compact');
    if (!erodeWalkableArea(ctx, cfg.walkableRadius, chf)) throw new Error('erode');
    if (!buildDistanceField(ctx, chf)) throw new Error('distance');
    if (!buildRegions(ctx, chf, cfg.borderSize, cfg.minRegionArea, cfg.mergeRegionArea)) throw new Error('regions');
    if (!buildContours(ctx, chf, cfg.maxSimplificationError, cfg.maxEdgeLen, cset, Recast.RC_CONTOUR_TESS_WALL_EDGES))
      throw new Error('contours');
    if (!buildPolyMesh(ctx, cset, cfg.maxVertsPerPoly, pmesh)) throw new Error('polymesh');
    if (pmesh.npolys() === 0) return null;
    if (!buildPolyMeshDetail(ctx, pmesh, chf, cfg.detailSampleDist, cfg.detailSampleMaxError, dmesh))
      throw new Error('detail');
    for (let p = 0; p < pmesh.npolys(); p++) pmesh.setFlags(p, flagOf(pmesh.areas(p)));
    const r = createNavMeshData(createParams(pmesh, dmesh, cfg.cs, cfg.ch, tx, tz));
    if (!r.success) throw new Error('navmesh data');
    const out = new Uint8Array(r.navMeshData.toTypedArray());
    r.navMeshData.destroy();
    return out;
  } finally {
    freeHeightfield(hf);
    freeCompactHeightfield(chf);
    freeContourSet(cset);
    freePolyMesh(pmesh);
    freePolyMeshDetail(dmesh);
    verts.destroy();
    tris.destroy();
    areas.destroy();
  }
}
