// decals.mesh 섹션(M05-T02, 05 §4): 노면 표시 데칼 → glb(머티리얼 road_marking, POSITION u16 + 노드 변환, NORMAL i8, `_PAINT` u8 0 흰·1 황).
// 지형 메시 위 2 cm(common.ts DECAL_LIFT_M) — 렌더는 알파 테스트 마모 마스크로 도료 벗겨짐을 표현한다.
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeGlb } from '../../lib/gltf.ts';
import type { DecalBuf } from '../derive/markings/common.ts';
import { boundsOf, quantizePositions } from './buildings-mesh.ts';
import { remapVertices } from './terrain-mesh.ts';

export const DECAL_MATERIAL = 'road_marking';
const INT8_MAX = 127;

export async function encodeDecals(m: DecalBuf): Promise<Uint8Array | null> {
  if (m.idx.length === 0) return null;
  await MeshoptEncoder.ready;
  const indices = Uint32Array.from(m.idx);
  const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, false);
  const { q, t, s } = quantizePositions(m.pos, boundsOf(m.pos));
  return encodeGlb({
    name: 'decals',
    translation: t,
    scale: s,
    primitives: [
      {
        materialId: DECAL_MATERIAL,
        attributes: {
          POSITION: { array: remapVertices(q, 3, remap, unique), itemSize: 3 },
          NORMAL: {
            array: remapVertices(
              Int8Array.from(m.nrm, (v) => Math.round(v * INT8_MAX)),
              3,
              remap,
              unique,
            ),
            itemSize: 3,
            normalized: true,
          },
          _PAINT: { array: remapVertices(Uint8Array.from(m.paint), 1, remap, unique), itemSize: 1 },
        },
        indices,
      },
    ],
  });
}
