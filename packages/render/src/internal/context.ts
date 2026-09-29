// 렌더 내부 컨텍스트: 초기화된 렌더러 + 씬 그래프 + 머티리얼 + 시점 + 셀 집합. createRender(service.ts)·프레임 시스템(frame.ts)이 공유한다.
// see docs/modules/render.md
import { type Logger, mergeConfig } from '@sanpo/core';
import type { WebGPURenderer } from 'three/webgpu';
import type { DepthMode, RenderBackend, RenderConfig, RenderDeps } from '../api.ts';
import { DEFAULT_RENDER_CONFIG } from './config.ts';
import { createMaterialLibrary, type MaterialLibrary } from './materials/library.ts';
import { createMaterialRegistry, type MaterialRegistry } from './materials/registry.ts';
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
    view: createRenderView(cfg, deps.bus, log),
    hlod,
    cells: createCellSet(materials, graph.roots, hlod),
    counters: { frames: 0, fading: 0 },
  };
}
