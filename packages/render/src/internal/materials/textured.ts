// 라이브러리 텍스처 표본 함수(sampleLayer·perturbWorld) + 지형 기본 머티리얼(`_SURF` 그룹, 월드 XZ 평면 투영, M03-T01).
// 파사드는 facade/(M03-T04), 지형 스플랫은 M03-T06. see docs/07-rendering.md §4–5
import {
  attribute,
  cameraViewMatrix,
  cross,
  float,
  int,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  select,
  vec3,
  vec4,
} from 'three/tsl';
import { type Material, MeshStandardNodeMaterial, type Node as TslNode } from 'three/webgpu';
import { MATERIAL_GROUPS, type MaterialGroup, type MaterialLibrary } from './library.ts';

type I = TslNode<'int'>;
type V3 = TslNode<'vec3'>;

export interface LayerSample {
  /** 선형 알베도. */
  albedo: V3;
  /** 탄젠트 공간 법선(−1..1). */
  normalTS: V3;
  /** (ao, roughness, metalness). */
  orm: V3;
}

/** 레이어 1장 표본: 적재 전엔 평균값, 적재 뒤엔 텍스처(ready 혼합). st = 텍스처 좌표(타일 단위). */
export function sampleLayer(lib: MaterialLibrary, layer: I, st: TslNode<'vec2'>): LayerSample {
  const a = lib.maps.albedo.sample(st).depth(layer).rgb;
  const n = lib.maps.normal.sample(st).depth(layer).rgb.mul(2).sub(1);
  const o = lib.maps.orm.sample(st).depth(layer).rgb;
  return {
    albedo: mix(lib.avgColor(layer), a, lib.ready),
    normalTS: mix(vec3(0, 0, 1), n, lib.ready),
    orm: mix(lib.avgOrm(layer), o, lib.ready),
  };
}

/** 탄젠트 공간 법선 → 뷰 공간(material.normalNode). T·B = 월드 방향(텍스처 +u·+v(이미지 위)). */
export function perturbWorld(nTS: V3, t: V3, b: V3, n: V3): V3 {
  const w = normalize(t.mul(nTS.x).add(b.mul(nTS.y)).add(n.mul(nTS.z)));
  return normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz);
}

/** `_SURF`(05 §4) → 그룹. 5 water는 M_WATER 전까지 soil, 6 ballast → gravel, 7 plaza → concrete. */
const SURF_GROUP: readonly MaterialGroup[] = [
  'asphalt',
  'sidewalk',
  'grass',
  'soil',
  'gravel',
  'soil',
  'gravel',
  'concrete',
];

export function createTerrainMaterial(lib: MaterialLibrary): Material {
  const m = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  m.name = 'terrain_ground';
  const surf = attribute('_surf', 'float').toVarying('v_surf');
  const s = int(surf.add(0.5).floor().clamp(0, 7));
  let g: I = int(MATERIAL_GROUPS.indexOf('concrete'));
  SURF_GROUP.forEach((group, i) => {
    g = select(s.equal(i), int(MATERIAL_GROUPS.indexOf(group)), g);
  });
  const layer = lib.layerOfIndex(g, float(0));
  const xz = positionWorld.xz.add(lib.worldOffset);
  const smp = sampleLayer(lib, layer, xz.mul(lib.invTile(layer)));
  m.colorNode = smp.albedo;
  m.roughnessNode = smp.orm.y;
  m.metalnessNode = float(0);
  m.aoNode = smp.orm.x;
  // 이미지 위 = 북(−Z), 오른쪽 = 동(+X). 경사면은 법선에 직교화.
  const n = normalWorld;
  const t = normalize(vec3(1, 0, 0).sub(n.mul(n.x)));
  m.normalNode = perturbWorld(smp.normalTS, t, cross(n, t), n);
  return m;
}
