// 후처리 파이프라인(07 §7, M03-T07 확정 순서): 씬 패스 MRT(output·normal+roughness·velocity·[diffuse+metalness])
//  → AO/GI(GTAO 또는 SSGI 합성) → SSR(가산) → 대기 공중원근(aerialPerspective, 깊이 1 = 하늘) → 자동 노출 → Bloom(가산)
//  → TAAU(앞 단계 전부 렌더 스케일 해상도 — 동적 해상도 M03-T08) → 출력 변환(AgX·sRGB, renderOutput) → 3D LUT → Sharpen.
// 효과 스위치 = post/config.ts(품질 티어 + 덮어쓰기).
// WebGL2 폴백은 직접 렌더(M03-T09가 대체).
import { type AtmosphereContext, aerialPerspective } from '@takram/three-atmosphere/webgpu';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { ao as gtao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { lut3D } from 'three/examples/jsm/tsl/display/Lut3DNode.js';
import { sharpen } from 'three/examples/jsm/tsl/display/SharpenNode.js';
import { ssgi } from 'three/examples/jsm/tsl/display/SSGINode.js';
import { ssr } from 'three/examples/jsm/tsl/display/SSRNode.js';
import { taau } from 'three/examples/jsm/tsl/display/TAAUNode.js';
import {
  convertToTexture,
  cos,
  diffuseColor,
  Fn,
  float,
  floatBitsToUint,
  Loop,
  metalness,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  renderOutput,
  roughness,
  sample,
  screenUV,
  select,
  sin,
  texture3D,
  uint,
  uniform,
  unpackRGBToNormal,
  vec4,
  velocity,
} from 'three/tsl';
import {
  type Camera,
  type PassNode,
  type PerspectiveCamera,
  RenderPipeline,
  type Scene,
  type TextureNode,
  type Node as TslNode,
  UnsignedByteType,
  type WebGPURenderer,
} from 'three/webgpu';
import type { PostEffects } from '../../api.ts';
import { composeAerial, LowResAerialNode } from './aerial.ts';
import { filterAo } from './ao-filter.ts';
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
  /** 동적 해상도: 씬 패스·중간 RTT·AO·SSR 해상도 배율(TAAU가 출력 해상도로 복원). */
  setRenderScale(scale: number): void;
  dispose(): void;
}

/**
 * 후처리 없이 직접 렌더(하늘 = scene.backgroundNode, 조명 = 대기 라이트). WebGL2 폴백 임시 경로 — 공중원근을 픽셀마다
 * CPU로 계산하는 소프트웨어 래스터(SwiftShader)에서 1.4 FPS까지 떨어진다(ADR-0028). 품질 티어(M03-T08/T09)가 대체.
 */
export function createDirectRender(renderer: WebGPURenderer, scene: Scene, camera: Camera): PostPipeline {
  return {
    render: () => renderer.render(scene, camera),
    effects: null,
    exposure: () => null,
    setRenderScale() {},
    dispose() {},
  };
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
      normal: vec4(packNormalToRGB(normalView), roughness),
      velocity,
      ...(needDiffuse ? { diffuse: vec4(diffuseColor.rgb, metalness) } : {}),
    }),
  );
  scenePass.getTexture('normal').type = UnsignedByteType;
  if (needDiffuse) scenePass.getTexture('diffuse').type = UnsignedByteType;
  if (fx.taa && fx.renderScale < 1) scenePass.setResolutionScale(fx.renderScale);
  return scenePass;
}

/** 렌더 스케일을 따라가는 노드들(동적 해상도). */
interface Scalables {
  rtts: { setResolutionScale(s: number): unknown }[];
  ao?: { resolutionScale: number };
  aoFilter?: { setResolutionScale(s: number): unknown };
  aerial?: { renderScale: number };
  ssr?: { resolutionScale: number };
}

/** 중간 결과를 렌더 스케일 해상도 텍스처로(TAAU 전 단계는 전부 저해상도). */
function lowRes(node: V4, fx: PostEffects, sc: Scalables): V4 {
  type Rtt = V4 & { setResolutionScale(s: number): unknown };
  const rtt = convertToTexture as unknown as (n: V4, w: null, h: null, o: { resolutionScale: number }) => Rtt;
  const t = rtt(node, null, null, { resolutionScale: fx.renderScale });
  sc.rtts.push(t);
  return t;
}

/** 디버그 GPU 부하(`?gpuLoad=n`, M03-T08 수락 — 렌더 스케일 해상도에서 픽셀당 n회 삼각함수). 결과는 1e-9배로만 섞는다. */
function gpuLoad(n: number): TslNode<'float'> {
  return Fn(() => {
    const acc = float(0).toVar();
    Loop(n, ({ i }) => {
      acc.addAssign(sin(screenUV.x.mul(float(i as unknown as TslNode<'float'>).add(1))).mul(cos(screenUV.y.add(acc))));
    });
    return acc.mul(1e-9);
  })();
}

/** AO/GI·SSR을 씬 색에 합성(대기 전). 반환 = 대기 입력 텍스처 노드. */
function lightingComposite(
  scenePass: PassNode,
  camera: PerspectiveCamera,
  fx: PostEffects,
  sc: Scalables,
  load: number,
): { color: V4; nodes: { dispose(): void }[] } {
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const normalTex = scenePass.getTextureNode('normal');
  const normal = sample((uv) => unpackRGBToNormal(normalTex.sample(uv).xyz));
  const nodes: { dispose(): void }[] = [];
  let lit: V4 = color;
  if (fx.ao === 'gtao') {
    const a = gtao(depth, normal, camera);
    a.resolutionScale = fx.aoScale * fx.renderScale;
    // 도시 규모(미터): 반경 0.5 m(1 m는 +2 ms), 표본 8. 시간 노이즈(useTemporalFiltering)는 TAAU가 다 섞지 못해
    // 정지 화면이 떨린다 → 고정 노이즈 + 5×5 깊이 인지 블러(ADR-0038).
    a.radius.value = 0.5;
    a.samples.value = 8;
    a.useTemporalFiltering = false;
    sc.ao = a;
    nodes.push(a);
    const f = filterAo(a.getTextureNode(), depth, camera, a.resolutionScale);
    sc.aoFilter = f;
    lit = vec4(color.rgb.mul(f.sample(screenUV).r), color.a);
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
    sc.ssr = s;
    nodes.push(s);
    lit = vec4(lit.rgb.add(s.getTextureNode().sample(screenUV).rgb), lit.a);
  }
  if (load > 0) lit = vec4(lit.rgb.add(gpuLoad(load)), lit.a);
  return { color: lit === color ? color : lowRes(lit, fx, sc), nodes };
}

/** 대기 공중원근: 'half' = 저해상도 S·T + 깊이 인지 업샘플(ADR-0039), 'full' = takram aerialPerspective(픽셀마다). */
function aerialOf(
  renderer: WebGPURenderer,
  color: V4,
  depth: TextureNode,
  camera: PerspectiveCamera,
  fx: PostEffects,
  sc: Scalables,
  nodes: { dispose(): void }[],
): V4 {
  if (fx.aerial === 'half') {
    const low = new LowResAerialNode(depth, fx.renderScale);
    sc.aerial = low;
    nodes.push(low);
    // 대기 컨텍스트 = lighting/atmosphere.ts가 renderer.contextNode에 넣은 것.
    const atm = (renderer.contextNode.value as { getAtmosphere(): AtmosphereContext }).getAtmosphere();
    return composeAerial(color, depth, low, camera, atm, renderer.reversedDepthBuffer);
  }
  const ap = aerialPerspective(color, depth);
  // 별(StarsNode)은 기본 데이터를 GitHub에서 받는다 — CSP(connect-src 'self')에 막히고 외부 런타임 의존이라 끈다(밤하늘 자체 에셋은 M09).
  if (ap.skyNode && 'showStars' in ap.skyNode) (ap.skyNode as { showStars: boolean }).showStars = false;
  return ap as unknown as V4;
}

/** 지수 비트가 모두 1(NaN·Inf)인 성분이 하나라도 있으면 0(검정). 카메라와 거의 같은 위치의 조각(아바타 머리·슬래브 안 등)이 내는 NaN을
 * 블룸(넓은 흐림)·TAAU(이력)가 화면 전체로 번져 검게 만들던 문제(M06 사전 3 근본 원인, ADR-0059). x != x는 컴파일러가 접을 수 있어 비트로 검사. */
function sanitize(c: V4): V4 {
  const bad = (x: TslNode<'float'>) =>
    (floatBitsToUint(x) as unknown as TslNode<'uint'>).bitAnd(uint(0x7f800000)).equal(uint(0x7f800000));
  return select(bad(c.x).or(bad(c.y)).or(bad(c.z)).or(bad(c.w)), vec4(0, 0, 0, 1), c) as unknown as V4;
}

export function createPostPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  fx: PostEffects,
  debugGpuLoad = 0,
): PostPipeline {
  const scenePass = scenePassOf(scene, camera, fx);
  const depth = scenePass.getTextureNode('depth');
  const pipeline = new RenderPipeline(renderer);
  const sc: Scalables = { rtts: [] };
  const { color, nodes } = lightingComposite(scenePass, camera, fx, sc, debugGpuLoad);
  const ap = aerialOf(renderer, color, depth, camera, fx, sc, nodes);
  const exposure: AutoExposure | undefined = fx.autoExposure
    ? createAutoExposure(scenePass.getTexture('output'))
    : undefined;
  // 자동 노출이 없으면(WebGL2 — 컴퓨트 없음) 골든뷰 평균 배율(맑은 낮 0.8–1.9의 가운데)로 고정.
  let hdr: V4 = sanitize(ap.mul(exposure ? exposure.scale : float(fx.fixedExposure ?? 1)));
  if (fx.bloom) {
    const b = bloom(hdr, 0.08, 0.35, 1.2);
    // 넓은 흐림이라 ¼ 해상도로 충분(기본 ½ 대비 ≈ −1.5 ms).
    b.setResolutionScale(0.25);
    nodes.push(b);
    hdr = hdr.add(b);
  }
  if (fx.taa) {
    // 동적 해상도(M03-T08)로 스케일이 1 ↔ < 1을 오가므로 항상 TAAU(스케일 1에서도 TRAA 대신 동작, 비용 비슷).
    const vel = scenePass.getTextureNode('velocity');
    const t = taau(lowRes(hdr, fx, sc) as unknown as Parameters<typeof taau>[0], depth, vel, camera);
    nodes.push(t);
    hdr = t as unknown as V4;
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
    setRenderScale(scale) {
      if (!fx.taa) return;
      scenePass.setResolutionScale(scale);
      for (const r of sc.rtts) r.setResolutionScale(scale);
      if (sc.ao) sc.ao.resolutionScale = fx.aoScale * scale;
      sc.aoFilter?.setResolutionScale(fx.aoScale * scale);
      if (sc.aerial) sc.aerial.renderScale = scale;
      if (sc.ssr) sc.ssr.resolutionScale = 0.5 * scale;
    },
    dispose() {
      pipeline.dispose();
      scenePass.dispose();
      for (const n of nodes) n.dispose();
      exposure?.dispose();
      lut?.dispose();
    },
  };
}
