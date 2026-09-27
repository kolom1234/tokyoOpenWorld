// terrain.mesh 섹션: 1 m 격자 → RTIN 단순화(정확 오차 ≤ 5 cm, 경계 정점 잠금) → meshopt 재정렬 → glb. see docs/04-data-pipeline.md §4.4-1, §6, docs/adr/0018-cell-mesh-build.md
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../lib/gltf.ts';
import { type CellWindow, sampleAt } from './dem-window.ts';
import { rtinTriangulate } from './terrain-rtin.ts';

/** 단순화 허용 오차(m): 모든 1 m 격자 샘플에서 메시 수직 오차 상한. docs/04 §4.4-1. */
export const TERRAIN_SIMPLIFY_ERROR_M = 0.05;
export const TERRAIN_MATERIAL = 'terrain_ground';
/** `_SURF` 기본값 7 = plaza(포장 지면). TODO(M03): 도로·녹지 레이어로 면 분류. */
export const SURF_DEFAULT = 7;
const INT8_MAX = 127;

/**
 * 단순화된 지형. positions = 셀 로컬 float32 (x, h, z) — 경계 정점 높이를 DEM 값 그대로(비트 동일) 두려고 양자화하지 않는다.
 * normals = int8 정규화(KHR_mesh_quantization, 패딩 없이 3성분).
 */
export interface TerrainGeometry {
  positions: Float32Array;
  normals: Int8Array;
  surf: Uint8Array;
  indices: Uint32Array;
}

/** 전체 격자 정점(로컬 x = 열, z = 행, y = DEM). */
function gridPositions(w: CellWindow): Float32Array {
  const n = w.size;
  const out = new Float32Array(n * n * 3);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) out.set([x, sampleAt(w, x, z), z], (z * n + x) * 3);
  }
  return out;
}

/** 중앙 차분 법선(여유 샘플 사용 → 셀 경계에서도 이웃과 같은 값). */
function gridNormals(w: CellWindow): Int8Array {
  const n = w.size;
  const out = new Int8Array(n * n * 3);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const gx = (sampleAt(w, x + 1, z) - sampleAt(w, x - 1, z)) / 2;
      const gz = (sampleAt(w, x, z + 1) - sampleAt(w, x, z - 1)) / 2;
      const len = Math.hypot(gx, 1, gz);
      const i = (z * n + x) * 3;
      out[i] = Math.round((-gx / len) * INT8_MAX);
      out[i + 1] = Math.round((1 / len) * INT8_MAX);
      out[i + 2] = Math.round((-gz / len) * INT8_MAX);
    }
  }
  return out;
}

/** remap(old → new, 미사용 = 0xFFFFFFFF)대로 itemSize 성분 배열을 압축. */
export function remapVertices<T extends Float32Array | Int8Array | Uint8Array | Uint16Array>(
  src: T,
  itemSize: number,
  remap: Uint32Array,
  unique: number,
): T {
  const out = new (src.constructor as new (n: number) => T)(unique * itemSize);
  for (let v = 0; v < remap.length; v++) {
    const to = remap[v] as number;
    if (to === 0xffffffff) continue;
    for (let k = 0; k < itemSize; k++) out[to * itemSize + k] = src[v * itemSize + k] as number;
  }
  return out;
}

/** 셀 창의 257² 높이(행 = z). */
function gridHeights(w: CellWindow): Float64Array {
  const n = w.size;
  const h = new Float64Array(n * n);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) h[z * n + x] = sampleAt(w, x, z);
  return h;
}

/** 셀 창 → RTIN 단순화·정점 캐시 재정렬된 지형 기하. 결정론(입력만으로 결과가 정해진다). */
export async function buildTerrainGeometry(w: CellWindow): Promise<TerrainGeometry> {
  await MeshoptEncoder.ready;
  const indices = rtinTriangulate(gridHeights(w), w.size, TERRAIN_SIMPLIFY_ERROR_M);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const positions = remapVertices(gridPositions(w), 3, remap, unique);
  const normals = remapVertices(gridNormals(w), 3, remap, unique);
  return { positions, normals, surf: new Uint8Array(unique).fill(SURF_DEFAULT), indices };
}

/** 지형 기하 → terrain.mesh glb(노드 항등 변환). */
export function encodeTerrainMesh(g: TerrainGeometry): Promise<Uint8Array> {
  return encodeGlb({
    name: 'terrain',
    primitives: [
      {
        materialId: TERRAIN_MATERIAL,
        attributes: {
          POSITION: { array: g.positions, itemSize: 3 },
          NORMAL: { array: g.normals, itemSize: 3, normalized: true },
          _SURF: { array: g.surf, itemSize: 1 },
        },
        indices: g.indices,
      },
    ],
  });
}
