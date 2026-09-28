// 셀 glb 섹션 → DecodedMesh(워커 전용). 파이프라인이 쓰는 부분집합만: 노드 1개(이동 + 균일 스케일), EXT_meshopt_compression,
// KHR_mesh_quantization, TRIANGLES. three 없이 직접 파싱한다(06 §1). see docs/05-tile-format.md §4, ADR-0020, ADR-0022
import { err, ok, type Result } from '@sanpo/core';
import type { DecodedMesh, Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import type { DecodeError } from '../api.ts';
import { type AbortCheck, fail } from './decode-util.ts';

const GLB_MAGIC = 0x4654_6c67; // "glTF"
const CHUNK_JSON = 0x4e4f_534a;
const CHUNK_BIN = 0x004e_4942;
const MODE_TRIANGLES = 4;
/** glTF componentType → 생성자. */
const COMPONENT = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const;
type ComponentType = keyof typeof COMPONENT;
type Typed = InstanceType<(typeof COMPONENT)[ComponentType]>;
const ITEM_SIZE: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
/** 정규화 정수 → [−1,1]/[0,1] 나눗수(glTF 2.0 §3.11). */
const NORM_DIV: Readonly<Record<number, number>> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

interface MeshoptView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride: number;
  count: number;
  mode: 'ATTRIBUTES' | 'TRIANGLES' | 'INDICES';
  filter?: 'NONE' | 'OCTAHEDRAL' | 'QUATERNION' | 'EXPONENTIAL';
}
interface GltfJson {
  accessors: Array<{
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    normalized?: boolean;
    min?: number[];
    max?: number[];
  }>;
  bufferViews: Array<{
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
    extensions?: { EXT_meshopt_compression?: MeshoptView };
  }>;
  buffers: Array<{ byteLength: number; uri?: string }>;
  meshes: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
      extras?: { materialId?: string; child?: number };
    }>;
  }>;
  nodes?: Array<{ mesh?: number; translation?: number[]; scale?: number[]; rotation?: number[]; matrix?: number[] }>;
}
type Attr = DecodedMesh['primitives'][number]['attributes'][string];

/** GLB 컨테이너 → JSON + BIN chunk(view). */
function splitGlb(glb: Uint8Array): Result<{ json: GltfJson; bin: Uint8Array }, DecodeError> {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (glb.byteLength < 20 || dv.getUint32(0, true) !== GLB_MAGIC || dv.getUint32(4, true) !== 2) {
    return fail('corrupt', 'glb: bad magic/version');
  }
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON || 20 + jsonLen > glb.byteLength) return fail('corrupt', 'glb: JSON chunk');
  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen))) as GltfJson;
  } catch {
    return fail('corrupt', 'glb: JSON parse');
  }
  const binAt = 20 + jsonLen;
  if (binAt + 8 > glb.byteLength || dv.getUint32(binAt + 4, true) !== CHUNK_BIN)
    return ok({ json, bin: new Uint8Array() });
  const binLen = dv.getUint32(binAt, true);
  if (binAt + 8 + binLen > glb.byteLength) return fail('truncated', 'glb: BIN chunk');
  return ok({ json, bin: glb.subarray(binAt + 8, binAt + 8 + binLen) });
}

/** 버퍼 index → 바이트. glb에서는 uri 없는 첫 버퍼만 BIN chunk(나머지 = meshopt fallback, 데이터 없음). */
function bufferBytes(json: GltfJson, bin: Uint8Array, index: number): Uint8Array | undefined {
  const b = json.buffers[index];
  if (b === undefined || b.uri !== undefined) return undefined;
  const firstNoUri = json.buffers.findIndex((x) => x.uri === undefined);
  return index === firstNoUri ? bin : undefined;
}

/** bufferView → 해제된 바이트. meshopt 압축 뷰는 decodeGltfBuffer로 풀고 결과를 캐시한다. */
function viewBytes(json: GltfJson, bin: Uint8Array, cache: Map<number, Uint8Array>, i: number): Uint8Array {
  const hit = cache.get(i);
  if (hit) return hit;
  const v = json.bufferViews[i];
  if (!v) throw new RangeError(`bufferView ${i} missing`);
  const m = v.extensions?.EXT_meshopt_compression;
  let out: Uint8Array;
  if (m) {
    const src = bufferBytes(json, bin, m.buffer);
    const off = m.byteOffset ?? 0;
    if (!src || off + m.byteLength > src.byteLength) throw new RangeError(`meshopt view ${i} out of range`);
    out = new Uint8Array(m.count * m.byteStride);
    MeshoptDecoder.decodeGltfBuffer(
      out,
      m.count,
      m.byteStride,
      src.subarray(off, off + m.byteLength),
      m.mode,
      m.filter,
    );
  } else {
    const src = bufferBytes(json, bin, v.buffer);
    const off = v.byteOffset ?? 0;
    if (!src || off + v.byteLength > src.byteLength) throw new RangeError(`bufferView ${i} out of range`);
    out = src.subarray(off, off + v.byteLength);
  }
  cache.set(i, out);
  return out;
}

/** accessor → 밀집 TypedArray(새 ArrayBuffer — 셀 간·속성 간 버퍼 공유 없음 → 개별 transfer 가능). */
function readAccessor(json: GltfJson, bin: Uint8Array, cache: Map<number, Uint8Array>, i: number): Attr {
  const a = json.accessors[i];
  const Ctor = a && COMPONENT[a.componentType as ComponentType];
  const n = a && ITEM_SIZE[a.type];
  if (!a || !Ctor || !n || a.bufferView === undefined) throw new RangeError(`accessor ${i} unsupported`);
  const bytes = viewBytes(json, bin, cache, a.bufferView);
  const el = Ctor.BYTES_PER_ELEMENT;
  const view = json.bufferViews[a.bufferView];
  const stride = view?.byteStride ?? view?.extensions?.EXT_meshopt_compression?.byteStride ?? n * el;
  const out = new Ctor(a.count * n) as Typed;
  if (a.count === 0) return { array: out, itemSize: n, normalized: a.normalized === true };
  const off = a.byteOffset ?? 0;
  const span = (a.count - 1) * stride + n * el;
  if (off + span > bytes.byteLength || stride % el) throw new RangeError(`accessor ${i} out of range/misaligned`);
  // 요소 정렬이 안 맞는 위치(비압축 뷰)면 정렬된 사본에서 읽는다.
  const aligned = (bytes.byteOffset + off) % el === 0 ? bytes.subarray(off, off + span) : bytes.slice(off, off + span);
  const src = new Ctor(aligned.buffer as ArrayBuffer, aligned.byteOffset, (span - n * el) / el + n) as Typed;
  const step = stride / el;
  if (step === n) out.set(src.subarray(0, a.count * n));
  else for (let e = 0; e < a.count; e++) for (let k = 0; k < n; k++) out[e * n + k] = src[e * step + k] ?? 0;
  return { array: out, itemSize: n, normalized: a.normalized === true };
}

interface NodeXf {
  t: Vec3Tuple;
  s: number;
}

/** 메시를 가리키는 노드의 이동·균일 스케일. 회전·행렬·비균일 스케일은 파이프라인 계약 밖(ADR-0018 §4). */
function nodeTransform(json: GltfJson): Result<NodeXf, DecodeError> {
  const node = json.nodes?.find((x) => x.mesh === 0);
  if (!node) return ok({ t: [0, 0, 0], s: 1 });
  const r = node.rotation;
  if (node.matrix || (r && (r[0] !== 0 || r[1] !== 0 || r[2] !== 0 || r[3] !== 1))) {
    return fail('unsupported', 'glb: node rotation/matrix');
  }
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  if (sx !== sy || sy !== sz) return fail('unsupported', 'glb: non-uniform scale');
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  return ok({ t: [tx, ty, tz], s: sx });
}

/** 양자화 값 → 셀 로컬 미터: (정규화면 max(q/max, −1)) × s + t (KHR_mesh_quantization). */
function dequant(q: number, div: number, normalized: boolean, s: number, t: number): number {
  return (normalized ? Math.max(q / div, -1) : q) * s + t;
}

/** 양자화 POSITION → 셀 로컬 float32. 이미 float32·항등 변환이면 그대로. */
function localPositions(a: Attr, componentType: number, xf: NodeXf): Float32Array {
  const q = a.array as Typed;
  if (q instanceof Float32Array && xf.s === 1 && xf.t.every((v) => v === 0)) return q;
  const div = NORM_DIV[componentType] ?? 1;
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i += 3) {
    for (let k = 0; k < 3; k++) out[i + k] = dequant(q[i + k] ?? 0, div, a.normalized, xf.s, xf.t[k] ?? 0);
  }
  return out;
}

/** 경계 = accessor min/max × 노드 변환(ADR-0020 §3, 정점 순회 없음). min/max가 없으면 정점에서 계산. */
function boundsOf(
  acc: GltfJson['accessors'][number],
  pos: Float32Array,
  xf: NodeXf,
): { min: Vec3Tuple; max: Vec3Tuple } {
  const div = NORM_DIV[acc.componentType] ?? 1;
  const norm = acc.normalized === true;
  if (acc.min?.length === 3 && acc.max?.length === 3) {
    const lo = acc.min;
    const hi = acc.max;
    const f = (v: number | undefined, k: number) => Math.fround(dequant(v ?? 0, div, norm, xf.s, xf.t[k] ?? 0));
    return { min: [f(lo[0], 0), f(lo[1], 1), f(lo[2], 2)], max: [f(hi[0], 0), f(hi[1], 1), f(hi[2], 2)] };
  }
  const min: Vec3Tuple = [Infinity, Infinity, Infinity];
  const max: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k] ?? 0;
      min[k] = Math.min(min[k] ?? v, v);
      max[k] = Math.max(max[k] ?? v, v);
    }
  }
  return pos.length ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

type Prim = GltfJson['meshes'][number]['primitives'][number];

function decodePrimitive(json: GltfJson, bin: Uint8Array, cache: Map<number, Uint8Array>, p: Prim, xf: NodeXf) {
  if ((p.mode ?? MODE_TRIANGLES) !== MODE_TRIANGLES) throw new RangeError(`primitive mode ${p.mode}`);
  const attributes: Record<string, Attr> = {};
  for (const [name, i] of Object.entries(p.attributes)) attributes[name] = readAccessor(json, bin, cache, i);
  const posIdx = p.attributes.POSITION;
  const pos = attributes.POSITION;
  if (posIdx === undefined || !pos) throw new RangeError('primitive without POSITION');
  const posAcc = json.accessors[posIdx];
  if (!posAcc) throw new RangeError('POSITION accessor');
  const positions = localPositions(pos, posAcc.componentType, xf);
  attributes.POSITION = { array: positions, itemSize: 3, normalized: false };
  const index = p.indices === undefined ? undefined : readAccessor(json, bin, cache, p.indices).array;
  if (index !== undefined && !(index instanceof Uint16Array || index instanceof Uint32Array)) {
    throw new RangeError('index type');
  }
  return {
    materialId: p.extras?.materialId ?? 'unknown',
    ...(p.extras?.child !== undefined ? { child: p.extras.child } : {}),
    attributes,
    ...(index ? { index } : {}),
    boundsLocal: boundsOf(posAcc, positions, xf),
  };
}

/** glb 섹션 → DecodedMesh. 프리미티브마다 check()로 취소를 확인한다. */
export async function decodeGlb(glb: Uint8Array, check: AbortCheck): Promise<Result<DecodedMesh, DecodeError>> {
  await MeshoptDecoder.ready;
  const split = splitGlb(glb);
  if (!split.ok) return split;
  const { json, bin } = split.value;
  const xf = nodeTransform(json);
  if (!xf.ok) return xf;
  const cache = new Map<number, Uint8Array>();
  const primitives: DecodedMesh['primitives'] = [];
  try {
    for (const p of json.meshes[0]?.primitives ?? []) {
      const stop = await check();
      if (stop) return err(stop);
      primitives.push(decodePrimitive(json, bin, cache, p, xf.value));
    }
  } catch (e) {
    return fail('corrupt', `glb: ${e instanceof Error ? e.message : String(e)}`);
  }
  return ok({ primitives });
}
