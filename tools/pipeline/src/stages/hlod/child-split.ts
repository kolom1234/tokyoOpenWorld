// HLOD 자식 16영역 분할: 자식 인덱스, 자식별 지형 패치(RTIN + 스커트), 머티리얼별 프리미티브 + `_CHILD` 정점 속성 → 한 glb.
// 불변식: 모든 정점의 _CHILD ∈ 0..15, 자식 지형 패치 16개가 부모 정사각형을 빈틈없이 덮는다. see docs/05-tile-format.md §4(hlod.mesh), docs/06 §5
import { type CellKey, type CellLevel, packCellKey, unpackCellKey } from '@sanpo/core';
import { CELL_SIZES, hlodChildIndex } from '@sanpo/geo';
import type { Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb, type GlbPrimitive } from '../../lib/gltf.ts';
import { BUILDING_MATERIAL, quantizePositions } from '../build/buildings-mesh.ts';
import { SURF } from '../build/surface-class.ts';
import { remapVertices, TERRAIN_MATERIAL } from '../build/terrain-mesh.ts';
import { rtinTriangulate } from '../build/terrain-rtin.ts';

export const CHILDREN = 16;
/** 자식 지형 패치 격자(2^6 + 1). 자식 한 변 / 64 = 간격(L1 4 m, L2 16 m, L3 64 m). */
export const PATCH_N = 65;
const INT8_MAX = 127;

/** 자식 16개 키(자식 인덱스 순, 05 §4: (iz mod 4)·4 + (ix mod 4)). */
export function childKeys(parent: CellKey): CellKey[] {
  const { level, ix, iz } = unpackCellKey(parent);
  if (level === 0) throw new RangeError('childKeys: L0 has no children');
  const out: CellKey[] = new Array(CHILDREN);
  for (let dz = 0; dz < 4; dz++) {
    for (let dx = 0; dx < 4; dx++) {
      const k = packCellKey((level - 1) as CellLevel, ix * 4 + dx, iz * 4 + dz);
      out[hlodChildIndex(k)] = k;
    }
  }
  return out;
}

/** 정점 스트림(부모 셀 로컬, 양자화 전). 지형은 uv·facade 없음. */
export class MeshStream {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  facade: number[] = [];
  idx: number[] = [];
  get count(): number {
    return this.pos.length / 3;
  }
  get tris(): number {
    return this.idx.length / 3;
  }
}

export interface ChildGeometry {
  terrain: MeshStream;
  buildings: MeshStream;
}

export function emptyChildren(): ChildGeometry[] {
  return Array.from({ length: CHILDREN }, () => ({ terrain: new MeshStream(), buildings: new MeshStream() }));
}

/** 높이 함수(WF x, z → y). */
export type HeightFn = (x: number, z: number) => number;

export interface PatchSpec {
  /** 자식 셀 WF 원점(북서 모서리). */
  x0: number;
  z0: number;
  size: number;
  /** 부모 셀 WF 원점(스트림 좌표 = WF − 이것). */
  ox: number;
  oz: number;
  /** RTIN 수직 오차(m). */
  maxError: number;
  /** 가장자리 아래로 내리는 스커트 깊이(m) — 이웃(다른 레벨) 패치와의 T-접합 틈을 가린다. */
  skirt: number;
}

function normalAt(h: HeightFn, x: number, z: number, step: number): [number, number, number] {
  const gx = (h(x + step, z) - h(x - step, z)) / (2 * step);
  const gz = (h(x, z + step) - h(x, z - step)) / (2 * step);
  const len = Math.hypot(gx, 1, gz);
  return [Math.round((-gx / len) * INT8_MAX), Math.round((1 / len) * INT8_MAX), Math.round((-gz / len) * INT8_MAX)];
}

/** 스커트 삼각형 1쌍: 윗변 a→b, 아래 a'·b'. 바깥 방향(out)을 보게 감기 보정. */
function skirtQuad(s: MeshStream, a: number, b: number, depth: number, out: [number, number]): void {
  const base = s.count;
  for (const v of [a, b]) {
    s.pos.push(s.pos[v * 3] as number, (s.pos[v * 3 + 1] as number) - depth, s.pos[v * 3 + 2] as number);
    s.nrm.push(s.nrm[v * 3] as number, s.nrm[v * 3 + 1] as number, s.nrm[v * 3 + 2] as number);
  }
  const [a2, b2] = [base, base + 1];
  const ex = (s.pos[b * 3] as number) - (s.pos[a * 3] as number);
  const ez = (s.pos[b * 3 + 2] as number) - (s.pos[a * 3 + 2] as number);
  // (b − a) × (a' − a) = (ex,·,ez) × (0,−d,0) → 수평 성분 (ez·d, −ex·d) 방향
  const facesOut = ez * out[0] - ex * out[1] > 0;
  if (facesOut) s.idx.push(a, b, a2, b, b2, a2);
  else s.idx.push(a, a2, b, b, a2, b2);
}

/** 자식 영역 지형 패치(RTIN, 경계 정점 전부 유지) + 네 변 스커트 → stream. */
export function addTerrainPatch(s: MeshStream, h: HeightFn, p: PatchSpec): void {
  const n = PATCH_N;
  const step = p.size / (n - 1);
  const grid = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) grid[j * n + i] = h(p.x0 + i * step, p.z0 + j * step);
  const tri = rtinTriangulate(grid, n, p.maxError);
  const map = new Int32Array(n * n).fill(-1);
  const vert = (g: number): number => {
    let v = map[g] as number;
    if (v >= 0) return v;
    v = s.count;
    map[g] = v;
    const [i, j] = [g % n, Math.floor(g / n)];
    const [x, z] = [p.x0 + i * step, p.z0 + j * step];
    s.pos.push(x - p.ox, grid[g] as number, z - p.oz);
    s.nrm.push(...normalAt(h, x, z, step));
    return v;
  };
  for (const g of tri) s.idx.push(vert(g));
  if (p.skirt <= 0) return;
  const sides: Array<{ at: (t: number) => number; out: [number, number] }> = [
    { at: (t) => t, out: [0, -1] }, // 북(z0)
    { at: (t) => (n - 1) * n + t, out: [0, 1] }, // 남
    { at: (t) => t * n, out: [-1, 0] }, // 서
    { at: (t) => t * n + n - 1, out: [1, 0] }, // 동
  ];
  for (const side of sides) {
    for (let t = 0; t + 1 < n; t++) skirtQuad(s, vert(side.at(t)), vert(side.at(t + 1)), p.skirt, side.out);
  }
}

/** 자식 셀의 지형 패치 사양(부모 기준 로컬 원점·오차·스커트). */
export function patchOf(parent: CellKey, child: CellKey, maxError: number, skirt: number): PatchSpec {
  const pl = unpackCellKey(parent);
  const cl = unpackCellKey(child);
  const ps = CELL_SIZES[pl.level];
  const cs = CELL_SIZES[cl.level];
  return { x0: cl.ix * cs, z0: cl.iz * cs, size: cs, ox: pl.ix * ps, oz: pl.iz * ps, maxError, skirt };
}

/** 자식 스트림들을 이어 붙인 한 머티리얼의 스트림 + 정점별 자식 인덱스. */
function concat(children: readonly ChildGeometry[], kind: 'terrain' | 'buildings'): { s: MeshStream; child: number[] } {
  const out = new MeshStream();
  const child: number[] = [];
  for (const [ci, c] of children.entries()) {
    const src = c[kind];
    const base = out.count;
    // 스프레드(push(...a))는 큰 배열에서 호출 스택을 넘긴다 → 루프.
    for (const [dst, from] of [
      [out.pos, src.pos],
      [out.nrm, src.nrm],
      [out.uv, src.uv],
      [out.facade, src.facade],
    ] as const) {
      for (const v of from) dst.push(v);
    }
    for (const i of src.idx) out.idx.push(base + i);
    for (let v = 0; v < src.count; v++) child.push(ci);
  }
  return { s: out, child };
}

function primitive(
  s: MeshStream,
  q: Uint16Array,
  kind: 'terrain' | 'buildings',
  child: readonly number[],
): GlbPrimitive {
  const indices = Uint32Array.from(s.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const re = <T extends Uint16Array | Int8Array | Float32Array | Uint8Array>(a: T, n: number): T =>
    remapVertices(a, n, remap, unique);
  const attributes: GlbPrimitive['attributes'] = {
    POSITION: { array: re(q, 3), itemSize: 3 },
    NORMAL: { array: re(Int8Array.from(s.nrm), 3), itemSize: 3, normalized: true },
  };
  if (kind === 'terrain') attributes._SURF = { array: new Uint8Array(unique).fill(SURF.plaza), itemSize: 1 };
  else {
    attributes.TEXCOORD_0 = { array: re(Float32Array.from(s.uv), 2), itemSize: 2 };
    attributes._FACADE = { array: re(Uint8Array.from(s.facade), 4), itemSize: 4 };
  }
  attributes._CHILD = { array: re(Uint8Array.from(child), 1), itemSize: 1 };
  const materialId = kind === 'terrain' ? TERRAIN_MATERIAL : BUILDING_MATERIAL;
  return { materialId, attributes, indices };
}

export interface HlodEncoded {
  glb: Uint8Array;
  /** 부모 로컬 AABB(양자화 전). */
  aabbLocal: { min: Vec3Tuple; max: Vec3Tuple };
  tris: number;
  materials: string[];
}

/**
 * 자식별 스트림 → hlod.mesh glb: 머티리얼별 프리미티브 1개(지형 → 건물) + 정점 속성 `_CHILD`(u8, 0..15, ADR-0024).
 * 렌더는 셀당 draw 2개로 그리고 자식 표시·페이드를 셰이더 uniform으로 고른다. 모든 프리미티브가 한 노드 변환(u16 균일 양자화)을 공유.
 */
export async function encodeHlod(children: readonly ChildGeometry[]): Promise<HlodEncoded> {
  await MeshoptEncoder.ready;
  const min: Vec3Tuple = [Infinity, Infinity, Infinity];
  const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
  for (const c of children) {
    for (const s of [c.terrain, c.buildings]) {
      for (let i = 0; i < s.pos.length; i++) {
        const k = i % 3;
        min[k] = Math.min(min[k] as number, s.pos[i] as number);
        max[k] = Math.max(max[k] as number, s.pos[i] as number);
      }
    }
  }
  const aabbLocal = { min, max };
  const prims: GlbPrimitive[] = [];
  let t = [0, 0, 0] as Vec3Tuple;
  let scale = 1;
  let tris = 0;
  for (const kind of ['terrain', 'buildings'] as const) {
    const { s, child } = concat(children, kind);
    if (s.tris === 0) continue;
    const qz = quantizePositions(s.pos, aabbLocal);
    [t, scale] = [qz.t, qz.s];
    prims.push(primitive(s, qz.q, kind, child));
    tris += s.tris;
  }
  const glb = await encodeGlb({ name: 'hlod', translation: t, scale, primitives: prims });
  return { glb, aabbLocal, tris, materials: [...new Set(prims.map((p) => p.materialId))].sort() };
}
