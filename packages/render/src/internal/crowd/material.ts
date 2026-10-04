// 군중 머티리얼(07 §4 M_CHARACTER, M06-T01·ADR-0057): VAT 대신 **뼈 팔레트 텍스처 스키닝** — 정점 4영향 × (사원수 + 이동) 2텍셀 textureLoad,
// 위치·법선 = Σ w·(q ⊗ v + t). 인스턴싱 = InstancedBufferGeometry 속성(나무와 같은 이유 — 노드 빌드 1번을 48풀이 공유):
// `_ipos`(x, y, z 렌더 좌표, 모델 yaw), `_ianim`(행 시작, 프레임 수, 프레임 위치, 키 배율), `_ivar`(아틀라스 층, 밝기, 0, 0).
// 색 = 아틀라스 배열(몸·머리·머리털 사분면) × 밝기, 머리털 알파 테스트.
import {
  attribute,
  cos,
  cross,
  Fn,
  float,
  floor,
  int,
  ivec2,
  max,
  normalLocal,
  positionLocal,
  round,
  sin,
  texture,
  textureLoad,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshStandardNodeMaterial, type Node as TslNode } from 'three/webgpu';
import { type CrowdAssets, PALETTE_WIDTH } from './assets.ts';

type V3 = TslNode<'vec3'>;
type V4 = TslNode<'vec4'>;

const ipos = attribute('_ipos', 'vec4');
const ianim = attribute('_ianim', 'vec4');
const ivar = attribute('_ivar', 'vec4');
const joints = attribute('_joints', 'vec4');
const weights = attribute('_weights', 'vec4');

/** 사원수 q로 v 회전: v + 2·q.xyz × (q.xyz × v + q.w·v). */
const rotate = (q: V4, v: V3): V3 => {
  const u = q.xyz;
  return v.add(cross(u, cross(u, v).add(v.mul(q.w))).mul(2));
};

export function createCrowdMaterial(a: CrowdAssets): MeshStandardNodeMaterial {
  const bones = int(a.bones);
  const width = int(PALETTE_WIDTH);
  const fetchTexel = (i: TslNode<'int'>): V4 =>
    textureLoad(a.palette, ivec2(i.mod(width), i.div(width))) as unknown as V4;
  const material = new MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
  material.positionNode = Fn(() => {
    const frame = int(floor(ianim.z)).mod(int(max(ianim.y, float(1))));
    const row = int(ianim.x).add(frame);
    const p = positionLocal;
    const n = normalLocal.xyz;
    let sp: V3 = vec3(0);
    let sn: V3 = vec3(0);
    for (const k of ['x', 'y', 'z', 'w'] as const) {
      const j = int(round(joints[k].mul(255)));
      const base = row.mul(bones).add(j).mul(2);
      const q = fetchTexel(base);
      const t = fetchTexel(base.add(1)).xyz;
      const w = weights[k];
      sp = sp.add(rotate(q, p).add(t).mul(w));
      sn = sn.add(rotate(q, n).mul(w));
    }
    const c = cos(ipos.w);
    const s = sin(ipos.w);
    const ps = sp.mul(ianim.w);
    normalLocal.assign(vec3(sn.x.mul(c).add(sn.z.mul(s)), sn.y, sn.z.mul(c).sub(sn.x.mul(s))));
    return vec3(ps.x.mul(c).add(ps.z.mul(s)), ps.y, ps.z.mul(c).sub(ps.x.mul(s))).add(ipos.xyz);
  })();
  const tex = texture(a.atlas, uv()).depth(int(ivar.x));
  material.colorNode = vec4(tex.rgb.mul(ivar.y), float(1));
  material.opacityNode = tex.a;
  material.alphaTest = 0.5;
  return material;
}
