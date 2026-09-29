// 셀 → 렌더 노드: DecodedMesh 프리미티브 → BufferGeometry(TypedArray 그대로) + 공유 머티리얼, 슬롯별 Group(위치 = originWF − renderOrigin). see docs/07-rendering.md §2–3
import type { CellKey, Vec3d } from '@sanpo/core';
import type { CellPayload, DecodedMesh, MeshSlot } from '@sanpo/tile-format';
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Vector4 } from 'three/webgpu';
import { createHlodFades } from '../materials/hlod.ts';
import type { MaterialRegistry } from '../materials/registry.ts';
import type { HlodSwitch } from './hlod-switch.ts';
import { toRender } from './origin.ts';
import { type LayerRoot, SLOT_ROOT } from './scene-graph.ts';

/** glTF 속성 이름(DecodedMesh 규약) → three 속성 이름. 나머지는 소문자(`_BLDG` → `_bldg`). */
const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  POSITION: 'position',
  NORMAL: 'normal',
  TANGENT: 'tangent',
  TEXCOORD_0: 'uv',
  TEXCOORD_1: 'uv1',
  COLOR_0: 'color',
};

export interface CellRenderNode {
  readonly originWF: Readonly<Vec3d>;
  /** hlod.mesh가 있으면 자식 페이드 벡터(메시 userData와 공유). */
  readonly hlodFades?: readonly Vector4[];
  /** 슬롯별 그룹(각 레이어 루트의 자식). */
  readonly groups: readonly Group[];
  readonly meshes: readonly Mesh[];
  readonly triangles: number;
}

type Primitive = DecodedMesh['primitives'][number];

export function threeAttributeName(gltfName: string): string {
  return ATTRIBUTE_NAMES[gltfName] ?? gltfName.toLowerCase();
}

/**
 * 1성분 정수 속성(`_CHILD` u8·`_SURF` u8·`_BLDG` u16) → float32: WebGPU 코어에 1성분 8/16비트 정점 형식이 없고,
 * WebGL2는 정수 입력에 vertexAttribIPointer가 필요해 셰이더·버퍼 타입이 어긋난다. 셀당 정점 수만큼 1회 변환.
 */
const F32_ATTRIBUTES: ReadonlySet<string> = new Set(['_CHILD', '_SURF', '_BLDG']);

function floatAttribute(a: Primitive['attributes'][string]): BufferAttribute {
  const src = a.array as Uint8Array | Uint16Array;
  const f = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) f[i] = src[i] as number;
  return new BufferAttribute(f, a.itemSize);
}

/** 경계는 파이프라인 boundsLocal을 그대로 쓴다(메인 스레드에서 정점 순회 없음 — 1성분 정수 속성 f32 변환만 예외). */
export function buildGeometry(p: Primitive): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(p.attributes)) {
    if (F32_ATTRIBUTES.has(name)) {
      g.setAttribute(threeAttributeName(name), floatAttribute(a));
      continue;
    }
    // `_FACADE`(u8×4): 정규화로 넘겨 unorm8x4(양 백엔드 공통, 복사 없음) → 셰이더에서 ×255.
    const normalized = name === '_FACADE' ? true : a.normalized;
    g.setAttribute(threeAttributeName(name), new BufferAttribute(a.array as Float32Array, a.itemSize, normalized));
  }
  if (p.index) g.setIndex(new BufferAttribute(p.index, 1));
  const box = new Box3(new Vector3(...p.boundsLocal.min), new Vector3(...p.boundsLocal.max));
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new Sphere());
  return g;
}

function triangleCount(g: BufferGeometry): number {
  const n = g.index?.count ?? g.getAttribute('position')?.count ?? 0;
  return Math.floor(n / 3);
}

/** 셀별 절차 무늬 시드(0..4095, 셰이더 float 정밀도 안) — 같은 `_BLDG` 인덱스라도 셀마다 다른 건물 해시. */
export function cellSeedOf(key: CellKey): number {
  let h = Math.imul((key % 0x1_0000_0000) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ Math.floor(key / 0x1_0000_0000) ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 4096;
}

export function createCellNode(
  p: CellPayload,
  materials: MaterialRegistry,
  roots: Readonly<Record<LayerRoot, Group>>,
  renderOriginWF: Readonly<Vec3d>,
): CellRenderNode {
  const groups: Group[] = [];
  const meshes: Mesh[] = [];
  let triangles = 0;
  const hlodFades = p.meshes.hlod ? createHlodFades() : undefined;
  const cellSeed = cellSeedOf(p.key);
  for (const [slot, mesh] of Object.entries(p.meshes) as [MeshSlot, DecodedMesh | undefined][]) {
    if (mesh === undefined) continue;
    const group = new Group();
    group.name = `${p.id}/${slot}`;
    for (const prim of mesh.primitives) {
      const hlod = slot === 'hlod';
      const material = hlod ? materials.getHlod(prim.materialId) : materials.get(prim.materialId);
      const m = new Mesh(buildGeometry(prim), material);
      m.name = `${p.id}/${slot}/${prim.materialId}`;
      m.matrixAutoUpdate = false;
      if (hlod) m.userData.hlodFade = hlodFades;
      m.userData.cellSeed = cellSeed;
      triangles += triangleCount(m.geometry);
      meshes.push(m);
      group.add(m);
    }
    roots[SLOT_ROOT[slot]].add(group);
    groups.push(group);
  }
  const node: CellRenderNode = {
    originWF: { ...p.originWF },
    groups,
    meshes,
    triangles,
    ...(hlodFades ? { hlodFades } : {}),
  };
  placeCellNode(node, renderOriginWF);
  return node;
}

/** 원점 재설정·추가 시: 원본 originWF에서 새로 계산(누적 없음). */
export function placeCellNode(node: CellRenderNode, renderOriginWF: Readonly<Vec3d>): void {
  for (const g of node.groups) toRender(g.position, node.originWF, renderOriginWF);
}

export function disposeCellNode(node: CellRenderNode): void {
  for (const g of node.groups) g.removeFromParent();
  for (const m of node.meshes) m.geometry.dispose();
}

/** 키 → 셀 노드 모음(교체·제거·원점 재설정 일괄 재배치). */
export interface CellSet {
  readonly size: number;
  add(p: CellPayload, renderOriginWF: Readonly<Vec3d>): void;
  remove(key: CellKey): void;
  placeAll(renderOriginWF: Readonly<Vec3d>): void;
  dispose(): void;
}

export function createCellSet(
  materials: MaterialRegistry,
  roots: Readonly<Record<LayerRoot, Group>>,
  hlod?: HlodSwitch,
): CellSet {
  const cells = new Map<CellKey, CellRenderNode>();
  const remove = (key: CellKey): void => {
    const node = cells.get(key);
    if (node === undefined) return;
    if (node.hlodFades) hlod?.detach(key);
    disposeCellNode(node);
    cells.delete(key);
  };
  return {
    get size() {
      return cells.size;
    },
    add(p, origin) {
      remove(p.key);
      const node = createCellNode(p, materials, roots, origin);
      cells.set(p.key, node);
      if (node.hlodFades) hlod?.attach(p.key, node.hlodFades);
    },
    remove,
    placeAll(origin) {
      for (const node of cells.values()) placeCellNode(node, origin);
    },
    dispose() {
      for (const key of [...cells.keys()]) remove(key);
    },
  };
}
