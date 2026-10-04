// 렌더 내부 컨텍스트: 초기화된 렌더러 + 씬 그래프 + 머티리얼 + 시점 + 셀 집합. createRender(service.ts)·프레임 시스템(frame.ts)이 공유한다.
// see docs/modules/render.md
import { type Logger, mergeConfig, type QualityTier } from '@sanpo/core';
import type { Material, WebGPURenderer } from 'three/webgpu';
import type { DepthMode, PostEffects, RenderBackend, RenderConfig, RenderDeps } from '../api.ts';
import { DEFAULT_RENDER_CONFIG } from './config.ts';
import { createFarCrowd, type FarCrowd } from './crowd/far.ts';
import { type CrowdField, createCrowdField } from './crowd/field.ts';
import { type AtmosphereRig, createAtmosphere } from './lighting/atmosphere.ts';
import { attachEnvProbe, type EnvProbe } from './lighting/env-probe.ts';
import { enableSunShadows, type SunShadows } from './lighting/shadows.ts';
import { DEFAULT_MOON_DIR_WF, DEFAULT_SUN_DIR_WF } from './lighting/sun.ts';
import { glassRoughness } from './materials/glass.ts';
import { createMaterialLibrary, type MaterialLibrary } from './materials/library.ts';
import { createPropMaterial } from './materials/prop.ts';
import { createMaterialRegistry, type MaterialRegistry } from './materials/registry.ts';
import { resolvePost } from './post/config.ts';
import { createDirectRender, createPostPipeline, type PostPipeline } from './post/pipeline.ts';
import { createPropField, type PropField } from './props/pools.ts';
import { createQualityManager, type QualityManager } from './quality.ts';
import { createGpuTimer, type GpuTimer } from './renderer/gpu-timer.ts';
import { initRenderer } from './renderer/init.ts';
import { type Avatar, createAvatar } from './scene/avatar.ts';
import { type CellSet, createCellSet } from './scene/cell-node.ts';
import { createHlodSwitch, type HlodSwitch } from './scene/hlod-switch.ts';
import { createRenderView, type RenderView } from './scene/render-view.ts';
import { createSceneGraph, type SceneGraph } from './scene/scene-graph.ts';
import { createSignField, type SignField } from './signs/field.ts';
import { createTreeField, type TreeField } from './trees/field.ts';
import type { TreeUniforms } from './trees/materials.ts';
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
  /** 플레이어 아바타(dynamic 루트, M04-T05). */
  readonly avatar: Avatar;
  /** 거리 소품 인스턴스 풀(prop 루트, M05-T03). */
  readonly props: PropField;
  /** 나무(vegetation 루트, M05-T04) — 에셋은 loadTrees 뒤. 머티리얼은 적재 때 채운다(그림자 티어 재컴파일 대상). */
  readonly trees: TreeField;
  readonly crowd: CrowdField;
  /** 원경 군중 스프라이트(tier C, M06-T04). */
  readonly farCrowd: FarCrowd;
  /** 군중 머티리얼(적재 뒤 — 그림자 티어 재컴파일 대상). */
  readonly crowdMaterials: Material[];
  readonly treeMaterials: Material[];
  treeUniforms?: TreeUniforms;
  /** 가상 간판(prop 루트, M05-T06) — 에셋은 loadSignage 뒤. */
  readonly signs: SignField;
  readonly signMaterials: Material[];
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
  /** 프레임 카운터·마지막 HLOD 페이드 수·장면 버전(셀·HLOD 표시 변경마다 +1, 그림자 캐시 무효화)·이번 프레임 그림자 캐스케이드 수(stats). */
  readonly counters: { frames: number; fading: number; sceneVersion: number; shadowUpdates: number };
  /** 신호 램프 원천(M06-T02 — setSignalLamps). */
  signalLamp?: ((code: number) => number) | null;
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

/** 품질 관리자: 티어 변경 = applyTier(그림자·후처리 재구성), 동적 해상도 = 현재 후처리의 렌더 스케일. */
function attachQuality(
  ctx: Pick<RenderContext, 'cfg' | 'log' | 'backend' | 'post'>,
  deps: RenderDeps,
  hw: { post: boolean; software: boolean },
  applyTier: (tier: QualityTier) => number,
): QualityManager {
  const { post, software } = hw;
  return createQualityManager({
    bus: deps.bus,
    log: ctx.log,
    backend: ctx.backend,
    software,
    initial: ctx.cfg.quality,
    dynamic: post && ctx.cfg.dynamicResolution,
    benchmarksPath: ctx.cfg.gpuBenchmarksPath,
    applyTier,
    applyScale: (s) => ctx.post.setRenderScale(s),
  });
}

/** 대기·태양광(light 루트) — 기본 해·달 방향, 렌더 원점. */
function attachAtmosphere(renderer: WebGPURenderer, graph: SceneGraph, view: RenderView, sky: boolean): AtmosphereRig {
  const atmosphere = createAtmosphere(renderer, graph.scene, view.camera, sky);
  graph.roots.light.add(atmosphere.light, atmosphere.light.target);
  atmosphere.setOrigin(view.renderOriginWF);
  atmosphere.setBodies(DEFAULT_SUN_DIR_WF, DEFAULT_MOON_DIR_WF);
  return atmosphere;
}

/** 아바타(dynamic 루트)·거리 소품 풀(prop 루트, M05-T03). */
function attachActors(graph: SceneGraph): {
  avatar: Avatar;
  props: PropField;
  trees: TreeField;
  signs: SignField;
  crowd: CrowdField;
  farCrowd: FarCrowd;
} {
  const avatar = createAvatar();
  graph.roots.dynamic.add(avatar.group);
  const props = createPropField(createPropMaterial());
  graph.roots.prop.add(props.root);
  const trees = createTreeField();
  graph.roots.vegetation.add(trees.root);
  const signs = createSignField();
  graph.roots.prop.add(signs.root);
  const crowd = createCrowdField();
  graph.roots.dynamic.add(crowd.root);
  const farCrowd = createFarCrowd();
  graph.roots.dynamic.add(farCrowd.root);
  return { avatar, props, trees, signs, crowd, farCrowd };
}

/** 적재 뒤 붙는 머티리얼(그림자 티어 재컴파일 대상). */
interface LateMaterials {
  treeMaterials: Material[];
  signMaterials: Material[];
  crowdMaterials: Material[];
}

function casterMaterials(
  m: MaterialRegistry,
  a: { avatar: Avatar; props: PropField },
  late: LateMaterials,
): Material[] {
  return [
    ...m.all(),
    ...a.avatar.materials,
    a.props.material,
    ...late.treeMaterials,
    ...late.signMaterials,
    ...late.crowdMaterials,
  ];
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
  const atmosphere = attachAtmosphere(renderer, graph, view, !post);
  if (backend === 'webgl2') glassRoughness.value = WEBGL2_GLASS_ROUGHNESS;
  const postFor = postEffectsFor(cfg, backend);
  const actors = attachActors(graph);
  const late: LateMaterials = { treeMaterials: [], signMaterials: [], crowdMaterials: [] };
  const casters = () => casterMaterials(materials, actors, late);
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
    ...actors,
    ...late,
    atmosphere,
    envUniforms,
    env: post ? attachEnvProbe(graph.scene, atmosphere.light) : { dispose() {} },
    shadows: post && cfg.shadows ? enableSunShadows(renderer, atmosphere.light, cfg.quality, casters) : undefined,
    post: makePost(cfg.quality),
    gpuTimer: createGpuTimer(renderer, cfg.gpuTiming),
    counters: { frames: 0, fading: 0, sceneVersion: 0, shadowUpdates: 0 },
  };
  ctx.quality = attachQuality(ctx, deps, { post, software }, (tier) => {
    ctx.shadows?.setTier(tier);
    ctx.post.dispose();
    ctx.post = makePost(tier);
    return postFor(tier).renderScale;
  });
  // WebGL2 상한 등으로 관리자가 티어를 낮췄으면 그림자도 맞춘다(첫 빌드 전 — 재컴파일 없음).
  if (ctx.quality.tier !== cfg.quality) ctx.shadows?.setTier(ctx.quality.tier);
  return ctx as RenderContext;
}
