// 렌더 내부 컨텍스트: 초기화된 렌더러 + 씬 그래프 + 머티리얼 + 시점 + 셀 집합. createRender(service.ts)·프레임 시스템(frame.ts)이 공유한다.
// see docs/modules/render.md
import { type Logger, mergeConfig, type QualityTier } from '@sanpo/core';
import type { WebGPURenderer } from 'three/webgpu';
import type { DepthMode, PostEffects, RenderBackend, RenderConfig, RenderDeps } from '../api.ts';
import { DEFAULT_RENDER_CONFIG } from './config.ts';
import { type AtmosphereRig, createAtmosphere } from './lighting/atmosphere.ts';
import { attachEnvProbe, type EnvProbe } from './lighting/env-probe.ts';
import { enableSunShadows, type SunShadows } from './lighting/shadows.ts';
import { DEFAULT_MOON_DIR_WF, DEFAULT_SUN_DIR_WF } from './lighting/sun.ts';
import { glassRoughness } from './materials/glass.ts';
import { createMaterialLibrary, type MaterialLibrary } from './materials/library.ts';
import { createMaterialRegistry, type MaterialRegistry } from './materials/registry.ts';
import { resolvePost } from './post/config.ts';
import { createDirectRender, createPostPipeline, type PostPipeline } from './post/pipeline.ts';
import { createQualityManager, type QualityManager } from './quality.ts';
import { createGpuTimer, type GpuTimer } from './renderer/gpu-timer.ts';
import { initRenderer } from './renderer/init.ts';
import { type CellSet, createCellSet } from './scene/cell-node.ts';
import { createHlodSwitch, type HlodSwitch } from './scene/hlod-switch.ts';
import { createRenderView, type RenderView } from './scene/render-view.ts';
import { createSceneGraph, type SceneGraph } from './scene/scene-graph.ts';
import { createEnvUniforms, type EnvUniforms } from './weather/wetness.ts';

export interface RenderContext {
  readonly cfg: Readonly<RenderConfig>;
  readonly log: Logger;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGPURenderer;
  readonly backend: RenderBackend;
  readonly depth: DepthMode;
  readonly graph: SceneGraph;
  readonly library: MaterialLibrary;
  readonly materials: MaterialRegistry;
  readonly view: RenderView;
  readonly hlod: HlodSwitch;
  readonly cells: CellSet;
  readonly atmosphere: AtmosphereRig;
  readonly env: EnvProbe;
  /** 전역 환경 유니폼(젖음 등, 07 §3). */
  readonly envUniforms: EnvUniforms;
  /** 하드웨어 백엔드만(소프트웨어 WebGL2는 끔, M03-T09). */
  readonly shadows: SunShadows | undefined;
  /** 티어 변경 때 교체된다(quality.ts). */
  post: PostPipeline;
  readonly quality: QualityManager;
  readonly gpuTimer: GpuTimer;
  /** 프레임 카운터·마지막 HLOD 페이드 수(stats). */
  readonly counters: { frames: number; fading: number };
}

/** WebGL2 고정 노출(WebGPU 자동 노출 골든뷰 배율 0.8–1.9의 기하 중간 ≈ 1.25). */
const WEBGL2_EXPOSURE = 1.25;
const WEBGL2_GLASS_ROUGHNESS = 0.16;

/** 티어 → 효과. WebGL2엔 컴퓨트가 없다 → 자동 노출 끔 + 고정 배율(07 §9 폴백 "미지원 기능 자동 비활성"). 유리 거칠기 하한은 context가 올린다("유리 반사 과다 보정"). */
function postEffectsFor(cfg: RenderConfig, backend: RenderBackend): (tier: QualityTier) => PostEffects {
  return (tier) => {
    const fx = resolvePost(tier, cfg.post);
    return backend === 'webgl2' ? { ...fx, autoExposure: false, fixedExposure: WEBGL2_EXPOSURE } : fx;
  };
}

export async function createRenderContext(deps: RenderDeps): Promise<RenderContext> {
  const cfg = mergeConfig(DEFAULT_RENDER_CONFIG, deps.config ?? {});
  const log = deps.log.child('render');
  const { renderer, backend, depth, software } = await initRenderer(deps.canvas, cfg, log);
  const graph = createSceneGraph();
  const library = createMaterialLibrary(cfg.basisPath);
  const envUniforms = createEnvUniforms();
  const materials = createMaterialRegistry(library, envUniforms, cfg.facade);
  const hlod = createHlodSwitch();
  const view = createRenderView(cfg, deps.bus, log);
  renderer.toneMappingExposure = cfg.exposure;
  // 하드웨어(WebGPU·WebGL2) = 후처리(공중원근이 하늘까지) + 환경 프로브 + 그림자, 소프트웨어 WebGL2(SwiftShader — CI) = 직접 렌더 + 하늘 배경(ADR-0028, M03-T09).
  // `debugForcePost` = CI 정지 떨림 e2e(SwiftShader에서 후처리 체인 검증).
  const post = !software || cfg.debugForcePost;
  const atmosphere = createAtmosphere(renderer, graph.scene, view.camera, !post);
  graph.roots.light.add(atmosphere.light, atmosphere.light.target);
  atmosphere.setOrigin(view.renderOriginWF);
  atmosphere.setBodies(DEFAULT_SUN_DIR_WF, DEFAULT_MOON_DIR_WF);
  if (backend === 'webgl2') glassRoughness.value = WEBGL2_GLASS_ROUGHNESS;
  const postFor = postEffectsFor(cfg, backend);
  const makePost = (tier: QualityTier): PostPipeline =>
    post
      ? createPostPipeline(renderer, graph.scene, view.camera, postFor(tier), cfg.debugGpuLoad)
      : createDirectRender(renderer, graph.scene, view.camera);
  const ctx: Omit<RenderContext, 'quality'> & { quality?: QualityManager } = {
    cfg,
    log,
    canvas: deps.canvas,
    renderer,
    backend,
    depth,
    graph,
    library,
    materials,
    view,
    hlod,
    cells: createCellSet(materials, graph.roots, hlod),
    atmosphere,
    envUniforms,
    env: post ? attachEnvProbe(graph.scene, atmosphere.light) : { dispose() {} },
    shadows: post && cfg.shadows ? enableSunShadows(renderer, atmosphere.light) : undefined,
    post: makePost(cfg.quality),
    gpuTimer: createGpuTimer(renderer, cfg.gpuTiming),
    counters: { frames: 0, fading: 0 },
  };
  ctx.quality = createQualityManager({
    bus: deps.bus,
    log,
    backend,
    initial: cfg.quality,
    dynamic: post && cfg.dynamicResolution,
    benchmarksPath: cfg.gpuBenchmarksPath,
    applyTier(tier) {
      ctx.post.dispose();
      ctx.post = makePost(tier);
      return postFor(tier).renderScale;
    },
    applyScale: (s) => ctx.post.setRenderScale(s),
  });
  return ctx as RenderContext;
}
