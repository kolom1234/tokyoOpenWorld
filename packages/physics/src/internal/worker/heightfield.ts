// 지형 높이장(08 §4, 05 §4 terrain.height): u16 257² → Jolt HeightFieldShape(1 m 간격, 블록 4). 샘플 [iz·size + ix] = 셀 로컬 (ix, h, iz),
// (0, 0) = 셀 북서 모서리 = 셀 원점. 힙에 직접 채운다(샘플마다 JS 호출 없음). 셀은 4×4 타일(65², 가장자리 샘플 공유)로 나눠 작업 하나 ≈ 0.3 ms(ADR-0042 부록).
import type { HeightfieldData } from '@sanpo/tile-format';
import type { Jolt } from './jolt-init.ts';

/** Jolt 블록 크기(블록마다 최소·최대로 8비트 양자화 → 블록 안 높이 범위가 작아 정밀도 ≈ mm–cm). */
const BLOCK_SIZE = 4;

/** 높이장 타일: 샘플 [x0, x0 + n) × [z0, z0 + n)(셀 로컬 오프셋 (x0, 0, z0)). 기본 = 셀 전체. */
export function createHeightfieldShape(
  Jolt: Jolt,
  hf: HeightfieldData,
  x0 = 0,
  z0 = 0,
  n = hf.size,
): InstanceType<Jolt['Shape']> {
  const s = new Jolt.HeightFieldShapeSettings();
  try {
    s.mSampleCount = n;
    s.mBlockSize = BLOCK_SIZE;
    s.mOffset.Set(x0, 0, z0);
    s.mScale.Set(1, 1, 1);
    s.mHeightSamples.resize(n * n);
    const base = Jolt.getPointer(s.mHeightSamples.data()) >> 2;
    const heap = Jolt.HEAPF32;
    for (let j = 0; j < n; j++) {
      const row = (z0 + j) * hf.size + x0;
      const o = base + j * n;
      for (let i = 0; i < n; i++) heap[o + i] = hf.minH + (hf.data[row + i] as number) * hf.step;
    }
    const r = s.Create();
    if (!r.IsValid()) throw new Error(`heightfield: ${r.GetError().c_str()}`);
    const shape = r.Get();
    // 설정 객체를 해제해도 셰이프는 남게 참조를 하나 잡는다(바디 생성 후 바디가 소유).
    shape.AddRef();
    return shape;
  } finally {
    Jolt.destroy(s);
  }
}

/** JCOL triMesh(셰이프 로컬 xyz·인덱스) → MeshShape. VertexList(Float3 = 12 B)·IndexedTriangleList(20 B)를 힙에 직접. */
export function createMeshShape(
  Jolt: Jolt,
  vertices: Float32Array,
  indices: Uint32Array,
  material: number,
): InstanceType<Jolt['Shape']> {
  const verts = new Jolt.VertexList();
  const tris = new Jolt.IndexedTriangleList();
  const mats = new Jolt.PhysicsMaterialList();
  try {
    const nv = vertices.length / 3;
    const nt = indices.length / 3;
    verts.resize(nv);
    Jolt.HEAPF32.set(vertices, Jolt.getPointer(verts.at(0)) >> 2);
    tris.resize(nt);
    const base = Jolt.getPointer(tris.at(0)) >> 2;
    const u32 = Jolt.HEAPU32;
    for (let t = 0; t < nt; t++) {
      const o = base + t * 5;
      u32[o] = indices[t * 3] as number;
      u32[o + 1] = indices[t * 3 + 1] as number;
      u32[o + 2] = indices[t * 3 + 2] as number;
      u32[o + 3] = 0;
      // IndexedTriangle.mUserData = JCOL 재질(지면 재질 질의, M04-T04).
      u32[o + 4] = material;
    }
    const settings = new Jolt.MeshShapeSettings(verts, tris, mats);
    try {
      const r = settings.Create();
      if (!r.IsValid()) throw new Error(`mesh shape: ${r.GetError().c_str()}`);
      const shape = r.Get();
      shape.AddRef();
      return shape;
    } finally {
      Jolt.destroy(settings);
    }
  } finally {
    Jolt.destroy(verts);
    Jolt.destroy(tris);
    Jolt.destroy(mats);
  }
}

/**
 * 초기화 때 한 번: 작은 높이장·메시를 만들고 버려 wasm·JS 경로를 데운다 — 첫 셀 작업의 콜드 비용(≈ 7 ms)이 적재 틱 예산을 넘지 않게.
 */
export function warmUpShapes(Jolt: Jolt): void {
  const size = 33;
  const hf = createHeightfieldShape(Jolt, { size, minH: 0, step: 0.01, data: new Uint16Array(size * size) });
  hf.Release();
  const n = 64;
  const v = new Float32Array((n + 1) * 3 * 2);
  const idx = new Uint32Array(n * 3);
  for (let i = 0; i <= n; i++) {
    v.set([i, 0, 0, i, 1, 1], i * 6);
    if (i < n) idx.set([i * 2, i * 2 + 1, i * 2 + 2], i * 3);
  }
  createMeshShape(Jolt, v, idx, 0).Release();
}
