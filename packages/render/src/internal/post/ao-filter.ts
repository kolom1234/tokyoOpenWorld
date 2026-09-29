// GTAO 공간 필터(ADR-0038): GTAO 시간 노이즈(프레임마다 회전, useTemporalFiltering)는 TAAU가 다 섞지 못해 정지 화면이 떨렸다
// → GTAO는 고정 노이즈 + AO 해상도 5×5 깊이 인지 블러. GTAO 노이즈 타일이 5×5 마방진이라 평면에서는 패턴이 정확히 상쇄된다.
import { depthToViewZ } from '@takram/three-geospatial/webgpu';
import { abs, convertToTexture, Fn, float, max, screenUV, textureSize, vec2, vec4 } from 'three/tsl';
import type { Camera, TextureNode, Node as TslNode } from 'three/webgpu';

type V4 = TslNode<'vec4'>;
export type AoFilterNode = TextureNode & { setResolutionScale(s: number): unknown };

/** 이웃 깊이가 중심과 이 비율(+ 절대 여유 m) 넘게 다르면 가중치 0 — 건물 윤곽 너머로 번지지 않게. */
const REL_TOLERANCE = 0.05;
const ABS_TOLERANCE_M = 0.05;
const RADIUS = 2;

/**
 * AO 텍스처(r) → 블러 AO(r) 텍스처 노드. `resolutionScale` = GTAO와 같은 배율(aoScale × renderScale).
 * viewZ는 장면 카메라 기준(takram depthToViewZ — 역-Z·로그 처리). RTT 쿼드 패스의 `cameraNear/Far`는 쿼드 카메라(0–1)라 쓰면 안 된다.
 */
export function filterAo(ao: TextureNode, depth: TextureNode, camera: Camera, resolutionScale: number): AoFilterNode {
  const blur = Fn(() => {
    const texel = vec2(1).div(vec2(textureSize(ao) as unknown as TslNode<'ivec2'>));
    const z0 = depthToViewZ(depth.sample(screenUV).r, camera).toConst();
    const tol = abs(z0).mul(REL_TOLERANCE).add(ABS_TOLERANCE_M).toConst();
    const sum = float(0).toVar();
    const wsum = float(0).toVar();
    for (let y = -RADIUS; y <= RADIUS; y++) {
      for (let x = -RADIUS; x <= RADIUS; x++) {
        const uv = screenUV.add(vec2(x, y).mul(texel));
        const z = depthToViewZ(depth.sample(uv).r, camera);
        const w = max(float(1).sub(abs(z.sub(z0)).div(tol)), 0);
        sum.addAssign(ao.sample(uv).r.mul(w));
        wsum.addAssign(w);
      }
    }
    return vec4(sum.div(wsum.max(1e-4)), 0, 0, 1);
  })();
  const rtt = convertToTexture as unknown as (n: V4, w: null, h: null, o: { resolutionScale: number }) => AoFilterNode;
  return rtt(blur, null, null, { resolutionScale });
}
