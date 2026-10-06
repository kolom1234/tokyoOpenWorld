// 간판 머티리얼(M05-T06, 07 §4 M_SIGN): 인스턴스 `_ipos`(렌더 좌표·yaw)·`_isig`(브랜드, 배율 xyz) → 셰이더 배치(법선 회전),
// 면(`_face` 1 세로·2 가로 타일) = 아틀라스(색까지 구운 sRGB), 틀 = 짙은 금속. 세 종류(돌출·입간판·옥상) 풀이 같은 노드 빌드를 쓴다. 야간 발광은 M09. see ADR-0054
import {
  attribute,
  cos,
  Fn,
  float,
  normalLocal,
  positionLocal,
  positionPrevious,
  select,
  sin,
  uv,
  vec3,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial } from 'three/webgpu';
import { signFace } from './atlas.ts';

const FRAME = vec3(0.07, 0.07, 0.075);

export function createSignMaterial(): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.2 });
  m.name = 'sign';
  const ipos = attribute('_ipos', 'vec4');
  const isig = attribute('_isig', 'vec4');
  m.positionNode = Fn(() => {
    const c = cos(ipos.w);
    const s = sin(ipos.w);
    const p = positionLocal.mul(isig.yzw);
    const n = normalLocal;
    normalLocal.assign(vec3(n.x.mul(c).add(n.z.mul(s)), n.y, n.z.mul(c).sub(n.x.mul(s))));
    const placed = vec3(p.x.mul(c).add(p.z.mul(s)), p.y, p.z.mul(c).sub(p.x.mul(s))).add(ipos.xyz);
    // 모션 벡터(TAA, ADR-0066 후속): 정지 물체 = 이전 위치도 같은 배치 — 없으면 속도 노드가 변환 전 정점을 써서 히스토리를 버린다(계단·반짝임).
    positionPrevious.assign(placed);
    return placed;
  })();
  const face = attribute('_face', 'float');
  const isFace = face.greaterThan(0.5);
  m.colorNode = select(isFace, signFace(isig.x, uv(), face.lessThan(1.5)), FRAME);
  m.roughnessNode = select(isFace, float(0.35), float(0.55));
  m.metalnessNode = select(isFace, float(0), float(0.6));
  return m;
}
