// 부트 7–9단계 조립: render + input + traversal(로딩 중 freecam → 첫 표시에 walk — 09 §1 기본, `?mode=freecam`·골든뷰는 freecam 유지) + 카메라 배선, 월드 로드 후 streaming(디코드 워커) + streaming→render·physics 배선.
// 지면 질의는 streaming 높이장(월드 로드 전 = 미적재). see docs/modules/game.md §부트 시퀀스, docs/06-world-streaming.md §8
import {
  createWorkerSupervisor,
  type DeepPartial,
  type EventBus,
  type FrameSource,
  type GroundQuery,
  type Logger,
  type Scheduler,
  type SystemProvider,
  type Vec3d,
} from '@sanpo/core';
import { createInput, type InputService } from '@sanpo/input';
import { createPhysics, type PhysicsService } from '@sanpo/physics';
import {
  createRender,
  type RenderConfig,
  type RenderService,
  type SignageAssetUrls,
  type TreeAssetUrls,
} from '@sanpo/render';
import { type ClockMode, createSim, type SimService } from '@sanpo/sim';
import { createStreaming, type StreamingService } from '@sanpo/streaming';
import { createTraversal, type FreecamParams, type TraversalService } from '@sanpo/traversal';
import type { WeatherOverride } from './debug/wet-override.ts';
import { startFreecamPose, startWalkParams } from './start-view.ts';
import { createCameraWiring } from './wiring/camera.ts';
import { createEnvWiring, defaultClock } from './wiring/env.ts';
import { createGroundLoadingIndicator } from './wiring/ground-loading.ts';
import { createStreamingPhysicsWiring, type StreamingPhysicsWiring } from './wiring/streaming-physics.ts';
import { createStreamingRenderWiring, type StreamingRenderWiring } from './wiring/streaming-render.ts';
import type { LoadedWorld } from './world-load.ts';

/** 부팅 대기 영역: 스폰 수평 384 m 안 L0 — 스폰 셀 안 어디서든 3×3 모서리 셀(≤ 362 m)까지 포함(06 §8 스폰 3×3). 상위 레벨은 우선순위상 먼저 온다. */
export const SPAWN_READY_RADIUS_M = 384;

export interface WorldView {
  readonly render: RenderService;
  readonly input: InputService;
  readonly traversal: TraversalService;
  readonly sim: SimService;
  readonly ground: GroundQuery;
  readonly providers: readonly SystemProvider[];
  readonly frameSource: FrameSource;
  /** showWorld 뒤에만 있다. */
  readonly streaming: StreamingService | undefined;
  readonly wiring: StreamingRenderWiring | undefined;
  /** showWorld 뒤에만 있다(물리 워커 — M04-T02 셀 콜라이더). */
  readonly physics: PhysicsService | undefined;
  readonly physicsWiring: StreamingPhysicsWiring | undefined;
  /** 머티리얼 라이브러리 적재가 끝났거나(성공·실패) 대상이 없음(골든뷰 안정 조건). */
  readonly materialsSettled: boolean;
  /** 아바타 모델 적재·선컴파일이 끝났다(성공·실패 — e2e 안정 조건, ADR-0048). */
  readonly avatarSettled: boolean;
  /** 나무 에셋 적재·선컴파일이 끝났다(성공·실패 — 골든뷰 안정 조건, M05-T04). */
  readonly treesSettled: boolean;
  /** 간판 아틀라스 적재·선컴파일이 끝났다(성공·실패 — 골든뷰 안정 조건, M05-T06). */
  readonly signsSettled: boolean;
  /** streaming 시작 → 스폰 영역 live까지 대기 → 시작 시점으로 이동. 반환 = 스폰 영역 live L0 셀 수. */
  showWorld(world: LoadedWorld): Promise<number>;
}

export interface WorldViewDeps {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  log: Logger;
  scheduler: Pick<Scheduler, 'add'>;
  backend: 'auto' | 'webgl';
  /** render 설정 덮어쓰기(`?exposure=`·`?gpuTiming=1`). */
  renderConfig?: DeepPartial<RenderConfig>;
  now?: () => number;
  /** 시작 시점 재정의(골든뷰 북마크 `?view=`): 부팅 대기 중심과 지면 확인 뒤 포즈(freecam). 없으면 스폰·startMode. */
  start?: { centerWF: Vec3d; pose: (ground: GroundQuery) => FreecamParams; fovDeg?: number };
  /** 첫 표시 모드(`start`가 없을 때): walk(기본 — 스폰에서 걷기) | freecam(`?mode=freecam` — 스폰 위 60 m 시작 시점). */
  startMode?: 'walk' | 'freecam';
  /** 시계 시작(골든뷰·`?time=` = frozen). 없으면 오늘 정오 JST부터 1배속(wiring/env.ts). */
  clock?: ClockMode;
  /** 디버그 날씨 덮어쓰기(`?wet=`). */
  weather?: WeatherOverride;
  /** false = 나무 에셋 적재 안 함(`?trees=0`, GPU 비용 비교). */
  trees?: boolean;
}

/** 월드 로드 뒤 생기는 것들(getter로 노출). */
interface LateState {
  streaming?: StreamingService;
  wiring?: StreamingRenderWiring;
  physics?: PhysicsService;
  physicsWiring?: StreamingPhysicsWiring;
  materialsSettled: boolean;
  avatarSettled: boolean;
  treesSettled: boolean;
  signsSettled: boolean;
}

/** streaming(디코드 워커) + streaming→render 배선을 만들어 스케줄러에 붙인다(init은 직접 — 스케줄러 init은 이미 지남). */
async function startStreaming(
  deps: WorldViewDeps,
  render: RenderService,
  traversal: TraversalService,
  world: LoadedWorld,
  late: LateState,
): Promise<StreamingService> {
  const { bus, log } = deps;
  const supervisor = createWorkerSupervisor({ log });
  const s = createStreaming({
    bus,
    log,
    world: { baseUrl: world.baseUrl, buildId: world.buildId, cellsIndex: world.cellsIndex },
    supervisor,
    initialMode: traversal.mode,
  });
  late.streaming = s;
  late.wiring = createStreamingRenderWiring({ streaming: s, render, traversal, log: log.child('world') });
  // 물리(M04-T02): 앵커 = 스폰 격자점. 워커 초기화는 기다리지 않는다(셀 콜라이더는 준비되면 적재).
  const physics = createPhysics({ bus, log, supervisor, originWF: world.spawnWF });
  physics.ready.catch((e: unknown) => log.error('physics', e));
  late.physics = physics;
  late.physicsWiring = createStreamingPhysicsWiring({
    streaming: s,
    bus,
    physics,
    player: () => ({ posWF: traversal.player.posWF, mode: traversal.mode }),
    log: log.child('physics-wiring'),
  });
  for (const sys of s.systems()) await sys.init?.();
  deps.scheduler.add(s);
  deps.scheduler.add({ systems: () => late.wiring?.systems ?? [] });
  deps.scheduler.add(physics);
  deps.scheduler.add({ systems: () => (late.physicsWiring ? [late.physicsWiring.system] : []) });
  return s;
}

/** 텍스처는 첫 표시 뒤(초기 다운로드 예산 밖, 14 §2). 실패하면 평균색으로 계속. */
function loadMaterialsLater(render: RenderService, url: string | undefined, late: LateState, log: Logger): void {
  if (url === undefined) {
    late.materialsSettled = true;
    return;
  }
  void render
    .loadMaterials(url)
    .catch((e: unknown) => log.warn('materials', e))
    .finally(() => {
      late.materialsSettled = true;
    });
}

/** 플레이어 아바타 GLB(파이프라인 `avatar`, Quaternius CC0 — ADR-0048). Vite가 해시 에셋으로 만든다(/assets/*, immutable). */
export const AVATAR_URL = new URL('./assets/avatar-ubc-male.glb', import.meta.url).href;

/** 아바타 모델도 첫 표시 뒤(초기 다운로드 예산 밖). 실패하면 절차 마네킹. */
function loadAvatarLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadAvatar(AVATAR_URL)
    .catch((e: unknown) => log.warn('avatar', e))
    .finally(() => {
      late.avatarSettled = true;
    });
}

/** 나무 에셋(파이프라인 `trees` — ez-tree 수종·자체 잎·임포스터 아틀라스, ADR-0052). Vite 해시 에셋. */
export const TREE_URLS: TreeAssetUrls = {
  manifest: new URL('./assets/trees/trees.json', import.meta.url).href,
  glb: new URL('./assets/trees/trees.glb', import.meta.url).href,
  leaves: new URL('./assets/trees/leaves.png', import.meta.url).href,
  impostor: new URL('./assets/trees/impostor-color.png', import.meta.url).href,
};

/** 간판 아틀라스(파이프라인 `signage` — 가상 브랜드, ADR-0054). Vite 해시 에셋. */
export const SIGNAGE_URLS: SignageAssetUrls = {
  atlas: new URL('./assets/signage/atlas.png', import.meta.url).href,
};

/** 간판도 첫 표시 뒤(≈ 0.25 MB). 실패하면 무지 간판·간판 인스턴스 없이. */
function loadSignageLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadSignage(SIGNAGE_URLS)
    .catch((e: unknown) => log.warn('signage', e))
    .finally(() => {
      late.signsSettled = true;
    });
}

/** 나무도 첫 표시 뒤(초기 다운로드 밖, ≈ 1.6 MB). 실패하면 나무 없이. */
function loadTreesLater(render: RenderService, late: LateState, log: Logger): void {
  void render
    .loadTrees(TREE_URLS)
    .catch((e: unknown) => log.warn('trees', e))
    .finally(() => {
      late.treesSettled = true;
    });
}

/** traversal: 로딩 중 = freecam(시작 시점). physics는 월드 로드 뒤 생긴다 → getter(전환 요청 때마다 요구조건을 본다 — walk는 그때부터). */
function createTraversalFor(
  deps: WorldViewDeps,
  input: InputService,
  ground: GroundQuery,
  late: LateState,
): TraversalService {
  const startPose = deps.start?.pose ?? startFreecamPose;
  const fov = deps.start?.fovDeg;
  return createTraversal(
    {
      input,
      bus: deps.bus,
      log: deps.log,
      ground,
      get physics() {
        return late.physics;
      },
    },
    { initial: { mode: 'freecam', params: startPose(ground) }, ...(fov ? { settings: { fovDeg: fov } } : {}) },
  );
}

/**
 * 첫 표시: 선컴파일 → streaming 시작 → 스폰 영역 whenReady → 시작 모드 → 머티리얼·아바타(비동기). 반환 = 스폰 영역 live L0 셀 수.
 * 지면 높이를 알게 된 뒤 시작 포즈를 다시 잡는다(freecam "지면 위 60 m" 또는 스폰에서 걷기 — 착지점은 walk가 콜라이더로 찾는다).
 */
async function showWorldWith(
  deps: WorldViewDeps,
  v: { render: RenderService; traversal: TraversalService; ground: GroundQuery; late: LateState },
  world: LoadedWorld,
): Promise<number> {
  const { render, traversal, ground, late } = v;
  const wlog = deps.log.child('world');
  await render.precompile().catch((e: unknown) => wlog.warn('precompile', e));
  const s = await startStreaming(deps, render, traversal, world, late);
  const centerWF = deps.start?.centerWF ?? world.spawnWF;
  // exclusive: 첫 표시 전엔 준비 집합만 받는다(14 §2 초기 다운로드 — 선컴파일·대기 준비로 첫 표시가 늦어도 선적재가 쌓이지 않게).
  await s.whenReady({ centerWF, radius: SPAWN_READY_RADIUS_M, levels: [0], exclusive: true });
  if (deps.start === undefined && (deps.startMode ?? 'walk') === 'walk')
    traversal.request('walk', startWalkParams(world.spawnWF, world.spawnYawRad, ground));
  else traversal.request('freecam', (deps.start?.pose ?? startFreecamPose)(ground));
  loadMaterialsLater(render, world.materialsUrl, late, wlog);
  loadAvatarLater(render, late, wlog);
  if (deps.trees === false) late.treesSettled = true;
  else loadTreesLater(render, late, wlog);
  loadSignageLater(render, late, wlog);
  return world.spawnCells.filter((k) => s.stateOf(k) === 'live').length;
}

export async function createWorldView(deps: WorldViewDeps): Promise<WorldView> {
  const { canvas, bus, log } = deps;
  const config = { ...deps.renderConfig, backend: deps.backend };
  const render = await createRender({ canvas, bus, log, config });
  const input = createInput({ target: canvas, bus, log });
  const late: LateState = { materialsSettled: false, avatarSettled: false, treesSettled: false, signsSettled: false };
  const ground: GroundQuery = { groundHeightAt: (x, z) => late.streaming?.groundHeightAt(x, z) };
  const traversal = createTraversalFor(deps, input, ground, late);
  const now = deps.now ?? Date.now;
  const sim = createSim({ bus, log, now, initialClock: deps.clock ?? defaultClock(now()) });
  const frameSource: FrameSource = {
    camera: () => traversal.camera,
    player: () => traversal.player,
    gameTimeMs: () => sim.clock.gameTimeMs,
    timeScale: () => sim.clock.timeScale,
  };
  const wiringSystems = [
    createCameraWiring(traversal, render),
    createEnvWiring(sim, render, deps.weather),
    createGroundLoadingIndicator(canvas.ownerDocument, traversal),
  ];

  return {
    render,
    input,
    traversal,
    sim,
    ground,
    frameSource,
    providers: [input, sim, traversal, { systems: () => wiringSystems }, render],
    get streaming() {
      return late.streaming;
    },
    get wiring() {
      return late.wiring;
    },
    get physics() {
      return late.physics;
    },
    get physicsWiring() {
      return late.physicsWiring;
    },
    get materialsSettled() {
      return late.materialsSettled;
    },
    get avatarSettled() {
      return late.avatarSettled;
    },
    get treesSettled() {
      return late.treesSettled;
    },
    get signsSettled() {
      return late.signsSettled;
    },
    showWorld: (world) => showWorldWith(deps, { render, traversal, ground, late }, world),
  };
}
