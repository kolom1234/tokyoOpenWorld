// 태양 그림자(07 §6·§9): 대기 라이트(DirectionalLight)에 CSM(takram `CascadedShadowMapsNode` ⊃ three CSMShadowNode) — High = 4 캐스케이드 × 2048², 거리 600 m, 캐스케이드 경계 페이드.
// 태양 방향은 대기 라이트 위치(AtmosphereLightNode가 ECEF 태양 방향으로 매 프레임 갱신)에서 CSM이 읽는다. 셀 메시의 cast/receive는 cell-node가 슬롯별로 정한다.

import { CascadedShadowMapsNode } from '@takram/three-geospatial/webgpu';
import type { DirectionalLight, WebGPURenderer } from 'three/webgpu';

export interface ShadowSettings {
  cascades: number;
  mapSize: number;
  /** 그림자 거리(m, 카메라에서). */
  maxFarM: number;
}

/** 07 §9 High. 품질 티어(M03-T08)가 바꾼다. */
export const SHADOWS_HIGH: ShadowSettings = { cascades: 4, mapSize: 2048, maxFarM: 600 };

/** 그림자 카메라를 캐스케이드 상자 앞으로 당기는 여유(m): 초고층(≈ 250 m) 그림자가 캐스케이드 밖에서 잘리지 않게. */
const LIGHT_MARGIN_M = 400;
/** 캐스케이드 깊이 범위(m): 여유 + 600 m 절두체 대각선. */
const SHADOW_FAR_M = 3000;

export interface SunShadows {
  readonly node: CascadedShadowMapsNode;
  dispose(): void;
}

export function enableSunShadows(
  renderer: WebGPURenderer,
  light: DirectionalLight,
  s: ShadowSettings = SHADOWS_HIGH,
): SunShadows {
  renderer.shadowMap.enabled = true;
  light.castShadow = true;
  light.shadow.mapSize.set(s.mapSize, s.mapSize);
  light.shadow.camera.near = 1;
  light.shadow.camera.far = SHADOW_FAR_M;
  // reversed-Z·float 깊이: 작은 상수 바이어스 + 법선 바이어스로 여드름(acne)·피터팬 균형. 캐스케이드마다 CSM이 (i+1)배.
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.05;
  // takram CascadedShadowMapsNode = three CSMShadowNode + 대기 라이트·reversed-Z 보정(takram 그림자 예제와 같은 구성).
  const node = new CascadedShadowMapsNode(light);
  node.cascades = s.cascades;
  node.maxFar = s.maxFarM;
  node.mode = 'practical';
  node.lightMargin = LIGHT_MARGIN_M;
  node.fade = true;
  light.shadow.shadowNode = node as unknown as NonNullable<typeof light.shadow.shadowNode>;
  return {
    node,
    dispose() {
      node.dispose();
      light.shadow.shadowNode = null as unknown as NonNullable<typeof light.shadow.shadowNode>;
      light.castShadow = false;
      renderer.shadowMap.enabled = false;
    },
  };
}
