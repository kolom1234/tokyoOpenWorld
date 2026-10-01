// 셰이더 2D 값 노이즈(TSL): 지형 안티타일링·아스팔트 변형·물웅덩이 마스크(M03-T06). 입력 = 월드 고정 좌표(worldOffset 적용, m).
// ALU 해시(PCG ×4/격자점)는 지면 픽셀당 ≈ 160회 → 1440p에서 7–9 ms였다 → 256² RGBA 격자값 텍스처(채널 = 독립 격자 4개) 표본으로 대체.
// 표본 = 격자 좌표에 smoothstep을 먹인 "부드러운 하드웨어 보간"(C1). 지면은 noiseBank(4표본)만 쓴다.
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import { float, fract, texture, vec2 } from 'three/tsl';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  type Texture,
  type Node as TslNode,
  UnsignedByteType,
} from 'three/webgpu';

type V2 = TslNode<'vec2'>;

/** 격자 한 변(텍셀 = 격자점 1개, 반복 주기 256 단위). */
const N = 256;

let shared: Texture | undefined;

/** 결정론 격자값 텍스처(모든 머티리얼 공유, 페이지 수명). */
export function noiseTexture(): Texture {
  if (shared) return shared;
  const rng = createRng(hash32(WORLD_SEED, 'render', 'noise-lattice'));
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < data.length; i++) data[i] = rng.int(0, 256);
  const t = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.name = 'noise-lattice';
  t.needsUpdate = true;
  shared = t;
  return t;
}

/** 격자 좌표 p(1 단위 = 격자 1칸)의 부드러운 보간 표본(RGBA 0..1). */
export function lattice(p: V2): TslNode<'vec4'> {
  const i = p.floor();
  const f = fract(p);
  const w = f.mul(f).mul(float(3).sub(f.mul(2)));
  return texture(noiseTexture(), i.add(w).add(0.5).div(N));
}

/**
 * 지면 셰이더가 쓰는 노이즈 묶음: 4개 축척(1.2·3.3·9·29 m) × 독립 채널 4개 = 표본 4회로 마스크 16종.
 * 채널 배정은 사용처(terrain·road·wetness) 주석 참고 — 같은 채널을 두 곳에서 쓰면 무늬가 상관된다.
 */
export interface NoiseBank {
  n1: TslNode<'vec4'>;
  n3: TslNode<'vec4'>;
  n9: TslNode<'vec4'>;
  n29: TslNode<'vec4'>;
}

export function noiseBank(xz: V2): NoiseBank {
  return {
    n1: lattice(xz.div(1.2)).toVar(),
    n3: lattice(xz.div(3.3).add(vec2(17.1, 5.3))).toVar(),
    n9: lattice(xz.div(9).add(vec2(41.7, 23.9))).toVar(),
    n29: lattice(xz.div(29).add(vec2(7.7, 61.3))).toVar(),
  };
}
