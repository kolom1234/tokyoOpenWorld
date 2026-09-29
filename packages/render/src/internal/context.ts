// 렌더 내부 컨텍스트: 초기화된 렌더러 + 씬 그래프 + 머티리얼 + 시점 + 셀 집합. createRender(service.ts)·프레임 시스템(frame.ts)이 공유한다.
// see docs/modules/render.md
import { type Logger, mergeConfig } from '@sanpo/core';
import type { WebGPURenderer } from 'three/webgpu';
import type { DepthMode, RenderBackend, RenderConfig, RenderDeps } from '../api.ts';
import { DEFAULT_RENDER_CONFIG } from './config.ts';
import { type AtmosphereRig, createAtmosphere } from './lighting/atmosphere.ts';
import { attachEnvProbe, type EnvProbe } from './lighting/env-probe.ts';
import { DEFAULT_MOON_DIR_WF, DEFAULT_SUN_DIR_WF } from './lighting/sun.ts';
import { createMaterialLibrary, type MaterialLibrary } from './materials/library.ts';
import { createMaterialRegistry, type MaterialRegistry } from './materials/registry.ts';
import { createDirectRender, createPostPipeline, type PostPipeline } from './post/pipeline.ts';
import { createGpuTimer, type GpuTimer } from './renderer/gpu-timer.ts';
import { initRenderer } from './renderer/init.ts';
import { type CellSet, createCellSet } from './scene/cell-node.ts';
import { createHlodSwitch, type HlodSwitch } from './scene/hlod-switch.ts';
import { createRenderView, type RenderView } from './scene/render-view.ts';
import { createSceneGraph, type SceneGraph } from './scene/scene-graph.ts';

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
  readonly post: PostPipeline;
  readonly gpuTimer: GpuTimer;
  /** 프레임 카운터·마지막 HLOD 페이드 수(stats). */
  readonly counters: { frames: number; fading: number };
}

export async function createRenderContext(deps: RenderDeps): Promise<RenderContext> {
  const cfg = mergeConfig(DEFAULT_RENDER_CONFIG, deps.config ?? {});
  const log = deps.log.child('render');
  const { renderer, backend, depth } = await initRenderer(deps.canvas, cfg, log);
  const graph = createSceneGraph();
  const library = createMaterialLibrary(cfg.basisPath);
  const materials = createMaterialRegistry(library);
  const hlod = createHlodSwitch();
  const view = createRenderView(cfg, deps.bus, log);
  renderer.toneMappingExposure = cfg.exposure;
  const atmosphere = createAtmosphere(renderer, graph.scene, view.camera);
  graph.roots.light.add(atmosphere.light, atmosphere.light.target);
  atmosphere.setOrigin(view.renderOriginWF);
  atmosphere.setBodies(DEFAULT_SUN_DIR_WF, DEFAULT_MOON_DIR_WF);
  return {
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
    env: attachEnvProbe(graph.scene, atmosphere.light),
    post: (backend === 'webgpu' ? createPostPipeline : createDirectRender)(renderer, graph.scene, view.camera),
    gpuTimer: createGpuTimer(renderer, cfg.gpuTiming),
    counters: { frames: 0, fading: 0 },
  };
}
