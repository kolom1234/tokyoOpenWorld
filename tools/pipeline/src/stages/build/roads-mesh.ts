// roads.mesh 섹션(M05-T01, 05 §4): 보도·교통섬 윗면(성형 윗면 + 6 mm, 2 m 격자 조각) + 연석 세로 면 + 바깥 가장자리 치마 →
// glb(머티리얼 terrain_ground — `_SURF` 1 보도·7 콘크리트 연석, 지형과 같은 스플랫). 차도·횡단보도는 성형 지형이 그린다(횡단경사 포함).
// 충돌용(윗면 + 연석, 치마 제외)도 함께 돌려준다. see docs/04-data-pipeline.md §4.3·§4.4-3
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../lib/gltf.ts';
import type { RoadRecord } from '../../readers/plateau/types.ts';
import { addEdges, classifyEdges, type EdgePiece, type EdgeStats, SURF_WALK } from '../derive/curbs.ts';
import { bilinear } from '../derive/grid.ts';
import { isWalk, type RoadIndex } from '../derive/roads.ts';
import { addWalkTop, emptyMesh, type MeshBuf, TOP_OFFSET_M, topWriter } from '../derive/sidewalks.ts';
import type { ShapedGround } from '../derive/terrain-shape.ts';
import { boundsOf, quantizePositions } from './buildings-mesh.ts';
import { remapVertices, TERRAIN_MATERIAL } from './terrain-mesh.ts';

const INT8_MAX = 127;

export interface RoadsBuild {
  glb: Uint8Array | null;
  vertices: number;
  tris: number;
  /** 충돌(보도 윗면). */
  collider: { pos: number[]; idx: number[] };
  edges: EdgeStats;
  walkPolygons: number;
}

/** 큰 배열은 전개 인자(push(...))가 스택을 넘으므로 반복으로 붙인다. */
function append(dst: MeshBuf, src: MeshBuf): void {
  const base = dst.pos.length / 3;
  for (const v of src.pos) dst.pos.push(v);
  for (const v of src.nrm) dst.nrm.push(v);
  for (const v of src.surf) dst.surf.push(v);
  for (const i of src.idx) dst.idx.push(base + i);
}

/** 위치 = u16 양자화(셀 로컬 AABB, 균일 스케일 ≈ 4 mm — 건물과 같은 방식, 윗면 +8 mm 여유 안), 법선 int8, `_SURF` u8. */
async function encode(m: MeshBuf): Promise<Uint8Array> {
  await MeshoptEncoder.ready;
  const indices = Uint32Array.from(m.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const { q, t, s } = quantizePositions(m.pos, boundsOf(m.pos));
  const nrm = Int8Array.from(m.nrm, (v) => Math.round(v * INT8_MAX));
  return encodeGlb({
    name: 'roads',
    translation: t,
    scale: s,
    primitives: [
      {
        materialId: TERRAIN_MATERIAL,
        attributes: {
          POSITION: { array: remapVertices(q, 3, remap, unique), itemSize: 3 },
          NORMAL: { array: remapVertices(nrm, 3, remap, unique), itemSize: 3, normalized: true },
          _SURF: { array: remapVertices(Uint8Array.from(m.surf), 1, remap, unique), itemSize: 1 },
        },
        indices,
      },
    ],
  });
}

/** 바깥 가장자리(치마 윗변) 위 윗면 정점을 지형 메시 높이 + 6 mm로(가장자리–지형 간극 0, 04 §4.3 수락 < 2 cm). */
function snapOuterTops(tops: MeshBuf, outer: readonly EdgePiece[], terrainAt: TerrainAt): void {
  const B = 2;
  const buckets = new Map<string, EdgePiece[]>();
  for (const e of outer) {
    for (let bz = Math.floor(Math.min(e.a[1], e.b[1]) / B); bz <= Math.floor(Math.max(e.a[1], e.b[1]) / B); bz++) {
      for (let bx = Math.floor(Math.min(e.a[0], e.b[0]) / B); bx <= Math.floor(Math.max(e.a[0], e.b[0]) / B); bx++) {
        const k = `${bx},${bz}`;
        buckets.set(k, [...(buckets.get(k) ?? []), e]);
      }
    }
  }
  for (let v = 0; v < tops.pos.length / 3; v++) {
    const x = tops.pos[v * 3] as number;
    const z = tops.pos[v * 3 + 2] as number;
    const on = (buckets.get(`${Math.floor(x / B)},${Math.floor(z / B)}`) ?? []).some((e) => segDist(e, x, z) < SNAP_M);
    const t = on ? terrainAt(x, z) : undefined;
    if (t !== undefined) tops.pos[v * 3 + 1] = t + TOP_OFFSET_M;
  }
}

const SNAP_M = 0.002;

function segDist(e: EdgePiece, x: number, z: number): number {
  const [ax, az] = e.a;
  const [bx, bz] = e.b;
  const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
  const t = Math.min(Math.max(((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2, 0), 1);
  return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
}

export type TerrainAt = (x: number, z: number) => number | undefined;

/**
 * walks = 이 셀의 도로 조각(보행면만 쓴다), index = 셀 + 8-이웃 분류, ox·oz = 셀 원점 WF,
 * terrainAt = 완성된 지형 메시 높이(있으면 바깥 가장자리 정점·치마 윗변을 지형에 맞춘다).
 */
export async function buildRoads(
  records: readonly RoadRecord[],
  index: RoadIndex,
  ox: number,
  oz: number,
  shaped: ShapedGround,
  terrainAt?: TerrainAt,
): Promise<RoadsBuild> {
  const top = (x: number, z: number): number => bilinear(shaped.grid, shaped.top, x, z);
  const base = (x: number, z: number): number => bilinear(shaped.grid, shaped.base, x, z);
  const outerTop = (x: number, z: number): number => terrainAt?.(x, z) ?? top(x, z);
  const tops = emptyMesh();
  const edgesMesh = emptyMesh();
  const writer = topWriter(tops, top, SURF_WALK);
  const edges: EdgeStats = { curbM: 0, outerM: 0 };
  const walks = records.filter(isWalk);
  const pieces: EdgePiece[] = [];
  for (const r of walks) {
    addWalkTop(tops, writer, r, ox, oz);
    pieces.push(...classifyEdges(r, ox, oz, index, edges));
  }
  if (terrainAt)
    snapOuterTops(
      tops,
      pieces.filter((e) => e.kind === 'outer'),
      terrainAt,
    );
  addEdges(edgesMesh, pieces, top, base, outerTop);
  const all = emptyMesh();
  append(all, tops);
  append(all, edgesMesh);
  // 충돌 = 보도 윗면만(TERRAIN 층) — 연석 세로 면은 넣지 않는다: 윗면 삼각형 가장자리가 0.15 m 계단(캐릭터 계단 0.40 m, 양면 충돌)이 되고
  // 콜라이더가 셀당 ≈ 40–60 KB 작아진다(world-mini ≤ 5 MB).
  const collider = { pos: Array.from(tops.pos), idx: Array.from(tops.idx) };
  const tris = all.idx.length / 3;
  return {
    glb: tris > 0 ? await encode(all) : null,
    vertices: all.pos.length / 3,
    tris,
    collider,
    edges,
    walkPolygons: walks.length,
  };
}
