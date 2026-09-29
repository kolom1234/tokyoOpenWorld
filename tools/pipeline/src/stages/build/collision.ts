// collision.bin 섹션(04 §4.4-6, 05 §6): 건물 렌더 면(벽·지붕·부속물) → 1 mm 용접 → meshopt 단순화(절대 오차 0.3 m) →
// 64 m 블록 순으로 삼각형을 정렬해 ≤ MAX_CHUNK_TRIS 청크로 자른다(JCOL triMesh 여러 개 — 물리 워커가 청크 하나를 한 틱에 적재, Jolt 메시 생성 ≈ 1.5 ms/1000 삼각형, ADR-0042).
// 연석·충돌 소품·나무 줄기 프리미티브는 도로 메시(M04-T04)·소품(M05) 데이터가 생기면 여기서 추가.
import { gzip, JCOL_MATERIAL, type JcolShape, writeJcol } from '@sanpo/tile-format';
import { MeshoptSimplifier } from 'meshoptimizer';

/** 04 §4.4-6: 건물 단순화 절대 오차(m). */
export const SIMPLIFY_ERROR_M = 0.3;
/** 청크 삼각형 상한(워커 적재 틱 ≤ 8 ms, 08 §4). */
export const MAX_CHUNK_TRIS = 2500;
/** 청크 정렬 블록(m) — 셀 256 m를 4 × 4. */
const BLOCK_M = 64;
/** 08 §3 STATIC_WORLD. */
const LAYER_STATIC_WORLD = 0;
const WELD_M = 0.001;

export interface CollisionBuild {
  /** gzip된 JCOL, 삼각형이 없으면 null. */
  data: Uint8Array | null;
  tris: number;
  shapes: number;
  /** 단순화 전 삼각형 수(용접 후). */
  sourceTris: number;
}

/** 위치(xyz 스트림)를 1 mm 격자로 합쳐 인덱스 메시로. 퇴화 삼각형 제거. */
export function weld(pos: ArrayLike<number>, idx: ArrayLike<number>): { pos: Float32Array; idx: Uint32Array } {
  const map = new Map<string, number>();
  const outPos: number[] = [];
  const remap = new Uint32Array(pos.length / 3);
  for (let v = 0; v < remap.length; v++) {
    const x = Math.round((pos[v * 3] as number) / WELD_M);
    const y = Math.round((pos[v * 3 + 1] as number) / WELD_M);
    const z = Math.round((pos[v * 3 + 2] as number) / WELD_M);
    const k = `${x},${y},${z}`;
    let i = map.get(k);
    if (i === undefined) {
      i = outPos.length / 3;
      map.set(k, i);
      outPos.push(x * WELD_M, y * WELD_M, z * WELD_M);
    }
    remap[v] = i;
  }
  const outIdx: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = remap[idx[t] as number] as number;
    const b = remap[idx[t + 1] as number] as number;
    const c = remap[idx[t + 2] as number] as number;
    if (a !== b && b !== c && a !== c) outIdx.push(a, b, c);
  }
  return { pos: Float32Array.from(outPos), idx: Uint32Array.from(outIdx) };
}

/** 삼각형을 무게중심의 64 m 블록(행 z, 열 x) 순으로 — 같은 블록은 원래 순서(결정론). */
function blockOrder(pos: Float32Array, idx: Uint32Array): number[] {
  const n = idx.length / 3;
  const key = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    let cx = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k] as number;
      cx += pos[v * 3] as number;
      cz += pos[v * 3 + 2] as number;
    }
    const bx = Math.floor(cx / 3 / BLOCK_M);
    const bz = Math.floor(cz / 3 / BLOCK_M);
    key[t] = (bz + 64) * 256 + (bx + 64);
  }
  return Array.from({ length: n }, (_, t) => t).sort((a, b) => (key[a] as number) - (key[b] as number) || a - b);
}

/** 삼각형 목록 → 쓰인 정점만 모은 triMesh. */
function chunkShape(pos: Float32Array, idx: Uint32Array, tris: readonly number[]): JcolShape {
  const local = new Map<number, number>();
  const v: number[] = [];
  const out = new Uint32Array(tris.length * 3);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const g = idx[t * 3 + k] as number;
      let l = local.get(g);
      if (l === undefined) {
        l = v.length / 3;
        local.set(g, l);
        v.push(pos[g * 3] as number, pos[g * 3 + 1] as number, pos[g * 3 + 2] as number);
      }
      out[i * 3 + k] = l;
    }
  });
  return {
    kind: 'triMesh',
    layer: LAYER_STATIC_WORLD,
    material: JCOL_MATERIAL.concrete,
    flags: 0,
    posLocal: [0, 0, 0],
    quat: [0, 0, 0, 1],
    vertices: Float32Array.from(v),
    indices: out,
  };
}

/** 건물 렌더 스트림(셀 로컬 xyz, 삼각형 인덱스) → collision.bin. 같은 입력 → 같은 바이트. */
export async function buildCollision(pos: ArrayLike<number>, idx: ArrayLike<number>): Promise<CollisionBuild> {
  if (idx.length === 0) return { data: null, tris: 0, shapes: 0, sourceTris: 0 };
  await MeshoptSimplifier.ready;
  const w = weld(pos, idx);
  const [simple] = MeshoptSimplifier.simplify(w.idx, w.pos, 3, 0, SIMPLIFY_ERROR_M, ['ErrorAbsolute']);
  const order = blockOrder(w.pos, simple);
  const shapes: JcolShape[] = [];
  for (let i = 0; i < order.length; i += MAX_CHUNK_TRIS)
    shapes.push(chunkShape(w.pos, simple, order.slice(i, i + MAX_CHUNK_TRIS)));
  return {
    data: await gzip(writeJcol(shapes)),
    tris: simple.length / 3,
    shapes: shapes.length,
    sourceTris: w.idx.length / 3,
  };
}
