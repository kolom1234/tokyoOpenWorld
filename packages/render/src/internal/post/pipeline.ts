// 후처리 파이프라인(07 §7, M03-T07 확정 순서): 씬 패스 MRT(output·normal+roughness·velocity·[diffuse+metalness])
//  → AO/GI(GTAO 또는 SSGI 합성) → SSR(가산) → 대기 공중원근(aerialPerspective, 깊이 1 = 하늘) → 자동 노출 → Bloom(가산)
//  → TRAA(렌더 스케일 1) 또는 TAAU(< 1, 앞 단계 전부 저해상도) → 출력 변환(AgX·sRGB, renderOutput) → 3D LUT → Sharpen.
// 효과 스위치 = post/config.ts(품질 티어 + 덮어쓰기).
// WebGL2 폴백은 직접 렌더(M03-T09가 대체).
import { aerialPerspective } from '@takram/three-atmosphere/webgpu';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ao as gtao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { lut3D } from 'three/examples/jsm/tsl/display/Lut3DNode.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { ssgi } from 'three/examples/jsm/tsl/display/SSGINode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { taau } from 'three/examples/jsm/tsl/display/TAAUNode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import {
  colorToDirection,
  convertToTexture,
  diffuseColor,
  directionToColor,
  float,
  metalness,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  roughness,
  sample,
  screenUV,
  texture3D,
  uniform,
  vec4,
  velocity,
} from 'three/tsl';
import {
  type Camera,
  type PassNode,
  type PerspectiveCamera,
  RenderPipeline,
  type Scene,
  type Node as TslNode,
  UnsignedByteType,
  type WebGPURenderer,
} from 'three/webgpu';
import type { PostEffects } from '../../api.ts';
import { type AutoExposure, createAutoExposure } from './exposure.ts';
import { createGradeLut, LUT_SIZE } from './lut.ts';

type V4 = TslNode<'vec4'>;

/** r186 SSGINode: 결과는 AO·GI 텍스처 2장(해상도 배율 없음 — 항상 전체 해상도). */
interface SsgiNode {
  sliceCount: { value: number };
  stepCount: { value: number };
  getAONode(): { sample(uv: TslNode<'vec2'>): V4 };
  getGINode(): { sample(uv: TslNode<'vec2'>): V4 };
  dispose(): void;
}

export interface PostPipeline {
  render(dtS: number): void;
  /** 적용 중 효과(직접 렌더 = null). */
  readonly effects: PostEffects | null;
  /** 자동 노출 최근 값(없으면 null). */
  exposure(): { lum: number; scale: number } | null;
  dispose(): void;
}

/**
 * 후처리 없이 직접 렌더(하늘 = scene.backgroundNode, 조명 = 대기 라이트). WebGL2 폴백 임시 경로 — 공중원근을 픽셀마다
 * CPU로 계산하는 소프트웨어 래스터(SwiftShader)에서 1.4 FPS까지 떨어진다(ADR-0028). 품질 티어(M03-T08/T09)가 대체.
 */
export function createDirectRender(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostPipeline {
  return { render: () => renderer.render(scene, camera), effects: null, exposure: () => null, dispose() {} };
}

/**
 * MRT: output(RGBA16F) + normal(RGBA8, a = roughness) + velocity + [diffuse(RGBA8, a = metalness)] = 24 B/샘플 —
 * WebGPU 기본 한도 maxColorAttachmentBytesPerSample 32 안(따로 두면 40 B로 검증 실패).
 */
function scenePassOf(scene: Scene, camera: Camera, fx: PostEffects): PassNode {
  const scenePass = pass(scene, camera, { samples: 0 });
  const needDiffuse = fx.ao === 'ssgi' || fx.ssr;
  scenePass.setMRT(
    mrt({
      output,
      normal: vec4(directionToColor(normalView), roughness),
      velocity,
      ...(needDiffuse ? { diffuse: vec4(diffuseColor.rgb, metalness) } : {}),
    }),
  );
  scenePass.getTexture('normal').type = UnsignedByteType;
  if (needDiffuse) scenePass.getTexture('diffuse').type = UnsignedByteType;
  if (fx.renderScale < 1) scenePass.setResolutionScale(fx.renderScale);
  return scenePass;
}

/** 중간 결과를 렌더 스케일 해상도 텍스처로(TAAU 전 단계는 전부 저해상도). */
function lowRes(node: V4, fx: PostEffects): V4 {
  const rtt = convertToTexture as unknown as (n: V4, w: null, h: null, o: { resolutionScale: number }) => V4;
  return rtt(node, null, null, { resolutionScale: fx.renderScale });
}

/** AO/GI·SSR을 씬 색에 합성(대기 전). 반환 = 대기 입력 텍스처 노드. */
function lightingComposite(
  scenePass: PassNode,
  camera: PerspectiveCamera,
  fx: PostEffects,
): { color: V4; nodes: { dispose(): void }[] } {
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const normalTex = scenePass.getTextureNode('normal');
  const normal = sample((uv) => colorToDirection(normalTex.sample(uv).xyz));
  const nodes: { dispose(): void }[] = [];
  let lit: V4 = color;
  if (fx.ao === 'gtao') {
    const a = gtao(depth, normal, camera);
    a.resolutionScale = fx.aoScale * fx.renderScale;
    // 도시 규모(미터): 반경 0.5 m(1 m는 +2 ms), 표본 8(TAA가 시간 누적 — 16표본 대비 ≈ 절반 비용).
    a.radius.value = 0.5;
    a.samples.value = fx.taa ? 8 : 16;
    a.useTemporalFiltering = fx.taa;
    nodes.push(a);
    lit = vec4(color.rgb.mul(a.getTextureNode().sample(screenUV).r), color.a);
  } else if (fx.ao === 'ssgi') {
    const g = ssgi(color, depth, normal, camera) as unknown as SsgiNode;
    g.sliceCount.value = 2;
    g.stepCount.value = 8;
    nodes.push(g);
    const occ = g.getAONode().sample(screenUV).r;
    const gi = g.getGINode().sample(screenUV).rgb;
    const diffuse = scenePass.getTextureNode('diffuse');
    lit = vec4(color.rgb.mul(occ).add(diffuse.rgb.mul(gi)), color.a);
  }
  if (fx.ssr) {
    const s = ssr(color, depth, normal, {
      metalnessNode: scenePass.getTextureNode('diffuse').a,
      roughnessNode: normalTex.a,
      reflectNonMetals: true,
      camera,
    });
    s.resolutionScale = 0.5 * fx.renderScale;
    nodes.push(s);
    lit = vec4(lit.rgb.add(s.getTextureNode().sample(screenUV).rgb), lit.a);
  }
  return { color: lit === color ? color : lowRes(lit, fx), nodes };
}

export function createPostPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  fx: PostEffects,
): PostPipeline {
  const scenePass = scenePassOf(scene, camera, fx);
  const depth = scenePass.getTextureNode('depth');
  const pipeline = new RenderPipeline(renderer);
  const { color, nodes } = lightingComposite(scenePass, camera, fx);
  const ap = aerialPerspective(color, depth);
  // 별(StarsNode)은 기본 데이터를 GitHub에서 받는다 — CSP(connect-src 'self')에 막히고 외부 런타임 의존이라 끈다(밤하늘 자체 에셋은 M09).
  if (ap.skyNode && 'showStars' in ap.skyNode) (ap.skyNode as { showStars: boolean }).showStars = false;
  const exposure: AutoExposure | undefined = fx.autoExposure
    ? createAutoExposure(scenePass.getTexture('output'))
    : undefined;
  let hdr: V4 = (ap as unknown as V4).mul(exposure ? exposure.scale : float(1));
  if (fx.bloom) {
    const b = bloom(hdr, 0.08, 0.35, 1.2);
    // 넓은 흐림이라 ¼ 해상도로 충분(기본 ½ 대비 ≈ −1.5 ms).
    b.setResolutionScale(0.25);
    nodes.push(b);
    hdr = hdr.add(b);
  }
  if (fx.taa) {
    const vel = scenePass.getTextureNode('velocity');
    if (fx.renderScale < 1) {
      const t = taau(lowRes(hdr, fx) as unknown as Parameters<typeof taau>[0], depth, vel, camera);
      nodes.push(t);
      hdr = t as unknown as V4;
    } else {
      const t = traa(hdr, depth, vel, camera);
      t.useSubpixelCorrection = false;
      nodes.push(t);
      hdr = t as unknown as V4;
    }
  }
  pipeline.outputColorTransform = false;
  let out: V4 = renderOutput(hdr);
  const lut = fx.lut ? createGradeLut() : undefined;
  if (lut) out = lut3D(out, texture3D(lut), LUT_SIZE, uniform(1)) as unknown as V4;
  if (fx.sharpen) out = sharpen(out, 0.15) as unknown as V4;
  pipeline.outputNode = out;
  return {
    render(dtS) {
      pipeline.render();
      exposure?.update(renderer, dtS);
    },
    effects: fx,
    exposure: () => (exposure ? { ...exposure.last } : null),
    dispose() {
      pipeline.dispose();
      scenePass.dispose();
      for (const n of nodes) n.dispose();
      exposure?.dispose();
      lut?.dispose();
    },
  };
}
