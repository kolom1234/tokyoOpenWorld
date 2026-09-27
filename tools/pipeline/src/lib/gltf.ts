// 셀 glb 섹션 인코드/디코드: gltf-transform 문서 → EXT_meshopt_compression + KHR_mesh_quantization glb. see docs/05-tile-format.md §4 (glb), docs/adr/0018-cell-mesh-build.md
import { type Accessor, Document, NodeIO, type TypedArray } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import type { Vec3Tuple } from '@sanpo/tile-format';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

export type GlbArray = Float32Array | Int8Array | Uint8Array | Int16Array | Uint16Array;

export interface GlbAttribute {
  array: GlbArray;
  itemSize: 1 | 2 | 3 | 4;
  normalized?: boolean;
}

export interface GlbPrimitive {
  /** shared 머티리얼 ID. glTF Material 이름 + primitive/material `extras.materialId`로 기록. */
  materialId: string;
  /** 키 순서 = 기록 순서(결정론). */
  attributes: Record<string, GlbAttribute>;
  indices: Uint32Array;
}

export interface GlbMesh {
  name: string;
  primitives: GlbPrimitive[];
  /** 양자화 역변환 노드 TRS(KHR_mesh_quantization). 생략 = 항등. 균일 스케일만 허용(법선 왜곡 방지). */
  translation?: Vec3Tuple;
  scale?: number;
}

export interface DecodedGlb {
  primitives: Array<{
    materialId: string;
    attributes: Record<string, { array: TypedArray; itemSize: number; normalized: boolean }>;
    indices: Uint32Array;
  }>;
  translation: Vec3Tuple;
  scale: Vec3Tuple;
}

const ITEM_TYPE = { 1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4' } as const;
const U16_INDEX_LIMIT = 0xffff;

let ioPromise: Promise<NodeIO> | undefined;

/** meshopt wasm 준비 후 확장·코덱이 등록된 IO(프로세스당 1개). */
function io(): Promise<NodeIO> {
  ioPromise ??= Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]).then(() =>
    new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder }),
  );
  return ioPromise;
}

function maxIndex(indices: Uint32Array): number {
  let m = 0;
  for (const i of indices) if (i > m) m = i;
  return m;
}

function addPrimitive(doc: Document, p: GlbPrimitive): ReturnType<Document['createPrimitive']> {
  const buffer = doc.getRoot().listBuffers()[0];
  const prim = doc.createPrimitive().setExtras({ materialId: p.materialId });
  for (const [name, a] of Object.entries(p.attributes)) {
    const acc = doc
      .createAccessor(name)
      .setType(ITEM_TYPE[a.itemSize])
      .setArray(a.array)
      .setNormalized(a.normalized ?? false)
      .setBuffer(buffer ?? null);
    prim.setAttribute(name, acc);
  }
  const idx = maxIndex(p.indices) < U16_INDEX_LIMIT ? Uint16Array.from(p.indices) : p.indices;
  prim.setIndices(
    doc
      .createAccessor('indices')
      .setType('SCALAR')
      .setArray(idx)
      .setBuffer(buffer ?? null),
  );
  const mat = doc.createMaterial(p.materialId).setExtras({ materialId: p.materialId });
  return prim.setMaterial(mat);
}

/** 메시 1개 → glb 바이트(같은 입력 → 같은 바이트). 속성은 호출자가 이미 양자화한 타입 그대로 기록한다. */
export async function encodeGlb(mesh: GlbMesh): Promise<Uint8Array> {
  const nodeIo = await io();
  const doc = new Document();
  doc.createBuffer();
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  const m = doc.createMesh(mesh.name);
  for (const p of mesh.primitives) m.addPrimitive(addPrimitive(doc, p));
  const node = doc.createNode(mesh.name).setMesh(m);
  if (mesh.translation) node.setTranslation([...mesh.translation]);
  if (mesh.scale !== undefined) node.setScale([mesh.scale, mesh.scale, mesh.scale]);
  doc.createScene(mesh.name).addChild(node);
  return nodeIo.writeBinary(doc);
}

function attributeOf(a: Accessor): { array: TypedArray; itemSize: number; normalized: boolean } {
  const array = a.getArray();
  if (!array) throw new Error(`decodeGlb: accessor ${a.getName()} has no data`);
  return { array, itemSize: a.getElementSize(), normalized: a.getNormalized() };
}

/** glb → 원시 속성 배열(양자화 값 그대로) + 노드 TRS. 검증·테스트용(런타임 디코드는 streaming 워커). */
export async function decodeGlb(bytes: Uint8Array): Promise<DecodedGlb> {
  const doc = await (await io()).readBinary(bytes);
  const root = doc.getRoot();
  const node = root.listNodes()[0];
  const primitives = (root.listMeshes()[0]?.listPrimitives() ?? []).map((p) => {
    const attributes: DecodedGlb['primitives'][number]['attributes'] = {};
    for (const name of p.listSemantics()) {
      const acc = p.getAttribute(name);
      if (acc) attributes[name] = attributeOf(acc);
    }
    const idx = p.getIndices()?.getArray();
    const extras = p.getExtras() as { materialId?: string };
    return { materialId: extras.materialId ?? '', attributes, indices: Uint32Array.from(idx ?? []) };
  });
  return {
    primitives,
    translation: (node?.getTranslation() ?? [0, 0, 0]) as Vec3Tuple,
    scale: (node?.getScale() ?? [1, 1, 1]) as Vec3Tuple,
  };
}
