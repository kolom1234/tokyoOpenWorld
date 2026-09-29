// 환경 조명(07 §6): 하늘에서 동적 큐브맵 → PMREM(`SkyEnvironmentNode`) → scene.environmentNode.
// 확산·반사 간접광을 환경맵이 주므로 AtmosphereLight의 간접(하늘 조도)은 끈다(이중 계산 방지). 갱신 = 카메라 이동 ≥ 1 km 또는 태양 각도 변화(라이브러리 임계값).
import type { AtmosphereLight } from '@takram/three-atmosphere/webgpu';
import { skyEnvironment } from '@takram/three-atmosphere/webgpu';
import type { Scene } from 'three/webgpu';

/** 큐브 한 면 크기(px). 하늘만 담는 저주파 환경이라 64면 충분(PMREM 거칠기 단계가 흐림을 더한다). */
export const ENV_CUBE_SIZE = 64;

export interface EnvProbe {
  dispose(): void;
}

export function attachEnvProbe(scene: Scene, light: AtmosphereLight, size = ENV_CUBE_SIZE): EnvProbe {
  const env = skyEnvironment(size);
  scene.environmentNode = env as unknown as NonNullable<Scene['environmentNode']>;
  light.indirect.value = false;
  return {
    dispose() {
      scene.environmentNode = null;
      light.indirect.value = true;
      env.dispose();
    },
  };
}
