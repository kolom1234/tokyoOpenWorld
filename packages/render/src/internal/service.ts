// createRender: 컨텍스트(초기화·씬·머티리얼·시점·셀) → 프레임 시스템(renderPrep 70 / render 80) → RenderService 외관. see docs/modules/render.md, docs/07-rendering.md §1–3
import type { RenderDeps, RenderService, RenderStats } from '../api.ts';
import { createRenderContext, type RenderContext } from './context.ts';
import { createFrameSystems } from './frame.ts';
import { precompileMaterials } from './materials/precompile.ts';

export { RENDER_PHASE, RENDER_PREP_PHASE } from './frame.ts';

function statsOf(ctx: RenderContext): RenderStats {
  const { renderer, view } = ctx;
  return {
    backend: ctx.backend,
    depth: ctx.depth,
    frames: ctx.counters.frames,
    drawCalls: renderer.info.render.drawCalls,
    triangles: renderer.info.render.triangles,
    cells: ctx.cells.size,
    originRebases: view.rebases,
    renderOriginWF: { ...view.renderOriginWF },
    hlodParents: ctx.hlod.size,
    hlodFading: ctx.counters.fading,
    materials: ctx.library.stats(),
    gpu: ctx.gpuTimer.stats(),
    post: ctx.post.effects,
    exposure: ctx.post.exposure(),
    quality: ctx.quality.stats(),
    shadows: ctx.shadows ? { ...ctx.shadows.settings, updated: ctx.counters.shadowUpdates } : null,
  };
}

export async function createRender(deps: RenderDeps): Promise<RenderService> {
  const ctx = await createRenderContext(deps);
  const { prep, draw } = createFrameSystems(ctx);
  const { renderer, view, cells, hlod, library, graph, log } = ctx;
  return {
    renderOriginWF: view.renderOriginWF,
    setQuality: (tier) => ctx.quality.setTier(tier),
    detectQuality: () => ctx.quality.detect(),
    backend: ctx.backend,
    depth: ctx.depth,
    addCell: (p) => {
      cells.add(p, view.renderOriginWF);
      ctx.counters.sceneVersion++;
    },
    removeCell: (key) => {
      cells.remove(key);
      ctx.counters.sceneVersion++;
    },
    setHlodChildVisible: (parent, child, visible) => {
      hlod.setChildVisible(parent, child, visible);
      ctx.counters.sceneVersion++;
    },
    loadMaterials: (url) => library.load(url, renderer, log),
    async precompile() {
      await ctx.atmosphere.prepare();
      await precompileMaterials(renderer, graph.scene, view.camera, ctx.materials, log);
      // 아바타(3인칭 첫 표시 끊김 방지): 잠깐 보이게 해 파이프라인만 만든다.
      ctx.avatar.group.visible = true;
      await renderer
        .compileAsync(ctx.avatar.group, view.camera, graph.scene)
        .catch((e: unknown) => log.warn('avatar precompile', e));
      ctx.avatar.group.visible = false;
    },
    setCamera: (c) => view.setCamera(c),
    setAvatar: (a) => ctx.avatar.set(a),
    setEnvironment: (e) => {
      ctx.atmosphere.setBodies(e.sunDirWF, e.moonDirWF);
      ctx.envUniforms.wetness.value = Math.min(Math.max(e.weather.wetness, 0), 1);
    },
    stats: () => statsOf(ctx),
    dispose: () => draw.dispose(),
    systems: () => [prep, draw],
  };
}
