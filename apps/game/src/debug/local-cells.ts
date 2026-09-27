// 임시 셀 로더(M01-T06 → **M02-T05에서 삭제**, streaming 디코드 워커로 대체): 검증된 TKC → 메인 스레드에서 glb 파싱
// (three GLTFLoader + meshopt) → DecodedMesh/CellPayload → render.addCell, terrain.height → 지면 높이 조회. see docs/07-rendering.md §3, ADR-0018
import { type CellKey, err, type GroundQuery, ok, type Result, type Vec3d } from '@sanpo/core';
import { cellOf } from '@sanpo/geo';
import {
  type CellPayload,
  type DecodedMesh,
  gunzip,
  type HeightfieldData,
  type MeshSlot,
  parseHeightfield,
  type SectionType,
} from '@sanpo/tile-format';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { type BufferAttribute, type InterleavedBufferAttribute, Matrix4, type Mesh, type TypedArray } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedCell } from '../world-load.ts';

/** L0 셀 한 변(m, 01-architecture §8). */
const L0_SIZE_M = 256;
/** three 속성 이름 → glTF 이름(DecodedMesh 규약, render가 역변환). */
const GLTF_NAMES: Readonly<Record<string, string>> = { position: 'POSITION', normal: 'NORMAL', uv: 'TEXCOORD_0' };
const MESH_SECTIONS: ReadonlyArray<[MeshSlot, SectionType]> = [
  ['terrain', 'terrain.mesh'],
  ['buildings', 'buildings.mesh'],
];

const IDENTITY = new Matrix4();

type Attr = DecodedMesh['primitives'][number]['attributes'][string];

/** 인터리브(glTF 4바이트 stride 정렬) 속성을 밀집 배열로 복사. 원래 밀집이면 그대로. */
function compact(a: BufferAttribute | InterleavedBufferAttribute): Attr {
  if (!('isInterleavedBufferAttribute' in a)) return { array: a.array, itemSize: a.itemSize, normalized: a.normalized };
  const src = a.data.array as TypedArray;
  const out = new (src.constructor as new (n: number) => TypedArray)(a.count * a.itemSize);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = src[i * a.data.stride + a.offset + k] ?? 0;
  }
  return { array: out, itemSize: a.itemSize, normalized: a.normalized };
}

/** 양자화 POSITION(u16 + 노드 TRS, ADR-0018 §4) → 셀 로컬 float32. 노드 변환이 항등이면 밀집화만. */
function localPositions(mesh: Mesh): Attr {
  const pos = mesh.geometry.getAttribute('position');
  if (mesh.matrixWorld.equals(IDENTITY) && pos.array instanceof Float32Array) return compact(pos);
  const out = new Float32Array(pos.count * 3);
  const e = mesh.matrixWorld.elements;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    out[i * 3] = (e[0] ?? 0) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0);
    out[i * 3 + 1] = (e[1] ?? 0) * x + (e[5] ?? 0) * y + (e[9] ?? 0) * z + (e[13] ?? 0);
    out[i * 3 + 2] = (e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 0) * z + (e[14] ?? 0);
  }
  return { array: out, itemSize: 3, normalized: false };
}

function toPrimitive(mesh: Mesh): DecodedMesh['primitives'][number] {
  const g = mesh.geometry;
  const attributes: Record<string, Attr> = { POSITION: localPositions(mesh) };
  for (const [name, a] of Object.entries(g.attributes)) {
    if (name !== 'position') attributes[GLTF_NAMES[name] ?? name.toUpperCase()] = compact(a);
  }
  g.computeBoundingBox();
  const box = g.boundingBox?.clone().applyMatrix4(mesh.matrixWorld);
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const materialId = String(material?.userData.materialId ?? material?.name ?? 'unknown');
  return {
    materialId,
    attributes,
    ...(g.index ? { index: g.index.array as Uint16Array | Uint32Array } : {}),
    boundsLocal: { min: box ? box.min.toArray() : [0, 0, 0], max: box ? box.max.toArray() : [0, 0, 0] },
  };
}

async function glbToDecodedMesh(glb: Uint8Array): Promise<DecodedMesh> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // parseAsync는 ArrayBuffer 전체를 glb로 본다 → 섹션 view를 독립 버퍼로 복사.
  const gltf = await loader.parseAsync(glb.slice().buffer, '');
  gltf.scene.updateMatrixWorld(true);
  const primitives: DecodedMesh['primitives'] = [];
  gltf.scene.traverse((o) => {
    if ((o as Mesh).isMesh) primitives.push(toPrimitive(o as Mesh));
  });
  return { primitives };
}

async function decodeHeightfield(cell: LoadedCell): Promise<HeightfieldData | undefined> {
  const sec = cell.tkc.section('terrain.height');
  if (sec === undefined) return undefined;
  const raw = await gunzip(sec);
  if (!raw.ok) return undefined;
  const hf = parseHeightfield(raw.value);
  return hf.ok ? hf.value : undefined;
}

/** LoadedCell(검증된 TKC) → CellPayload. glb 파싱 실패는 Result 오류. */
export async function decodeLocalCell(cell: LoadedCell): Promise<Result<CellPayload, string>> {
  const h = cell.tkc.header;
  const meshes: CellPayload['meshes'] = {};
  try {
    for (const [slot, type] of MESH_SECTIONS) {
      const bytes = cell.tkc.section(type);
      if (bytes !== undefined) meshes[slot] = await glbToDecodedMesh(bytes);
    }
  } catch (e) {
    return err(`${cell.id}: glb ${e instanceof Error ? e.message : String(e)}`);
  }
  const [x, y, z] = h.originWF;
  const heightfield = await decodeHeightfield(cell);
  return ok({
    key: cell.key,
    id: cell.id,
    level: h.cell.level,
    originWF: { x, y, z },
    header: h,
    meshes,
    ...(heightfield ? { heightfield } : {}),
  });
}

/** 높이장 이중선형 보간(격자 (0,0) = 셀 북서 모서리, 간격 = 256 / (size − 1) m). */
export function sampleHeightfield(hf: HeightfieldData, xLocal: number, zLocal: number): number {
  const n = hf.size - 1;
  const fx = Math.min(Math.max((xLocal / L0_SIZE_M) * n, 0), n);
  const fz = Math.min(Math.max((zLocal / L0_SIZE_M) * n, 0), n);
  const x0 = Math.min(Math.floor(fx), n - 1);
  const z0 = Math.min(Math.floor(fz), n - 1);
  const tx = fx - x0;
  const tz = fz - z0;
  const at = (ix: number, iz: number): number => hf.minH + (hf.data[iz * hf.size + ix] ?? 0) * hf.step;
  const top = at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx;
  const bottom = at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

export interface LocalGround extends GroundQuery {
  addCell(key: CellKey, originWF: Readonly<Vec3d>, hf: HeightfieldData): void;
}

/** 적재된 L0 셀 높이장으로 지면 높이(WF y)를 조회. 미적재 셀이면 undefined. */
export function createLocalGround(): LocalGround {
  const cells = new Map<CellKey, { originWF: Vec3d; hf: HeightfieldData }>();
  return {
    addCell(key, originWF, hf) {
      cells.set(key, { originWF: { ...originWF }, hf });
    },
    groundHeightAt(x, z) {
      const c = cells.get(cellOf(0, x, z));
      return c === undefined ? undefined : sampleHeightfield(c.hf, x - c.originWF.x, z - c.originWF.z);
    },
  };
}
