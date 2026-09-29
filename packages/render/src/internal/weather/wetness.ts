// 전역 환경 유니폼(EnvUniforms, 07 §3) + 노면 젖음(07 §8 비): 흡수성 표면 어두워짐, 거칠기↓, 수평면 물웅덩이(M03-T06).
// 값 출처 = EnvironmentState.weather.wetness(sim 날씨 M06 전에는 0, 디버그 `?wet=`·슬라이더). 파문 노멀·빗줄기 입자는 M06.
import { float, mix, smoothstep, uniform } from 'three/tsl';
import type { Node as TslNode, UniformNode } from 'three/webgpu';

type F = TslNode<'float'>;
type V3 = TslNode<'vec3'>;

export interface EnvUniforms {
  /** 노면 젖음 0(마름)..1(흠뻑). */
  readonly wetness: UniformNode<'float', number>;
}

export function createEnvUniforms(): EnvUniforms {
  return { wetness: uniform(0) };
}

export interface WetInput {
  albedo: V3;
  roughness: F;
  /** 월드 법선(디테일 적용 뒤). */
  normalW: V3;
  /** 0 = 비흡수(타일·금속), 1 = 흡수(아스팔트·흙·콘크리트). */
  porosity: F;
  /** 물웅덩이 허용(0..1): 포장면 1, 잔디 0. */
  puddle: F;
  /** 물웅덩이 노이즈 0..1(3–30 m 규모, noiseBank n9.y·n29.w·n1.w). */
  puddleNoise: F;
  /** 기하 법선 y(웅덩이 = 수평면만). */
  flatY: F;
  /** 기하(디테일 전) 월드 법선 — 웅덩이 수면. */
  geomNormalW: V3;
}

export interface WetOutput {
  albedo: V3;
  roughness: F;
  normalW: V3;
}

/** 물웅덩이가 생기기 시작하는 젖음·마스크 폭. */
const PUDDLE_START = 0.35;

export function applyWetness(i: WetInput, wet: F): WetOutput {
  // 흡수 표면: 물이 스며 알베도 ↓(최대 −55 %), 수막으로 거칠기 ↓.
  const soak = wet.mul(i.porosity);
  const albedo = i.albedo.mul(float(1).sub(soak.mul(0.55)));
  const film = mix(i.roughness, i.roughness.mul(0.3).max(0.08), wet);
  // 물웅덩이: 수평면(n.y > 0.97)·저주파 노이즈가 젖음에 따라 넓어진다.
  const level = float(1.02).sub(wet.sub(PUDDLE_START).max(0).mul(0.75));
  const mask = smoothstep(level, level.add(0.06), i.puddleNoise)
    .mul(smoothstep(0.97, 0.995, i.flatY))
    .mul(i.puddle);
  return {
    albedo: mix(albedo, albedo.mul(0.8), mask),
    roughness: mix(film, float(0.03), mask),
    normalW: mix(i.normalW, i.geomNormalW, mask).normalize(),
  };
}
