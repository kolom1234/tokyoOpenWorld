// M_GLASS 셰이딩(07 §4·§5-4, M03-T05): 유리 = 어두운 반사 유전체(PBR 스페큘러 — 환경 프로브, SSR은 T07) + 투과로 보이는 실내(발광 채널,
// (1 − 프레넬) × 투과율 × 실내 밝기) + 블라인드(유리 안쪽 확산면 — 바깥 햇빛을 그대로 받으므로 알베도로). 파사드 창·커튼월·상점 유리가 공유.
import {
  cameraPosition,
  float,
  fract,
  max,
  mix,
  positionWorld,
  pow,
  select,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import type { Node as TslNode } from 'three/webgpu';

type F = TslNode<'float'>;
type B = TslNode<'bool'>;
type V3 = TslNode<'vec3'>;

/** 실내 밝기(발광 배율): 낮 실내는 밖에서 보면 어두운 유리 너머로 희미하게(0.35는 창이 흰색, 0.015–0.02에서 사진과 비슷 — class-office 골든뷰로 맞춤). 야간 점등은 M09. */
export const interiorExposure = uniform(0.02);
/** 투과율: 일반 유리 / 커튼월(반사 코팅·색유리). */
const TRANSMIT_CLEAR = 0.8;
const TRANSMIT_CURTAIN = 0.35;
const BLIND_COLOR = vec3(0.6, 0.58, 0.54);

export interface GlassInput {
  /** 유리 마스크 0..1. */
  glass: F;
  /** 실내 색(선형, 큐브맵). */
  interior: V3;
  /** 블라인드가 이 픽셀을 덮는가 0..1. */
  blind: F;
  /** 블라인드 살 무늬용 높이(m). */
  y: F;
  curtain: B;
  /** 유리 바탕색(선형, 창마다 조금씩). */
  tint: V3;
  /** 월드 법선. */
  n: V3;
}

export interface GlassOutput {
  /** 유리 부분 알베도(블라인드 반영). */
  albedo: V3;
  /** 유리 부분 거칠기. */
  roughness: F;
  /** 발광(실내 투과), 유리 마스크 곱해짐. */
  emissive: V3;
}

export function glassShading(i: GlassInput): GlassOutput {
  const view = cameraPosition.sub(positionWorld).normalize();
  const nv = max(i.n.dot(view), 0);
  const fresnel = float(0.04).add(float(0.96).mul(pow(float(1).sub(nv), 5)));
  const transmit = select(i.curtain, float(TRANSMIT_CURTAIN), float(TRANSMIT_CLEAR));
  const slat = smoothstep(0.1, 0.35, fract(i.y.mul(16)))
    .mul(0.25)
    .add(0.75);
  const blindAlbedo = BLIND_COLOR.mul(slat);
  const seen = float(1).sub(fresnel).mul(transmit).mul(float(1).sub(i.blind)).mul(i.glass);
  return {
    albedo: mix(i.tint, blindAlbedo, i.blind),
    roughness: mix(float(0.06), float(0.75), i.blind),
    emissive: i.interior.mul(interiorExposure).mul(seen),
  };
}
