// decals.mesh 섹션(M05-T02, 05 §4): 노면 표시 데칼 → glb(머티리얼 road_marking, POSITION u16 + 노드 변환, NORMAL i8, `_PAINT` u8 0 흰·1 황).
// 지형 메시 위 2 cm(common.ts DECAL_LIFT_M) — 렌더는 알파 테스트 마모 마스크로 도료 벗겨짐을 표현한다.
// M05-T03: 전선(전주 사이 리본)이 있으면 두 번째 프리미티브(머티리얼 power_wire, POSITION = 중심선·NORMAL·`_OFF` i8 모서리 방향) — 같은 노드 양자화 범위.
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb, type GlbPrimitive } from '../../lib/gltf.ts';
import type { DecalBuf } from '../derive/markings/common.ts';
import type { WireBuf } from '../derive/props/wires.ts';
import { type Aabb, boundsOf, quantizePositions } from './buildings-mesh.ts';
import { remapVertices } from './terrain-mesh.ts';

export const DECAL_MATERIAL = 'road_marking';
export const WIRE_MATERIAL = 'power_wire';
const INT8_MAX = 127;

/** i8 정규화(단위 벡터 성분). */
const snorm8 = (v: readonly number[]): Int8Array => Int8Array.from(v, (x) => Math.round(x * INT8_MAX));

function primitive(
  materialId: string,
  m: { pos: number[]; nrm: number[]; idx: number[] },
  b: Aabb,
  extra: { paint?: number[]; off?: number[] } = {},
): GlbPrimitive {
  const indices = Uint32Array.from(m.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const { q } = quantizePositions(m.pos, b);
  const nrm = snorm8(m.nrm);
  const { paint, off } = extra;
  return {
    materialId,
    attributes: {
      POSITION: { array: remapVertices(q, 3, remap, unique), itemSize: 3 },
      NORMAL: { array: remapVertices(nrm, 3, remap, unique), itemSize: 3, normalized: true },
      ...(paint ? { _PAINT: { array: remapVertices(Uint8Array.from(paint), 1, remap, unique), itemSize: 1 } } : {}),
      ...(off ? { _OFF: { array: remapVertices(snorm8(off), 3, remap, unique), itemSize: 3, normalized: true } } : {}),
    },
    indices,
  };
}

export async function encodeDecals(m: DecalBuf, wires?: WireBuf): Promise<Uint8Array | null> {
  const hasWires = wires !== undefined && wires.idx.length > 0;
  if (m.idx.length === 0 && !hasWires) return null;
  await MeshoptEncoder.ready;
  const b = boundsOf(hasWires ? [...m.pos, ...wires.pos] : m.pos);
  const { t, s } = quantizePositions([], b);
  const primitives: GlbPrimitive[] = [];
  if (m.idx.length > 0) primitives.push(primitive(DECAL_MATERIAL, m, b, { paint: m.paint }));
  if (hasWires) primitives.push(primitive(WIRE_MATERIAL, wires, b, { off: wires.off }));
  return encodeGlb({ name: 'decals', translation: t, scale: s, primitives });
}
