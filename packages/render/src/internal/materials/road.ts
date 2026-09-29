// M_ROAD 변형(07 §4, M03-T06): 아스팔트 보수 패치·유분 얼룩·바랜 구간, 보도 명암·때, 공통 거시 명암. 추가 표본 없이 noiseBank 채널만.
// 도로 메시·연석·차선 데칼은 M05-T01(도로 기하). 균열은 라이브러리 레이어 텍스처 자체의 것.
// 채널: n1.y 유분·n1.z 때(세) / n3.y 패치(세)·n3.z 보도 구간·n3.w 때(조) / n9.z 패치·n9.w 유분 분포 / n29.x·z 거시·n29.y 바램.
import { float, mix, smoothstep } from 'three/tsl';
import type { Node as TslNode } from 'three/webgpu';
import type { NoiseBank } from './noise.ts';

type F = TslNode<'float'>;

/** 표면 보정 계수: albedo × albedoMul, roughness × roughMul + roughAdd. */
export interface Variation {
  albedoMul: F;
  roughMul: F;
  roughAdd: F;
}

export const NO_VARIATION: Variation = { albedoMul: float(1), roughMul: float(1), roughAdd: float(0) };

/** 모든 지면 공통 거시 명암(수십 m 규모) — 넓은 면에서 타일 반복이 띠로 보이지 않게. */
export function macroTint(nb: NoiseBank): F {
  return nb.n29.x.mul(0.65).add(nb.n29.z.mul(0.35)).mul(0.24).add(0.88);
}

/** 아스팔트: 보수 패치(더 어둡고 매끈한 새 포장), 유분 얼룩, 바랜 구간. */
export function asphaltVariation(nb: NoiseBank): Variation {
  const patch = smoothstep(0.7, 0.71, nb.n9.z.mul(0.7).add(nb.n3.y.mul(0.3)));
  const faded = nb.n29.y.mul(0.2).add(0.92);
  const oil = smoothstep(0.84, 0.95, nb.n1.y).mul(smoothstep(0.6, 0.75, nb.n9.w));
  return {
    albedoMul: faded.mul(mix(float(1), float(0.78), patch)).mul(float(1).sub(oil.mul(0.25))),
    roughMul: mix(float(1), float(0.88), patch).mul(float(1).sub(oil.mul(0.4))),
    roughAdd: float(0),
  };
}

/** 보도: 구간별 명암 차(교체 시기), 때. */
export function pavingVariation(nb: NoiseBank): Variation {
  const zone = nb.n3.z.mul(0.12).add(0.94);
  const grime = smoothstep(0.55, 0.85, nb.n3.w.mul(0.6).add(nb.n1.z.mul(0.4))).mul(0.18);
  return { albedoMul: zone.mul(float(1).sub(grime)), roughMul: float(1), roughAdd: grime.mul(0.1) };
}
