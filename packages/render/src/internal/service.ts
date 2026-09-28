// createRender: 초기화 → 씬 그래프 → renderPrep(70: 캔버스 크기·원점 재설정·카메라) / render(80). see docs/modules/render.md, docs/07-rendering.md §1–3
import { type GameSystem, mergeConfig } from '@sanpo/core';
import { type PerspectiveCamera, Vector2, type WebGPURenderer } from 'three/webgpu';
import type { RenderDeps, RenderService, RenderStats } from '../api.ts';
import { DEFAULT_RENDER_CONFIG } from './config.ts';
import { precompileMaterials } from './materials/precompile.ts';
import { createMaterialRegistry } from './materials/registry.ts';
import { initRenderer } from './renderer/init.ts';
import { createCellSet } from './scene/cell-node.ts';
import { createHlodSwitch } from './scene/hlod-switch.ts';
import { createRenderView } from './scene/render-view.ts';
import { createSceneGraph } from './scene/scene-graph.ts';

/** 01-architecture §5 phase 표. */
export const RENDER_PREP_PHASE = 70;
export const RENDER_PHASE = 80;

const scratchSize = new Vector2();

function infoOf(renderer: WebGPURenderer): Pick<RenderStats, 'drawCalls' | 'triangles'> {
  return { drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles };
}

/** CSS 크기·DPR이 바뀐 경우에만 드로잉 버퍼 크기 갱신. */
function syncSize(renderer: WebGPURenderer, camera: PerspectiveCamera, canvas: HTMLCanvasElement, maxDpr: number) {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  const dpr = Math.min(globalThis.devicePixelRatio ?? 1, maxDpr);
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  const size = renderer.getSize(scratchSize);
  if (size.x !== w || size.y !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

export async function createRender(deps: RenderDeps): Promise<RenderService> {
  const cfg = mergeConfig(DEFAULT_RENDER_CONFIG, deps.config ?? {});
  const log = deps.log.child('render');
  const { renderer, backend, depth } = await initRenderer(deps.canvas, cfg, log);
  const graph = createSceneGraph();
  const materials = createMaterialRegistry();
  const view = createRenderView(cfg, deps.bus, log);
  const hlod = createHlodSwitch();
  const cells = createCellSet(materials, graph.roots, hlod);
  let frames = 0;
  let fading = 0;

  const prep: GameSystem = {
    id: 'renderPrep',
    phase: RENDER_PREP_PHASE,
    update(f) {
      syncSize(renderer, view.camera, deps.canvas, cfg.maxPixelRatio);
      view.prepare((origin) => cells.placeAll(origin));
      fading = hlod.update(f.dtReal);
    },
    dispose() {},
  };
  const draw: GameSystem = {
    id: 'render',
    phase: RENDER_PHASE,
    update() {
      renderer.render(graph.scene, view.camera);
      frames++;
    },
    dispose() {
      cells.dispose();
      materials.dispose();
      renderer.dispose();
    },
  };

  const stats = (): RenderStats => ({
    backend,
    depth,
    frames,
    ...infoOf(renderer),
    cells: cells.size,
    originRebases: view.rebases,
    renderOriginWF: { ...view.renderOriginWF },
    hlodParents: hlod.size,
    hlodFading: fading,
  });

  return {
    renderOriginWF: view.renderOriginWF,
    backend,
    depth,
    addCell: (p) => cells.add(p, view.renderOriginWF),
    removeCell: (key) => cells.remove(key),
    setHlodChildVisible: (parent, child, visible) => hlod.setChildVisible(parent, child, visible),
    precompile: () => precompileMaterials(renderer, graph.scene, view.camera, materials, log),
    setCamera: (c) => view.setCamera(c),
    stats,
    dispose: () => draw.dispose(),
    systems: () => [prep, draw],
  };
}
