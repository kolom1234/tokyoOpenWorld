// buildings.mesh 섹션 + meta.buildings: 건물 면 삼각분할(평면 법선) → u16 양자화(균일 스케일) → glb. see docs/04-data-pipeline.md §4.4-2, docs/05-tile-format.md §4
// 벽 UV0 = (면 시작점부터 수평 거리, 건물 바닥부터 높이), TEXCOORD_1 = (면 폭, 건물 높이), `_FACADE` = facade-params(M03-T04).
import type { MetaBuilding, Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../lib/gltf.ts';
import { triangulateRings, type Vec3 } from '../../lib/triangulate.ts';
import type { BuildingRecord, SurfaceKind } from '../../readers/plateau/types.ts';
import { facadeParams } from './facade-params.ts';
import { remapVertices } from './terrain-mesh.ts';
import { coplanarWithAny, type WallSpan, wallSpans } from './wall-planes.ts';

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
  /** 충돌용 원본 스트림(셀 로컬 xyz·삼각형 인덱스, 양자화 전) — collision.ts가 용접·단순화. */
  collision: { pos: Float32Array; idx: Uint32Array };
}

/** 정점 스트림(셀 로컬, 양자화 전). */
class Stream {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  /** TEXCOORD_1 = (면 폭 m, 건물 높이 m). 지붕은 (0, 건물 높이). */
  uv1: number[] = [];
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

/** 건물 한 동의 면 공통 값. */
interface BuildingCtx {
  index: number;
  facade: number[];
  /** 건물 최저 정점 y(셀 로컬) — 벽 v 기준. */
  baseY: number;
  heightM: number;
}

type Tri = NonNullable<ReturnType<typeof triangulateRings>>;

/**
 * 삼각분할된 면 1개를 스트림에 추가. 반환 = 추가 삼각형 수.
 * 벽: UV0 = (공유 u 원점부터, 건물 바닥부터), UV1.x = 공유 면 폭(wall-planes). `span` 없음 = 부속물(간판·핀·발코니 등) → 폭 0 = 창 없음.
 */
function addSurface(s: Stream, t: Tri, b: BuildingCtx, span: WallSpan | undefined): number {
  const n: Vec3 = t.normal;
  const base = s.count;
  const wall = Math.abs(n[1]) < WALL_NY;
  const th = Math.hypot(n[2], n[0]) || 1;
  const [tx, tz] = span ? [span.tx, span.tz] : [n[2] / th, -n[0] / th];
  let u0 = span?.u0 ?? Number.POSITIVE_INFINITY;
  if (!span)
    for (let i = 0; i < t.vertices.length; i += 3)
      u0 = Math.min(u0, (t.vertices[i] as number) * tx + (t.vertices[i + 2] as number) * tz);
  const width = wall && span ? span.u1 - span.u0 : 0;
  for (let i = 0; i < t.vertices.length; i += 3) {
    const [x, y, z] = [t.vertices[i], t.vertices[i + 1], t.vertices[i + 2]] as number[];
    s.pos.push(x as number, y as number, z as number);
    s.nrm.push(...n.map((c) => Math.round(c * INT8_MAX)));
    if (wall) s.uv.push((x as number) * tx + (z as number) * tz - u0, (y as number) - b.baseY);
    else s.uv.push(x as number, z as number);
    s.uv1.push(width, b.heightM);
    s.bldg.push(b.index);
    s.facade.push(...b.facade);
  }
  for (const k of t.triangles) s.idx.push(base + k);
  return t.triangles.length / 3;
}

/** 건물 한 동: 렌더 면 삼각분할 → (부속물 제외) 벽 평면 묶기 → 스트림. 반환 = 삼각형 수. */
function addBuilding(s: Stream, b: BuildingRecord, ctx: BuildingCtx, originWF: Vec3Tuple): number {
  const faces: { t: Tri; plainOrRoof: boolean }[] = [];
  for (const surf of b.surfaces) {
    if (!RENDER_KINDS.has(surf.kind)) continue;
    const t = triangulateRings(localRings(surf.ringsWF, originWF));
    if (!t) continue;
    faces.push({ t, plainOrRoof: surf.kind === 'installation' || Math.abs(t.normal[1]) >= WALL_NY });
  }
  const walls = faces.filter((f) => !f.plainOrRoof);
  const wallFaces = walls.map((f) => ({ normal: f.t.normal, vertices: f.t.vertices }));
  const spans = wallSpans(wallFaces);
  let tris = 0;
  let w = 0;
  for (const f of faces) {
    if (!f.plainOrRoof) tris += addSurface(s, f.t, ctx, spans[w++]);
    // 벽과 동일 평면인 부속물(벽에 붙은 간판판 등)은 z-파이팅만 만든다 → 제외.
    else if (
      Math.abs(f.t.normal[1]) >= WALL_NY ||
      !coplanarWithAny({ normal: f.t.normal, vertices: f.t.vertices }, wallFaces)
    )
      tris += addSurface(s, f.t, ctx, undefined);
  }
  return tris;
}

/** 건물 렌더 면 최저 y(WF). */
function minY(b: BuildingRecord): number {
  let lo = Number.POSITIVE_INFINITY;
  for (const s of b.surfaces) {
    if (!RENDER_KINDS.has(s.kind) && s.kind !== 'ground') continue;
    for (const r of s.ringsWF) for (let i = 1; i < r.length; i += 3) lo = Math.min(lo, r[i] as number);
  }
  return Number.isFinite(lo) ? lo : 0;
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

export function boundsOf(pos: readonly number[]): Aabb {
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

/**
 * 셀 건물 레코드 → buildings.mesh glb + meta.buildings. 결정론(gmlId 순, meshopt 재정렬).
 * renderSkip(M05-T05 랜드마크 오버라이드가 대체하는 gmlId)은 렌더에서 빼고 충돌·meta에는 남긴다.
 */
export async function buildBuildings(
  records: readonly BuildingRecord[],
  originWF: Vec3Tuple,
  renderSkip: ReadonlySet<string> = new Set(),
  colliderSkip: ReadonlySet<string> = new Set(),
): Promise<BuildingsBuild> {
  const sorted = [...records].sort((a, b) => (a.gmlId < b.gmlId ? -1 : a.gmlId > b.gmlId ? 1 : 0));
  const s = new Stream();
  const skipped = new Stream();
  const meta: MetaBuilding[] = [];
  /** 렌더에는 넣고 충돌에서 뺄 s.idx 구간(선로 위 건물, M07-T04). */
  const noCol: [number, number][] = [];
  let tris = 0;
  for (const [i, b] of sorted.entries()) {
    const h = heightOf(b);
    meta.push(metaOf(b, h));
    const facade = facadeParams({ id: b.gmlId, usage: b.usage, heightM: h, floors: floorsOf(b, h) });
    const ctx: BuildingCtx = { index: i, facade, baseY: minY(b) - originWF[1], heightM: h };
    const col = !colliderSkip.has(b.gmlId);
    if (renderSkip.has(b.gmlId)) {
      if (col) addBuilding(skipped, b, ctx, originWF);
      continue;
    }
    const i0 = s.idx.length;
    tris += addBuilding(s, b, ctx, originWF);
    if (!col) noCol.push([i0, s.idx.length]);
  }
  const sources = [...new Set(sorted.map((b) => b.source))].sort();
  const keep = s.idx.filter((_, k) => !noCol.some(([a, e]) => k >= a && k < e));
  const collision = {
    pos: Float32Array.from([...s.pos, ...skipped.pos]),
    idx: Uint32Array.from([...keep, ...skipped.idx.map((k) => k + s.count)]),
  };
  if (s.count === 0) return { glb: null, meta, aabbLocal: null, vertices: 0, tris: 0, sources, collision };
  const aabbLocal = boundsOf(s.pos);
  const glb = await encodeBuildings(s, aabbLocal);
  return { glb, meta, aabbLocal, vertices: s.count, tris, sources, collision };
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
          TEXCOORD_1: { array: re(Float32Array.from(s.uv1), 2), itemSize: 2 },
          _BLDG: { array: re(Uint16Array.from(s.bldg), 1), itemSize: 1 },
          _FACADE: { array: re(Uint8Array.from(s.facade), 4), itemSize: 4 },
        },
        indices,
      },
    ],
  });
}
