// createRender: 컨텍스트(초기화·씬·머티리얼·시점·셀) → 프레임 시스템(renderPrep 70 / render 80) → RenderService 외관. see docs/modules/render.md, docs/07-rendering.md §1–3
import type { CellKey, EnvironmentState, SharedInstanceBuffer } from '@sanpo/core';
import { Group, type Object3D } from 'three/webgpu';
import type { PrecompileProgress, RenderDebugLayer, RenderDeps, RenderService, RenderStats } from '../api.ts';
import { createRenderContext, type RenderContext } from './context.ts';
import { loadCrowdAssets } from './crowd/assets.ts';
import { createCrowdMaterial, outfitU } from './crowd/material.ts';
import { createFrameSystems } from './frame.ts';
import { nightU, updateNight } from './lighting/night.ts';
import { compileDetached, precompileBase, precompileMaterials, yieldFrame } from './materials/precompile.ts';
import { setColorVision } from './post/color-vision.ts';
import { dofBokehU, dofFocusU, dofRangeU, exposureBiasU } from './post/photo.ts';
import { loadAvatarModel } from './scene/avatar-model.ts';
import { loadSignageInto } from './signs/load.ts';
import { createTrainMaterial } from './trains/material.ts';
import { loadTreesInto, setTreeWind } from './trees/load.ts';
import { createVehicleLayer } from './vehicle-layer.ts';
import { nightFromSun } from './vehicles/material.ts';

export { RENDER_PHASE, RENDER_PREP_PHASE } from './frame.ts';

/** 날씨(M09-T01): 빗줄기·파문·우산·구름 입력 보관(직사광 감쇠 = 프레임 시스템 — 태양 방향 구름 덮임, M09-T02). */
function applyWeather(ctx: RenderContext, e: Readonly<EnvironmentState>): void {
  const w = e.weather;
  const night = nightFromSun(e.sunDirWF.y);
  Object.assign(ctx.weather, {
    rainMmH: w.rainMmH,
    snow: w.snow,
    windX: e.wind.x,
    windZ: e.wind.z,
    night,
    cover: w.cloudCover,
    fog: w.fog,
    sun: e.sunDirWF,
    gameMs: e.gameTimeMs,
  });
  ctx.envUniforms.rain.value = Math.min(w.rainMmH / 8, 1);
  ctx.crowd.setRain(w.rainMmH);
}

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
    crowd: { ...ctx.crowd.stats(), far: ctx.farCrowd.stats() },
    vehicles: ctx.vehicles.stats(),
    trains: ctx.trains.stats(),
    weather: { rain: ctx.rain.stats(), wetness: ctx.envUniforms.wetness.value, direct: ctx.atmosphere.light.color.r },
    night: { level: nightU.value, ...ctx.nightLights.stats() },
  };
}

/** 포토 모드(M10-T05): 노출 보정·DOF(출력 노드 교체 — 재구성 없음)·고해상도 캡처. */
function photoApi(ctx: RenderContext): Pick<RenderService, 'setPhoto' | 'screenshot' | 'setColorVision'> {
  return {
    setColorVision,
    setPhoto(p) {
      exposureBiasU.value = 2 ** (p?.exposureEv ?? 0);
      if (p?.dof) {
        dofFocusU.value = p.dof.focusM;
        dofRangeU.value = p.dof.rangeM;
        dofBokehU.value = p.dof.bokeh;
      }
      const want = !!p?.dof && !ctx.software;
      if (want === ctx.photo.dof) return;
      ctx.photo.dof = want;
      ctx.post.setDof(want);
    },
    screenshot(o) {
      if (ctx.capture) return Promise.reject(new Error('screenshot: already capturing'));
      return new Promise((resolve, reject) => {
        ctx.capture = { scale: o.scale, framesLeft: Math.max(1, o.settleFrames ?? 8), resolve, reject };
      });
    },
  };
}

/** 역 시설(M07-T06). */
function stationApi(ctx: RenderContext): Pick<RenderService, 'setStationFixtures' | 'setGateFlaps'> {
  return {
    setStationFixtures(f) {
      ctx.stations.set(f);
      ctx.counters.sceneVersion++;
    },
    setGateFlaps: (open) => ctx.stations.setFlaps(open),
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

/** 디버그 레이어 숨김/보임(ADR-0068) — 그림자 캐시도 새로 그리게 장면 버전을 올린다. */
function debugLayerVisible(ctx: RenderContext, layer: RenderDebugLayer, visible: boolean): void {
  const roots = {
    props: ctx.props.root,
    signs: ctx.signs.root,
    trees: ctx.trees.root,
    crowd: ctx.crowd.root,
    farCrowd: ctx.farCrowd.root,
    vehicles: ctx.vehicles.root,
    trains: ctx.trains.root,
  };
  // 야간 광원은 풀 PointLight를 장면에서 빼면 조명 목록이 바뀌어 재컴파일된다 → 켠 수만 0으로(클러스터 컴퓨트는 그대로).
  if (layer === 'nightLights') ctx.nightLights.setEnabled(visible);
  else roots[layer].visible = visible;
  ctx.counters.sceneVersion++;
}

/** 첫 표시 전 선컴파일(06 §6): 대기 LUT(+ 장면 컴파일) → 아바타, 단계마다 진행 보고·프레임 양보(ADR-0060 보충). 머티리얼 묶음 = precompileLate(ADR-0085). */
async function precompileAll(ctx: RenderContext, onProgress?: (p: PrecompileProgress) => void): Promise<void> {
  const { renderer, view, graph, log } = ctx;
  const t0 = performance.now();
  onProgress?.({ stage: 'atmosphere', done: 0, total: 1 });
  // 셀 머티리얼 기본 변형을 대기 LUT·장면 컴파일과 동시에(GPU 프로세스가 병렬로 만든다 — ADR-0086). 소프트웨어 래스터는 셀 컴파일이 짧아 생략.
  const base = ctx.software
    ? Promise.resolve()
    : precompileBase(renderer, graph.scene, view.camera, ctx.materials).catch((e: unknown) =>
        log.warn('base precompile', e),
      );
  await ctx.atmosphere.prepare(yieldFrame, () => ctx.compileScope.frame(() => ctx.post.warmup()));
  await base;
  onProgress?.({ stage: 'atmosphere', done: 1, total: 1 });
  await yieldFrame();
  const t2 = performance.now();
  // 아바타(3인칭 첫 표시 끊김 방지): 잠깐 보이게 해 파이프라인만 만든다.
  ctx.avatar.group.visible = true;
  await renderer
    .compileAsync(ctx.avatar.group, view.camera, graph.scene)
    .catch((e: unknown) => log.warn('avatar precompile', e));
  ctx.avatar.group.visible = false;
  onProgress?.({ stage: 'avatar', done: 1, total: 1 });
  const ms = (a: number, b: number) => Math.round(b - a);
  log.info(`precompile atmosphere ${ms(t0, t2)} ms, avatar ${ms(t2, performance.now())} ms`);
}

/** 첫 표시 뒤(ADR-0085): 머티리얼 묶음(소품 풀 priming 포함). 소프트웨어 래스터는 생략. */
async function precompileLate(ctx: RenderContext, onProgress?: (p: PrecompileProgress) => void): Promise<void> {
  if (ctx.software) return;
  const t0 = performance.now();
  // 소품 풀(한 머티리얼 × 인스턴싱): 종류별 LOD0 풀에 1개씩 잠깐 채워 같은 compileAsync로.
  const restore = ctx.props.primeForCompile();
  try {
    await precompileMaterials(ctx.renderer, ctx.graph.scene, ctx.view.camera, ctx.materials, ctx.log, (done, total) =>
      onProgress?.({ stage: 'materials', done, total }),
    );
  } finally {
    restore();
  }
  ctx.log.info(`precompile (late) materials ${Math.round(performance.now() - t0)} ms`);
}

/** 열차 레이어(M07-T03): 처음 bind 때 머티리얼·풀 24 → 선컴파일(보이지 않는 인스턴스, 장면 밖) → 그리기 시작. */
async function bindTrains(ctx: RenderContext, buf: SharedInstanceBuffer): Promise<void> {
  if (!ctx.trains.stats().ready) {
    const t0 = performance.now();
    const material = createTrainMaterial(ctx.vehicleUniforms);
    ctx.vehicleMaterials.push(material);
    ctx.trains.attach(material);
    await compileDetached(ctx.renderer, ctx.trains.root, ctx.view.camera, ctx.graph.scene, () =>
      ctx.trains.primeForCompile(),
    );
    ctx.log.info(`trains attached ${Math.round(performance.now() - t0)} ms`);
  }
  ctx.trains.bind(buf);
}

function loaders(
  ctx: RenderContext,
): Pick<RenderService, 'precompile' | 'precompileLate' | 'loadAvatar' | 'loadTrees' | 'loadSignage' | 'loadCrowd'> {
  const { renderer, view, graph, log } = ctx;
  return {
    precompile: (onProgress) => precompileAll(ctx, onProgress),
    precompileLate: (onProgress) => precompileLate(ctx, onProgress),
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
      await compileDetached(renderer, ctx.crowd.root, view.camera, graph.scene, () => ctx.crowd.primeForCompile());
      log.info(
        `crowd attached (${assets.bases.length} bases, lod idx ${assets.bases[0]?.lods.map((l) => l.index.count).join('/')}) ${Math.round(performance.now() - t0)} ms`,
      );
    },
  };
}

/** 환경(sim) → 대기 해·달·젖음·날씨·나무 계절·차량 밤·바람. */
function setEnvironment(ctx: RenderContext, e: Readonly<EnvironmentState>): void {
  ctx.atmosphere.setBodies(e.sunDirWF, e.moonDirWF);
  ctx.envUniforms.wetness.value = Math.min(Math.max(e.weather.wetness, 0), 1);
  applyWeather(ctx, e);
  ctx.treeUniforms?.setSeason(e.season.dayOfYear);
  outfitU.value = Math.min(Math.max(e.season.outfitPalette, 0), 1);
  ctx.vehicleUniforms.night.value = nightFromSun(e.sunDirWF.y);
  updateNight(e.sunDirWF.y, e.gameTimeMs, e.dayType ?? 'weekday');
  setTreeWind(ctx, e.weather.windMs, e.weather.windDirDeg);
}

export async function createRender(deps: RenderDeps): Promise<RenderService> {
  const ctx = await createRenderContext(deps);
  const { prep, draw } = createFrameSystems(ctx);
  const { renderer, view, cells, hlod, library, log } = ctx;
  const staged = createStaging(ctx);
  return {
    renderOriginWF: view.renderOriginWF,
    setQuality: (tier) => ctx.quality.setTier(tier),
    ...photoApi(ctx),
    detectQuality: () => ctx.quality.detect(),
    backend: ctx.backend,
    depth: ctx.depth,
    ...staged.api,
    pedestrians: { bindShared: (buf) => ctx.crowd.bind(buf), setFarDensity: (k) => ctx.farCrowd.setDensity(k) },
    vehicles: createVehicleLayer(ctx),
    trains: {
      bindShared: (buf) => bindTrains(ctx, buf),
      setStations: (d) => {
        ctx.trains.setStations(d);
        ctx.counters.sceneVersion++;
      },
    },
    setSignalLamps: (lamp) => {
      ctx.signalLamp = lamp;
    },
    ...stationApi(ctx),
    debugLayerVisible: (layer, visible) => debugLayerVisible(ctx, layer, visible),
    addCell: (p) => {
      cells.add(p, view.renderOriginWF);
      staged.take(p.key);
      ctx.props.addCell(p.key, p.originWF, p.instances?.props);
      ctx.trees.addCell(p.key, p.originWF, p.instances?.trees);
      ctx.signs.addCell(p.key, p.originWF, p.instances?.props);
      if (p.level === 0) ctx.farCrowd.addCell(p.key, p.originWF, p.meshes.roads);
      if (p.level === 0) ctx.nightLights.addCell(p.key, p.originWF, p.lights);
      ctx.counters.sceneVersion++;
    },
    removeCell: (key) => {
      cells.remove(key);
      ctx.props.removeCell(key);
      ctx.trees.removeCell(key);
      ctx.signs.removeCell(key);
      ctx.farCrowd.removeCell(key);
      ctx.nightLights.removeCell(key);
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
    setEnvironment: (e) => setEnvironment(ctx, e),
    stats: () => statsOf(ctx),
    dispose: () => draw.dispose(),
    systems: () => [prep, draw],
  };
}
