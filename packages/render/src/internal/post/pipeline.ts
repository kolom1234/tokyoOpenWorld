// 후처리 파이프라인(07 §7): 씬 패스(MRT) → 대기 공중원근(aerialPerspective, 깊이 1 = 하늘) → 출력 변환(톤매핑 AgX·sRGB).
// M03-T02 최소 구성. GTAO·SSGI·SSR·Bloom·자동노출·TAA·LUT는 M03-T07에서 이 그래프에 추가한다.
import { aerialPerspective } from '@takram/three-atmosphere/webgpu';
import { mrt, output, pass } from 'three/tsl';
import { type Camera, RenderPipeline, type Scene, type WebGPURenderer } from 'three/webgpu';

export interface PostPipeline {
  render(): void;
  dispose(): void;
}

/**
 * 후처리 없이 직접 렌더(하늘 = scene.backgroundNode, 조명 = 대기 라이트). WebGL2 폴백 임시 경로 — 공중원근을 픽셀마다
 * CPU로 계산하는 소프트웨어 래스터(SwiftShader)에서 1.4 FPS까지 떨어진다(ADR-0028). 품질 티어(M03-T08/T09)가 대체.
 */
export function createDirectRender(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostPipeline {
  return { render: () => renderer.render(scene, camera), dispose() {} };
}

export function createPostPipeline(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostPipeline {
  const scenePass = pass(scene, camera, { samples: 0 });
  scenePass.setMRT(mrt({ output }));
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const pipeline = new RenderPipeline(renderer);
  const ap = aerialPerspective(color, depth);
  // 별(StarsNode)은 기본 데이터를 GitHub에서 받는다 — CSP(connect-src 'self')에 막히고 외부 런타임 의존이라 끈다(밤하늘 자체 에셋은 M09).
  if (ap.skyNode && 'showStars' in ap.skyNode) (ap.skyNode as { showStars: boolean }).showStars = false;
  pipeline.outputNode = ap as unknown as RenderPipeline['outputNode'];
  return {
    render: () => pipeline.render(),
    dispose() {
      pipeline.dispose();
      scenePass.dispose();
    },
  };
}
