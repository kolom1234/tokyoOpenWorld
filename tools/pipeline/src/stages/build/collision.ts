// collision.bin 섹션(04 §4.4-6, 05 §6): 건물 렌더 면(벽·지붕·부속물) → 1 mm 용접 → meshopt 단순화(절대 오차 0.3 m) →
// 64 m 블록 순으로 삼각형을 정렬해 ≤ MAX_CHUNK_TRIS 청크로 자른다(JCOL triMesh 여러 개 — 물리 워커가 청크 하나를 한 틱에 적재, Jolt 메시 생성 ≈ 1.5 ms/1000 삼각형, ADR-0042).
// 보도 윗면·연석(M05-T01)은 같은 방식의 TERRAIN 층 triMesh(재질 tile, 단순화 1 cm) 청크로 뒤에 붙는다. 충돌 소품(M05-T03)은 그 뒤 프리미티브. 나무 줄기는 M05-T04.
import { gzip, JCOL_MATERIAL, type JcolShape, writeJcol } from '@sanpo/tile-format';
import { MeshoptSimplifier } from 'meshoptimizer';

/** 04 §4.4-6: 건물 단순화 절대 오차(m). */
export const SIMPLIFY_ERROR_M = 0.3;
/** 청크 삼각형 상한(워커 적재 틱 ≤ 8 ms, 08 §4). */
export const MAX_CHUNK_TRIS = 2500;
/** 청크 정렬 블록(m) — 셀 256 m를 4 × 4. */
const BLOCK_M = 64;
/** 08 §3 STATIC_WORLD·TERRAIN. */
const LAYER_STATIC_WORLD = 0;
export const LAYER_TERRAIN = 1;
/** 보도·연석 단순화 절대 오차(m) — 연석 0.15 m 계단은 유지, 보도 곡면은 크게 합친다(1 cm 대비 콜라이더 크기 ≈ 절반, 발 높이 오차 < 3 cm). */
export const GROUND_SIMPLIFY_ERROR_M = 0.03;
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
function chunkShape(
  pos: Float32Array,
  idx: Uint32Array,
  tris: readonly number[],
  kind: { layer: number; material: number } = { layer: LAYER_STATIC_WORLD, material: JCOL_MATERIAL.concrete },
): JcolShape {
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
    layer: kind.layer,
    material: kind.material,
    flags: 0,
    posLocal: [0, 0, 0],
    quat: [0, 0, 0, 1],
    vertices: Float32Array.from(v),
    indices: out,
  };
}

/** 한 묶음: 용접 → 단순화 → 블록 순 청크. */
function chunked(
  mesh: { pos: ArrayLike<number>; idx: ArrayLike<number> },
  errorM: number,
  kind: { layer: number; material: number },
): { shapes: JcolShape[]; tris: number; sourceTris: number } {
  if (mesh.idx.length === 0) return { shapes: [], tris: 0, sourceTris: 0 };
  const w = weld(mesh.pos, mesh.idx);
  const [simple] = MeshoptSimplifier.simplify(w.idx, w.pos, 3, 0, errorM, ['ErrorAbsolute']);
  const order = blockOrder(w.pos, simple);
  const shapes: JcolShape[] = [];
  for (let i = 0; i < order.length; i += MAX_CHUNK_TRIS)
    shapes.push(chunkShape(w.pos, simple, order.slice(i, i + MAX_CHUNK_TRIS), kind));
  return { shapes, tris: simple.length / 3, sourceTris: w.idx.length / 3 };
}

/**
 * 건물 렌더 스트림(셀 로컬 xyz, 삼각형 인덱스) + 선택: 보도 윗면·연석(ground, TERRAIN 층·tile) → collision.bin. 같은 입력 → 같은 바이트.
 */
export async function buildCollision(
  pos: ArrayLike<number>,
  idx: ArrayLike<number>,
  ground?: { pos: ArrayLike<number>; idx: ArrayLike<number> },
  /** 소품 프리미티브(M05-T03, 박스·원기둥 — 물리 워커가 64 m 블록별 합성 셰이프로 묶는다). */
  extra: readonly JcolShape[] = [],
): Promise<CollisionBuild> {
  await MeshoptSimplifier.ready;
  const bld = chunked({ pos, idx }, SIMPLIFY_ERROR_M, { layer: LAYER_STATIC_WORLD, material: JCOL_MATERIAL.concrete });
  const gnd = ground
    ? chunked(ground, GROUND_SIMPLIFY_ERROR_M, { layer: LAYER_TERRAIN, material: JCOL_MATERIAL.tile })
    : { shapes: [], tris: 0, sourceTris: 0 };
  const shapes = [...bld.shapes, ...gnd.shapes, ...extra];
  if (shapes.length === 0) return { data: null, tris: 0, shapes: 0, sourceTris: 0 };
  return {
    data: await gzip(writeJcol(shapes)),
    tris: bld.tris + gnd.tris,
    shapes: shapes.length,
    sourceTris: bld.sourceTris + gnd.sourceTris,
  };
}
