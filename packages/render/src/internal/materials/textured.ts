// 라이브러리 텍스처 표본 함수(sampleLayer·법선 변환, M03-T01). 지형은 terrain.ts(M03-T06), 파사드는 facade/(M03-T04).
// see docs/07-rendering.md §4–5
import { cameraViewMatrix, mix, normalize, vec3, vec4 } from 'three/tsl';
import type { Node as TslNode } from 'three/webgpu';
import type { MaterialLibrary } from './library.ts';

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

/** 탄젠트 공간 법선 → 월드. T·B = 월드 방향(텍스처 +u·+v(이미지 위)). */
export function tsToWorld(nTS: V3, t: V3, b: V3, n: V3): V3 {
  return normalize(t.mul(nTS.x).add(b.mul(nTS.y)).add(n.mul(nTS.z)));
}

/** 월드 법선 → 뷰 공간(material.normalNode). */
export function worldToView(w: V3): V3 {
  return normalize(cameraViewMatrix.mul(vec4(w, 0)).xyz);
}

/** 탄젠트 공간 법선 → 뷰 공간(material.normalNode). */
export function perturbWorld(nTS: V3, t: V3, b: V3, n: V3): V3 {
  return worldToView(tsToWorld(nTS, t, b, n));
}
