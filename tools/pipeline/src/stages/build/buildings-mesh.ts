// buildings.mesh 섹션 + meta.buildings: 건물 면 삼각분할(평면 법선) → u16 양자화(균일 스케일) → glb. see docs/04-data-pipeline.md §4.4-2, docs/05-tile-format.md §4
import type { MetaBuilding, Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../lib/gltf.ts';
import { triangulateRings, type Vec3 } from '../../lib/triangulate.ts';
import type { BuildingRecord, SurfaceKind } from '../../readers/plateau/types.ts';
import { remapVertices } from './terrain-mesh.ts';

export const BUILDING_MATERIAL = 'facade_default';
/** 렌더 대상 면. ground(바닥)·closure(가상 폐합면)는 보이지 않으므로 제외. */
const RENDER_KINDS: ReadonlySet<SurfaceKind> = new Set(['roof', 'wall', 'installation']);
/** |n.y|가 이보다 작으면 벽 UV(u = 수평 벽 길이, v = 높이), 크면 지붕 UV(u = x, v = z). */
const WALL_NY = 0.7;
/** storeys가 없을 때 층수 추정용 층고(m). */
const STOREY_M = 3.5;
const U16_MAX = 0xffff;
const INT8_MAX = 127;

export interface Aabb {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

export interface BuildingsBuild {
  /** 렌더 면이 하나도 없으면 null(섹션 생략). */
  glb: Uint8Array | null;
  /** 셀 내 건물 목록(`_BLDG` = 이 배열 인덱스), gmlId 사전순. */
  meta: MetaBuilding[];
  /** 셀 로컬 AABB(건물 정점), 없으면 null. */
  aabbLocal: Aabb | null;
  vertices: number;
  tris: number;
  sources: string[];
}

/** 정점 스트림(셀 로컬, 양자화 전). */
class Stream {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  bldg: number[] = [];
  facade: number[] = [];
  idx: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
}

function floorsOf(b: BuildingRecord, heightM: number): number {
  const f = b.storeys ?? Math.round(heightM / STOREY_M);
  return Math.min(Math.max(f, 1), 255);
}

function localRings(rings: readonly (readonly number[])[], o: Vec3Tuple): number[][] {
  return rings.map((r) => r.map((v, i) => v - (o[i % 3] as number)));
}

/** 면 1개를 스트림에 추가. 반환 = 추가 삼각형 수. */
function addSurface(s: Stream, rings: number[][], bIndex: number, facade: number[]): number {
  const t = triangulateRings(rings);
  if (!t) return 0;
  const n: Vec3 = t.normal;
  const base = s.count;
  const wall = Math.abs(n[1]) < WALL_NY;
  const th = Math.hypot(n[2], n[0]) || 1;
  const [tx, tz] = [n[2] / th, -n[0] / th]; // 수평 접선 = up × n
  for (let i = 0; i < t.vertices.length; i += 3) {
    const [x, y, z] = [t.vertices[i], t.vertices[i + 1], t.vertices[i + 2]] as number[];
    s.pos.push(x as number, y as number, z as number);
    s.nrm.push(...n.map((c) => Math.round(c * INT8_MAX)));
    if (wall) s.uv.push((x as number) * tx + (z as number) * tz, y as number);
    else s.uv.push(x as number, z as number);
    s.bldg.push(bIndex);
    s.facade.push(...facade);
  }
  for (const k of t.triangles) s.idx.push(base + k);
  return t.triangles.length / 3;
}

function heightOf(b: BuildingRecord): number {
  if (b.measuredHeightM !== null) return b.measuredHeightM;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of b.surfaces) {
    for (const r of s.ringsWF) {
      for (let i = 1; i < r.length; i += 3) {
        lo = Math.min(lo, r[i] as number);
        hi = Math.max(hi, r[i] as number);
      }
    }
  }
  return hi > lo ? hi - lo : 0;
}

function metaOf(b: BuildingRecord, heightM: number): MetaBuilding {
  const m: MetaBuilding = { gmlId: b.gmlId, usage: b.usage ?? '', height: Math.round(heightM * 100) / 100 };
  if (b.storeys !== null) m.storeys = b.storeys;
  return m;
}

function boundsOf(pos: readonly number[]): Aabb {
  const min: Vec3Tuple = [Infinity, Infinity, Infinity];
  const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    const k = i % 3;
    min[k] = Math.min(min[k] as number, pos[i] as number);
    max[k] = Math.max(max[k] as number, pos[i] as number);
  }
  return { min, max };
}

/** 셀 로컬 위치 → u16(비정규) + 노드 역변환(translation = min, 균일 scale). 값은 f32로 반올림해 GPU 역변환과 일치. */
export function quantizePositions(pos: readonly number[], b: Aabb): { q: Uint16Array; t: Vec3Tuple; s: number } {
  const t = b.min.map(Math.fround) as Vec3Tuple;
  const extent = Math.max(b.max[0] - t[0], b.max[1] - t[1], b.max[2] - t[2]);
  const s = Math.fround(extent > 0 ? extent / U16_MAX : 1);
  const q = new Uint16Array(pos.length);
  for (let i = 0; i < pos.length; i++) {
    q[i] = Math.min(Math.max(Math.round(((pos[i] as number) - (t[i % 3] as number)) / s), 0), U16_MAX);
  }
  return { q, t, s };
}

/** 셀 건물 레코드 → buildings.mesh glb + meta.buildings. 결정론(gmlId 순, meshopt 재정렬). */
export async function buildBuildings(records: readonly BuildingRecord[], originWF: Vec3Tuple): Promise<BuildingsBuild> {
  const sorted = [...records].sort((a, b) => (a.gmlId < b.gmlId ? -1 : a.gmlId > b.gmlId ? 1 : 0));
  const s = new Stream();
  const meta: MetaBuilding[] = [];
  let tris = 0;
  for (const [i, b] of sorted.entries()) {
    const h = heightOf(b);
    meta.push(metaOf(b, h));
    const facade = [0, floorsOf(b, h), 0, 0]; // class, floors, tintIdx, flags — M05 파사드 파라미터 전 기본값
    for (const surf of b.surfaces) {
      if (RENDER_KINDS.has(surf.kind)) tris += addSurface(s, localRings(surf.ringsWF, originWF), i, facade);
    }
  }
  const sources = [...new Set(sorted.map((b) => b.source))].sort();
  if (s.count === 0) return { glb: null, meta, aabbLocal: null, vertices: 0, tris: 0, sources };
  const aabbLocal = boundsOf(s.pos);
  const glb = await encodeBuildings(s, aabbLocal);
  return { glb, meta, aabbLocal, vertices: s.count, tris, sources };
}

async function encodeBuildings(s: Stream, b: Aabb): Promise<Uint8Array> {
  await MeshoptEncoder.ready;
  const indices = Uint32Array.from(s.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const { q, t, s: scale } = quantizePositions(s.pos, b);
  const re = <T extends Uint16Array | Int8Array | Float32Array | Uint8Array>(a: T, n: number): T =>
    remapVertices(a, n, remap, unique);
  return encodeGlb({
    name: 'buildings',
    translation: t,
    scale,
    primitives: [
      {
        materialId: BUILDING_MATERIAL,
        attributes: {
          POSITION: { array: re(q, 3), itemSize: 3 },
          NORMAL: { array: re(Int8Array.from(s.nrm), 3), itemSize: 3, normalized: true },
          TEXCOORD_0: { array: re(Float32Array.from(s.uv), 2), itemSize: 2 },
          _BLDG: { array: re(Uint16Array.from(s.bldg), 1), itemSize: 1 },
          _FACADE: { array: re(Uint8Array.from(s.facade), 4), itemSize: 4 },
        },
        indices,
      },
    ],
  });
}
