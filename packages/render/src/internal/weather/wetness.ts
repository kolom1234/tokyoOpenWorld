// 전역 환경 유니폼(EnvUniforms, 07 §3) + 노면 젖음(07 §8 비): 흡수성 표면 어두워짐, 거칠기↓, 수평면 물웅덩이(M03-T06), 비 파문 노멀(M09-T01).
// 값 출처 = EnvironmentState.weather(sim 날씨 M09-T01 — wetness·rainMmH, 디버그 `?wet=`·슬라이더). 빗줄기 입자 = weather/rain.ts.
import { exp, float, floor, fract, hash, mix, sin, smoothstep, uniform, vec2, vec3 } from 'three/tsl';
import type { Node as TslNode, UniformNode } from 'three/webgpu';

type F = TslNode<'float'>;
type V2 = TslNode<'vec2'>;
type V3 = TslNode<'vec3'>;

export interface EnvUniforms {
  /** 노면 젖음 0(마름)..1(흠뻑). */
  readonly wetness: UniformNode<'float', number>;
  /** 비 세기 0..1(파문 — rainMmH / 8, M09-T01). */
  readonly rain: UniformNode<'float', number>;
  /** 파문 시각(s, 실시간 누적 — 1시간마다 감음). */
  readonly time: UniformNode<'float', number>;
}

export function createEnvUniforms(): EnvUniforms {
  return { wetness: uniform(0), rain: uniform(0), time: uniform(0) };
}

/** 파문 칸(m)·고리 최대 반경(m)·주기(s). */
const RIPPLE_CELL_M = 0.42;
const RIPPLE_MAX_R = 0.16;
const RIPPLE_RATE = 1.3;

/** 비 파문 한 겹: 칸마다 무작위 위치·위상의 퍼지는 고리 → 법선 기울기(xz). */
function rippleLayer(xz: V2, time: F, salt: number): V2 {
  const g = xz.div(RIPPLE_CELL_M);
  const cell = floor(g);
  const seed = cell.x.mul(157.31).add(cell.y.mul(311.7)).add(salt);
  const center = vec2(hash(seed.add(1.3)), hash(seed.add(7.1)))
    .mul(0.6)
    .add(0.2);
  const phase = fract(time.mul(RIPPLE_RATE).add(hash(seed.add(3.9))));
  const d = fract(g).sub(center).mul(RIPPLE_CELL_M);
  const r = d.length().max(1e-4);
  const ring = r.sub(phase.mul(RIPPLE_MAX_R));
  const slope = sin(ring.mul(90))
    .mul(exp(ring.abs().mul(-60)))
    .mul(float(1).sub(phase));
  return d.div(r).mul(slope);
}

/** 빗방울 파문 법선 기울기(두 겹 합, 세기 = rain). */
export function rainRipples(xz: V2, rain: F, time: F): V2 {
  return rippleLayer(xz, time, 0)
    .add(rippleLayer(xz.add(vec2(0.21, 0.13)), time.add(0.37), 19))
    .mul(rain.mul(0.35));
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
  /** 비 파문(M09-T01): 월드 xz(m)·비 세기·시각. 없으면 파문 없음. */
  ripple?: { xz: V2; rain: F; time: F };
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
  // 파문: 웅덩이 수면에 강하게, 젖은 평면(수막)에는 약하게.
  let water: V3 = i.geomNormalW;
  if (i.ripple) {
    const s = rainRipples(i.ripple.xz, i.ripple.rain, i.ripple.time).mul(smoothstep(0.97, 0.995, i.flatY));
    water = i.geomNormalW.add(vec3(s.x, 0, s.y)).normalize();
  }
  const filmN = i.ripple ? mix(i.normalW, water, wet.mul(0.35)) : i.normalW;
  return {
    albedo: mix(albedo, albedo.mul(0.8), mask),
    roughness: mix(film, float(0.03), mask),
    normalW: mix(filmN, water, mask).normalize(),
  };
}
