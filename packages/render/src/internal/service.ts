// createRender: 컨텍스트(초기화·씬·머티리얼·시점·셀) → 프레임 시스템(renderPrep 70 / render 80) → RenderService 외관. see docs/modules/render.md, docs/07-rendering.md §1–3
import type { CellKey } from '@sanpo/core';
import { Group, type Object3D } from 'three/webgpu';
import type { PrecompileProgress, RenderDeps, RenderService, RenderStats } from '../api.ts';
import { createRenderContext, type RenderContext } from './context.ts';
import { loadCrowdAssets } from './crowd/assets.ts';
import { createCrowdMaterial } from './crowd/material.ts';
import { createFrameSystems } from './frame.ts';
import { precompileMaterials, yieldFrame } from './materials/precompile.ts';
import { loadAvatarModel } from './scene/avatar-model.ts';
import { loadSignageInto } from './signs/load.ts';
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
    signs: ctx.signs.stats(),
    crowd: ctx.crowd.stats(),
  };
}

/** 선컴파일·지연 적재(아바타·나무) — 첫 표시 전후 비동기 작업. */
/** 부팅 대기 셀(M06 사전 4): 장면 밖 그룹에 셀 슬롯 그룹을 모았다가 compileAsync(그룹, 카메라, 장면) → 원래 부모로. */
function createStaging(ctx: RenderContext) {
  let holder: Group | null = null;
  const parents = new Map<Group, Object3D>();
  return {
    take(key: CellKey) {
      if (!holder) return;
      for (const g of ctx.cells.groupsOf(key)) {
        if (!g.parent || g.parent === holder) continue;
        parents.set(g, g.parent);
        holder.add(g);
      }
    },
    api: {
      stageCells(on: boolean) {
        holder = on ? (holder ?? new Group()) : holder;
      },
      async compileStaged() {
        if (!holder || holder.children.length === 0) return;
        const t0 = performance.now();
        await ctx.renderer.compileAsync(holder, ctx.view.camera, ctx.graph.scene);
        ctx.log.info(
          `staged cells compiled (${holder.children.length} groups) ${Math.round(performance.now() - t0)} ms`,
        );
      },
      commitStaged() {
        for (const [g, parent] of parents) if (g.parent === holder) parent.add(g);
        parents.clear();
        holder = null;
        ctx.counters.sceneVersion++;
      },
    } satisfies Pick<RenderService, 'stageCells' | 'compileStaged' | 'commitStaged'>,
  };
}

/** 선컴파일(06 §6): 대기 LUT → 머티리얼 묶음(소품 풀 priming 포함) → 아바타, 단계마다 진행 보고·프레임 양보(ADR-0060 보충). */
async function precompileAll(ctx: RenderContext, onProgress?: (p: PrecompileProgress) => void): Promise<void> {
  const { renderer, view, graph, log } = ctx;
  const t0 = performance.now();
  onProgress?.({ stage: 'atmosphere', done: 0, total: 1 });
  await ctx.atmosphere.prepare(yieldFrame);
  onProgress?.({ stage: 'atmosphere', done: 1, total: 1 });
  await yieldFrame();
  const t1 = performance.now();
  // 소품 풀(한 머티리얼 × 인스턴싱): 종류별 LOD0 풀에 1개씩 잠깐 채워 같은 compileAsync로.
  const restore = ctx.props.primeForCompile();
  try {
    await precompileMaterials(renderer, graph.scene, view.camera, ctx.materials, log, (done, total) =>
      onProgress?.({ stage: 'materials', done, total }),
    );
  } finally {
    restore();
  }
  const t2 = performance.now();
  // 아바타(3인칭 첫 표시 끊김 방지): 잠깐 보이게 해 파이프라인만 만든다.
  ctx.avatar.group.visible = true;
  await renderer
    .compileAsync(ctx.avatar.group, view.camera, graph.scene)
    .catch((e: unknown) => log.warn('avatar precompile', e));
  ctx.avatar.group.visible = false;
  onProgress?.({ stage: 'avatar', done: 1, total: 1 });
  const ms = (a: number, b: number) => Math.round(b - a);
  log.info(
    `precompile atmosphere ${ms(t0, t1)} ms, materials ${ms(t1, t2)} ms, avatar ${ms(t2, performance.now())} ms`,
  );
}

function loaders(
  ctx: RenderContext,
): Pick<RenderService, 'precompile' | 'loadAvatar' | 'loadTrees' | 'loadSignage' | 'loadCrowd'> {
  const { renderer, view, graph, log } = ctx;
  return {
    precompile: (onProgress) => precompileAll(ctx, onProgress),
    async loadAvatar(urls) {
      const model = await loadAvatarModel(urls, ctx.avatar.opacity, ctx.library.ktx2(renderer));
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
    async loadSignage(urls) {
      await loadSignageInto(ctx, urls);
      log.info('signage attached');
    },
    async loadCrowd(urls) {
      const t0 = performance.now();
      const assets = await loadCrowdAssets(urls, ctx.library.ktx2(renderer));
      const material = createCrowdMaterial(assets);
      ctx.crowdMaterials.push(material);
      ctx.crowd.attach(assets, material);
      const restore = ctx.crowd.primeForCompile();
      try {
        await renderer.compileAsync(ctx.crowd.root, view.camera, graph.scene);
      } finally {
        restore();
      }
      log.info(
        `crowd attached (${assets.bases.length} bases, lod idx ${assets.bases[0]?.lods.map((l) => l.index.count).join('/')}) ${Math.round(performance.now() - t0)} ms`,
      );
    },
  };
}

export async function createRender(deps: RenderDeps): Promise<RenderService> {
  const ctx = await createRenderContext(deps);
  const { prep, draw } = createFrameSystems(ctx);
  const { renderer, view, cells, hlod, library, log } = ctx;
  const staged = createStaging(ctx);
  return {
    renderOriginWF: view.renderOriginWF,
    setQuality: (tier) => ctx.quality.setTier(tier),
    detectQuality: () => ctx.quality.detect(),
    backend: ctx.backend,
    depth: ctx.depth,
    ...staged.api,
    pedestrians: { bindShared: (buf) => ctx.crowd.bind(buf) },
    setSignalLamps: (lamp) => {
      ctx.signalLamp = lamp;
    },
    addCell: (p) => {
      cells.add(p, view.renderOriginWF);
      staged.take(p.key);
      ctx.props.addCell(p.key, p.originWF, p.instances?.props);
      ctx.trees.addCell(p.key, p.originWF, p.instances?.trees);
      ctx.signs.addCell(p.key, p.originWF, p.instances?.props);
      ctx.counters.sceneVersion++;
    },
    removeCell: (key) => {
      cells.remove(key);
      ctx.props.removeCell(key);
      ctx.trees.removeCell(key);
      ctx.signs.removeCell(key);
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
