// 셀 → 렌더 노드: DecodedMesh 프리미티브 → BufferGeometry(TypedArray 그대로) + 공유 머티리얼, 슬롯별 Group(위치 = originWF − renderOrigin). see docs/07-rendering.md §2–3
import type { CellKey, Vec3d } from '@sanpo/core';
import type { CellPayload, DecodedMesh, MeshSlot } from '@sanpo/tile-format';
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3 } from 'three/webgpu';
import type { MaterialRegistry } from '../materials/registry.ts';
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
  /** 슬롯별 그룹(각 레이어 루트의 자식). */
  readonly groups: readonly Group[];
  readonly meshes: readonly Mesh[];
  readonly triangles: number;
}

type Primitive = DecodedMesh['primitives'][number];

export function threeAttributeName(gltfName: string): string {
  return ATTRIBUTE_NAMES[gltfName] ?? gltfName.toLowerCase();
}

/** 경계는 파이프라인 boundsLocal을 그대로 쓴다(메인 스레드에서 정점 순회 없음). */
export function buildGeometry(p: Primitive): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(p.attributes)) {
    g.setAttribute(threeAttributeName(name), new BufferAttribute(a.array as Float32Array, a.itemSize, a.normalized));
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

export function createCellNode(
  p: CellPayload,
  materials: MaterialRegistry,
  roots: Readonly<Record<LayerRoot, Group>>,
  renderOriginWF: Readonly<Vec3d>,
): CellRenderNode {
  const groups: Group[] = [];
  const meshes: Mesh[] = [];
  let triangles = 0;
  for (const [slot, mesh] of Object.entries(p.meshes) as [MeshSlot, DecodedMesh | undefined][]) {
    if (mesh === undefined) continue;
    const group = new Group();
    group.name = `${p.id}/${slot}`;
    for (const prim of mesh.primitives) {
      const m = new Mesh(buildGeometry(prim), materials.get(prim.materialId));
      m.name = `${p.id}/${slot}/${prim.materialId}`;
      m.matrixAutoUpdate = false;
      triangles += triangleCount(m.geometry);
      meshes.push(m);
      group.add(m);
    }
    roots[SLOT_ROOT[slot]].add(group);
    groups.push(group);
  }
  const node: CellRenderNode = { originWF: { ...p.originWF }, groups, meshes, triangles };
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

export function createCellSet(materials: MaterialRegistry, roots: Readonly<Record<LayerRoot, Group>>): CellSet {
  const cells = new Map<CellKey, CellRenderNode>();
  const remove = (key: CellKey): void => {
    const node = cells.get(key);
    if (node === undefined) return;
    disposeCellNode(node);
    cells.delete(key);
  };
  return {
    get size() {
      return cells.size;
    },
    add(p, origin) {
      remove(p.key);
      cells.set(p.key, createCellNode(p, materials, roots, origin));
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
