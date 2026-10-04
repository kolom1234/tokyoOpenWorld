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
  type WorkerSupervisor,
} from '@sanpo/core';
import { createInput, type InputService } from '@sanpo/input';
import { createPhysics, type PhysicsService } from '@sanpo/physics';
import { createRender, type RenderConfig, type RenderService } from '@sanpo/render';
import { type ClockMode, createSim, type SignalPlansFile, type SimService } from '@sanpo/sim';
import { createStreaming, type StreamingService } from '@sanpo/streaming';
import { createTraversal, type FreecamParams, type TraversalService } from '@sanpo/traversal';
import SIGNAL_PLANS from '../../../content/sim/signal-plans.json';
import { type BootStage, bootProgressText, precompileText } from './boot-progress.ts';
import type { WeatherOverride } from './debug/wet-override.ts';
import { startFreecamPose, startWalkParams } from './start-view.ts';
import { createCameraWiring } from './wiring/camera.ts';
import { createEnvWiring, defaultClock } from './wiring/env.ts';
import { createGroundLoadingIndicator } from './wiring/ground-loading.ts';
import { createStreamingPhysicsWiring, type StreamingPhysicsWiring } from './wiring/streaming-physics.ts';
import { createStreamingRenderWiring, type StreamingRenderWiring } from './wiring/streaming-render.ts';
import { createStreamingSimWiring } from './wiring/streaming-sim.ts';
import {
  type CrowdMode,
  crowdFarDensitySystem,
  type LateState,
  loadAvatarLater,
  loadMaterialsLater,
  loadSignageLater,
  loadTreesLater,
  signalLampsOf,
  startCrowdLater,
} from './world-late.ts';
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
  /** 첫 표시 전 준비 단계 글(로딩 패널 — 선컴파일 진행·스폰 셀 수). 첫 표시 뒤 ''. */
  bootProgress(): string;
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
  /** 군중(M06-T03 기본 agents — DetourCrowd tier A, `?crowd=0` off, dummy = 더미 1,000명(M06-T01), scramble = agents + 스크램블 시험 250명). */
  crowd?: CrowdMode;
}

/** streaming(디코드 워커) + streaming→render 배선을 만들어 스케줄러에 붙인다(init은 직접 — 스케줄러 init은 이미 지남). */
async function startStreaming(
  deps: WorldViewDeps,
  v: { render: RenderService; traversal: TraversalService; sim: SimService },
  world: LoadedWorld,
  late: LateState,
): Promise<StreamingService> {
  const { render, traversal } = v;
  const { bus, log } = deps;
  const supervisor = createWorkerSupervisor({ log });
  late.supervisor = supervisor;
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
  // 군중 내비(M06-T03): live L0 셀의 nav.bin → sim(워커 시작 전이면 보관).
  if ((deps.crowd ?? 'agents') !== 'off')
    late.simWiring = createStreamingSimWiring({
      streaming: s,
      bus,
      sim: v.sim,
      player: () => ({ posWF: traversal.player.posWF }),
      log: log.child('sim-wiring'),
    });
  for (const sys of s.systems()) await sys.init?.();
  deps.scheduler.add(s);
  deps.scheduler.add({ systems: () => late.wiring?.systems ?? [] });
  deps.scheduler.add(physics);
  deps.scheduler.add({
    systems: () => [
      ...(late.physicsWiring ? [late.physicsWiring.system] : []),
      ...(late.simWiring ? [late.simWiring.system] : []),
    ],
  });
  return s;
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
 * 첫 표시: 선컴파일 ∥ (streaming 시작 → 스폰 영역 다운로드·디코드·적용(대기 그룹) → 셀 compileStaged) → 붙이기 → 시작 모드 → 머티리얼·아바타(비동기).
 * 선컴파일(≈ 5 s)과 셀 준비·컴파일을 겹친다(M06 사전 4). 반환 = 스폰 영역 live L0 셀 수.
 * 지면 높이를 알게 된 뒤 시작 포즈를 다시 잡는다(freecam "지면 위 60 m" 또는 스폰에서 걷기 — 착지점은 walk가 콜라이더로 찾는다).
 */
async function showWorldWith(
  deps: WorldViewDeps,
  v: {
    render: RenderService;
    traversal: TraversalService;
    ground: GroundQuery;
    late: LateState;
    /** createWorldView에서 렌더 생성 직후 시작한 선컴파일(world.json 조회와 겹침 — M06 사전 4). */
    precompiled: Promise<void>;
    sim: SimService;
  },
  world: LoadedWorld,
): Promise<number> {
  const { render, traversal, ground, late } = v;
  const wlog = deps.log.child('world');
  // 스폰 셀은 대기 그룹에(그리지 않음) → 선컴파일과 겹쳐 셀 파이프라인을 만든 뒤 붙인다(첫 렌더 동기 컴파일 1.4 s 제거).
  render.stageCells(true);
  const pre = v.precompiled;
  const s = await startStreaming(deps, { render, traversal, sim: v.sim }, world, late);
  late.boot.spawn = world.spawnCells;
  const centerWF = deps.start?.centerWF ?? world.spawnWF;
  // exclusive: 첫 표시 전엔 준비 집합만 받는다(14 §2 초기 다운로드 — 선컴파일·대기 준비로 첫 표시가 늦어도 선적재가 쌓이지 않게).
  await s.whenReady({ centerWF, radius: SPAWN_READY_RADIUS_M, levels: [0], exclusive: true, holdExclusiveUntil: pre });
  late.boot.precompile = '셀 셰이더…';
  await Promise.all([pre, render.compileStaged().catch((e: unknown) => wlog.warn('staged compile', e))]);
  render.commitStaged();
  late.boot.done = true;
  if (deps.start === undefined && (deps.startMode ?? 'walk') === 'walk')
    traversal.request('walk', startWalkParams(world.spawnWF, world.spawnYawRad, ground));
  else traversal.request('freecam', (deps.start?.pose ?? startFreecamPose)(ground));
  loadMaterialsLater(render, world.materialsUrl, late, wlog);
  loadAvatarLater(render, late, wlog);
  if (deps.trees === false) late.treesSettled = true;
  else loadTreesLater(render, late, wlog);
  loadSignageLater(render, late, wlog);
  const crowd = deps.crowd ?? 'agents';
  if (crowd !== 'off') {
    startCrowdLater(v, world, crowd, wlog);
    const far = crowdFarDensitySystem(v.sim, render);
    deps.scheduler.add({ systems: () => [far] });
  }
  render.setSignalLamps(signalLampsOf(v.sim));
  return world.spawnCells.filter((k) => s.stateOf(k) === 'live').length;
}

/** sim(시계 + 신호 계획 content/sim/signal-plans.json — M06-T02). */
function simFor(deps: WorldViewDeps): SimService {
  const now = deps.now ?? Date.now;
  const signalPlans = SIGNAL_PLANS as unknown as SignalPlansFile;
  return createSim({ bus: deps.bus, log: deps.log, now, initialClock: deps.clock ?? defaultClock(now()), signalPlans });
}

function initialLate(): LateState {
  return {
    materialsSettled: false,
    avatarSettled: false,
    treesSettled: false,
    signsSettled: false,
    boot: { precompile: '대기 LUT…', done: false },
  };
}

/** 선컴파일은 월드와 무관 → 렌더 생성 직후 시작(world.json·cells.idx 조회와 겹침). 진행은 로딩 패널 준비 행으로. */
function startPrecompile(render: RenderService, late: LateState, log: Logger): Promise<void> {
  return render
    .precompile((p) => {
      late.boot.precompile = precompileText(p);
    })
    .catch((e: unknown) => log.child('world').warn('precompile', e));
}

export async function createWorldView(deps: WorldViewDeps): Promise<WorldView> {
  const { canvas, bus, log } = deps;
  const config = { ...deps.renderConfig, backend: deps.backend };
  const render = await createRender({ canvas, bus, log, config });
  const late = initialLate();
  const precompiled = startPrecompile(render, late, log);
  const input = createInput({ target: canvas, bus, log });
  const ground: GroundQuery = { groundHeightAt: (x, z) => late.streaming?.groundHeightAt(x, z) };
  const traversal = createTraversalFor(deps, input, ground, late);
  const sim = simFor(deps);
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
    showWorld: (world) => showWorldWith(deps, { render, traversal, ground, late, precompiled, sim }, world),
    bootProgress: () => bootProgressText(late.boot, late.streaming),
  };
}
