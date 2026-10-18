// 포토 모드 렌더(M10-T05, 07 §7): 노출 보정(EV — 유니폼, 재컴파일 없음)·피사계 심도(DepthOfFieldNode — 포토 모드에서만 후처리를 다시 짜서 넣는다, 평소 비용 0)·고해상도 캡처(픽셀 비율 × scale, 시간 누적이 수렴할 때까지 몇 프레임 → canvas.toBlob 같은 작업 안에서).
import { depthToViewZ } from '@takram/three-geospatial/webgpu';
import { dof } from 'three/examples/jsm/tsl/display/DepthOfFieldNode.js';
import { screenUV, uniform } from 'three/tsl';
import type { Camera, TextureNode } from 'three/webgpu';

type V4 = ReturnType<typeof uniform>;

/** 노출 배율(2^EV). */
export const exposureBiasU = uniform(1);
/** 초점 거리(m)·초점 깊이(앞뒤 m — 이만큼 벗어나면 완전히 흐림)·보케 크기. */
export const dofFocusU = uniform(10);
export const dofRangeU = uniform(30);
export const dofBokehU = uniform(1);

export interface PhotoRenderState {
  dof: boolean;
}

/** HDR 뒤(톤매핑 전)에 DOF. viewZ = 장면 카메라 기준(takram depthToViewZ — 역-Z·로그 깊이 처리, ao-filter와 같음). */
export function applyDof(hdr: unknown, depth: TextureNode, camera: Camera): V4 {
  const viewZ = depthToViewZ(depth.sample(screenUV).r, camera);
  return dof(hdr as never, viewZ as never, dofFocusU, dofRangeU, dofBokehU) as unknown as V4;
}

export interface CaptureRequest {
  scale: number;
  /** 남은 수렴 프레임(0이 되는 프레임에 캡처). */
  framesLeft: number;
  resolve(b: Blob): void;
  reject(e: unknown): void;
}

/** 캡처 중 픽셀 비율. */
export const captureDpr = (base: number, c: CaptureRequest | null): number => (c ? base * c.scale : base);
