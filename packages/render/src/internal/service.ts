// createRender: 컨텍스트(초기화·씬·머티리얼·시점·셀) → 프레임 시스템(renderPrep 70 / render 80) → RenderService 외관. see docs/modules/render.md, docs/07-rendering.md §1–3
import type { RenderDeps, RenderService, RenderStats } from '../api.ts';
import { createRenderContext, type RenderContext } from './context.ts';
import { createFrameSystems } from './frame.ts';
import { precompileMaterials } from './materials/precompile.ts';
import { loadAvatarModel } from './scene/avatar-model.ts';
import { loadTreesInto, setTreeWind } from './trees/load.ts';

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
    props: ctx.props.stats(),
    trees: ctx.trees.stats(),
  };
}

/** 선컴파일·지연 적재(아바타·나무) — 첫 표시 전후 비동기 작업. */
function loaders(ctx: RenderContext): Pick<RenderService, 'precompile' | 'loadAvatar' | 'loadTrees'> {
  const { renderer, view, graph, log } = ctx;
  return {
    async precompile() {
      await ctx.atmosphere.prepare();
      // 소품 풀(한 머티리얼 × 인스턴싱): 종류별 LOD0 풀에 1개씩 잠깐 채워 같은 compileAsync로.
      const restore = ctx.props.primeForCompile();
      try {
        await precompileMaterials(renderer, graph.scene, view.camera, ctx.materials, log);
      } finally {
        restore();
      }
      // 아바타(3인칭 첫 표시 끊김 방지): 잠깐 보이게 해 파이프라인만 만든다.
      ctx.avatar.group.visible = true;
      await renderer
        .compileAsync(ctx.avatar.group, view.camera, graph.scene)
        .catch((e: unknown) => log.warn('avatar precompile', e));
      ctx.avatar.group.visible = false;
    },
    async loadAvatar(url) {
      const model = await loadAvatarModel(url, ctx.avatar.opacity);
      // 붙이기 전에 파이프라인을 만든다(3인칭 전환 첫 프레임 끊김 방지) — 보이지 않는 그룹으로 컴파일.
      await renderer
        .compileAsync(model.root, view.camera, graph.scene)
        .catch((e: unknown) => log.warn('avatar compile', e));
      ctx.avatar.attach(model);
      log.info('avatar model attached');
    },
    async loadTrees(urls) {
      await loadTreesInto(ctx, urls);
      log.info('trees attached');
    },
  };
}

export async function createRender(deps: RenderDeps): Promise<RenderService> {
  const ctx = await createRenderContext(deps);
  const { prep, draw } = createFrameSystems(ctx);
  const { renderer, view, cells, hlod, library, log } = ctx;
  return {
    renderOriginWF: view.renderOriginWF,
    setQuality: (tier) => ctx.quality.setTier(tier),
    detectQuality: () => ctx.quality.detect(),
    backend: ctx.backend,
    depth: ctx.depth,
    addCell: (p) => {
      cells.add(p, view.renderOriginWF);
      ctx.props.addCell(p.key, p.originWF, p.instances?.props);
      ctx.trees.addCell(p.key, p.originWF, p.instances?.trees);
      ctx.counters.sceneVersion++;
    },
    removeCell: (key) => {
      cells.remove(key);
      ctx.props.removeCell(key);
      ctx.trees.removeCell(key);
      ctx.counters.sceneVersion++;
    },
    setHlodChildVisible: (parent, child, visible) => {
      hlod.setChildVisible(parent, child, visible);
      ctx.counters.sceneVersion++;
    },
    loadMaterials: (url) => library.load(url, renderer, log),
    ...loaders(ctx),
    setCamera: (c) => view.setCamera(c),
    setAvatar: (a) => ctx.avatar.set(a),
    setEnvironment: (e) => {
      ctx.atmosphere.setBodies(e.sunDirWF, e.moonDirWF);
      ctx.envUniforms.wetness.value = Math.min(Math.max(e.weather.wetness, 0), 1);
      ctx.treeUniforms?.setSeason(e.season.dayOfYear);
      setTreeWind(ctx, e.weather.windMs, e.weather.windDirDeg);
    },
    stats: () => statsOf(ctx),
    dispose: () => draw.dispose(),
    systems: () => [prep, draw],
  };
}
