// 빌드 때 구운 하늘 가시도(M12-T05, ADR-0110) → 간접광 차폐: 정점 `_sky`(0..255, cell-node가 f32로 — 없으면 255) → mix(바닥, 1, 하늘).
// 하늘이 거의 안 보여도 지면·벽 반사광이 남으므로 0이 아니라 바닥값까지만 어둡힌다. 화면공간 GTAO(수 m)와 겹치지 않는 큰 차폐(골목·고층 사이).
import { attribute, float, mix } from 'three/tsl';
import type { Node as TslNode } from 'three/webgpu';

/** 하늘이 다 가려졌을 때 남는 간접광 비율(반사광). */
export const SKY_AO_FLOOR = 0.35;

export function skyAo(): TslNode<'float'> {
  return mix(float(SKY_AO_FLOOR), float(1), attribute('_sky', 'float').div(255));
}
