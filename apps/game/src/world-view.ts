// 부트 7–9단계 조립: render + input + traversal(로딩 중 freecam → 첫 표시에 walk — 09 §1 기본, `?mode=freecam`·골든뷰는 freecam 유지) + 카메라 배선, 월드 로드 후 streaming(디코드 워커) + streaming→render·physics 배선.
// 지면 질의는 streaming 높이장(월드 로드 전 = 미적재). see docs/modules/game.md §부트 시퀀스, docs/06-world-streaming.md §8
import type { AudioService } from '@sanpo/audio';
import {
  createWorkerSupervisor,
  type DeepPartial,
  type EventBus,
  type FrameSource,
  type GameSystem,
  type GroundQuery,
  type Logger,
  type Scheduler,
  type SystemProvider,
  type Vec3d,
} from '@sanpo/core';
import { createInput, type InputService } from '@sanpo/input';
import { createPhysics, type PhysicsService } from '@sanpo/physics';
import { createRender, type RenderConfig, type RenderService } from '@sanpo/render';
import type { ClockMode, SimService } from '@sanpo/sim';
import { createStreaming, type StreamingService } from '@sanpo/streaming';
import { createTraversal, type FreecamParams, type TraversalService } from '@sanpo/traversal';
import { bootProgressText } from './boot-progress.ts';
import type { WeatherOverride } from './debug/wet-override.ts';
import { helpHudSystem } from './help-hud.ts';
import type { SpawnPreset } from './spawn-presets.ts';
import { presetFreecamPose, startFreecamPose, startWalkParams } from './start-view.ts';
import { trainLcdSystem } from './train-lcd.ts';
import type { PlayerCars } from './vehicles/player-cars.ts';
import type { WeatherSpec } from './weather-mode.ts';
import { createCameraWiring } from './wiring/camera.ts';
import { createEnvWiring } from './wiring/env.ts';
import { createGroundLoadingIndicator } from './wiring/ground-loading.ts';
import { createStreamingPhysicsWiring, type StreamingPhysicsWiring } from './wiring/streaming-physics.ts';
import { createStreamingRenderWiring, type StreamingRenderWiring } from './wiring/streaming-render.ts';
import { createStreamingSimWiring } from './wiring/streaming-sim.ts';
import type { AudioFlags } from './world-audio.ts';
import { startWorldExtras } from './world-extras.ts';
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
import { frameSourceOf, initialLate, simFor, startPrecompile, warmStaged } from './world-parts.ts';
import { startTrainsLater, trainPhysicsSystem } from './world-rail.ts';

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
  /** 오디오(M09-T04) — showWorld 뒤, `?audio=0`이면 없음. */
  readonly audio: AudioService | undefined;
  readonly wiring: StreamingRenderWiring | undefined;
  /** showWorld 뒤에만 있다(물리 워커 — M04-T02 셀 콜라이더). */
  readonly physics: PhysicsService | undefined;
  readonly physicsWiring: StreamingPhysicsWiring | undefined;
  /** 플레이어 차(M08-T01) — showWorld 뒤. 디버그·주행 봇(`__SANPO_DEBUG__.world.cars`). */
  readonly cars: PlayerCars | undefined;
  /** 머티리얼 라이브러리 적재가 끝났거나(성공·실패) 대상이 없음(골든뷰 안정 조건). */
  readonly materialsSettled: boolean;
  /** 아바타 모델 적재·선컴파일이 끝났다(성공·실패 — e2e 안정 조건, ADR-0048). */
  readonly avatarSettled: boolean;
  /** 나무 에셋 적재·선컴파일이 끝났다(성공·실패 — 골든뷰 안정 조건, M05-T04). */
  readonly treesSettled: boolean;
  /** 간판 아틀라스 적재·선컴파일이 끝났다(성공·실패 — 골든뷰 안정 조건, M05-T06). */
  readonly signsSettled: boolean;
  /** 군중: 팩 적재가 끝났고(또는 군중 없음) 처음 채우기가 끝났다(골든뷰 안정 조건, M06-T07). */
  readonly crowdSettled: boolean;
  /** 철도 적재·열차 선컴파일이 끝났거나(성공·실패·없음) 끔(골든뷰 안정 조건, M07-T03). */
  readonly trainsSettled: boolean;
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
  /** 오디오 플래그(`?audio=0`·`?vol=`, M09-T04). */
  audio?: AudioFlags;
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
  /** 날씨 모드(M09-T01 — weather-mode.ts). 없으면 auto. live = /api/weather 폴링(onLiveWeather = 크레딧 표기). */
  weatherSpec?: WeatherSpec;
  onLiveWeather?: (on: boolean) => void;
  /** false = 나무 에셋 적재 안 함(`?trees=0`, GPU 비용 비교). */
  trees?: boolean;
  /** 군중(M06-T03 기본 agents — DetourCrowd tier A, `?crowd=0` off, dummy = 더미 1,000명(M06-T01), scramble = agents + 스크램블 시험 250명). */
  crowd?: CrowdMode;
  /** false = 차량 없음(`?traffic=0`, M06-T06 비용 비교). */
  traffic?: boolean;
  /** false = 열차 없음(`?trains=0`, M07-T03). */
  trains?: boolean;
  /** `?debug=1` — 디버그 핸들(역 질의 `__SANPO_STATIONS__`). */
  debug?: boolean;
  /** `?spawn=<id>` 프리셋(boot가 월드 스폰을 바꿔 넘긴다 — surface 'platform'이면 world-extras가 승강장 윗면으로). */
  spawn?: SpawnPreset;
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

/** freecam 시작 시점: 골든뷰 > 스폰 프리셋 위 > 기본(스크램블 북서 상공). */
function startPoseOf(deps: WorldViewDeps): (g: GroundQuery) => FreecamParams {
  const sp = deps.spawn;
  return deps.start?.pose ?? (sp ? (g: GroundQuery) => presetFreecamPose(sp, g) : startFreecamPose);
}

/** traversal: 로딩 중 = freecam(시작 시점). physics는 월드 로드 뒤 생긴다 → getter(전환 요청 때마다 요구조건을 본다 — walk는 그때부터). */
function createTraversalFor(
  deps: WorldViewDeps,
  input: InputService,
  ground: GroundQuery,
  late: LateState,
  sim: SimService,
): TraversalService {
  const startPose = startPoseOf(deps);
  const fov = deps.start?.fovDeg;
  const player = { posWF: { x: 0, y: 0, z: 0 } };
  const t = createTraversal(
    {
      input,
      bus: deps.bus,
      log: deps.log,
      ground,
      get physics() {
        return late.physics;
      },
      // 열차(M07-T05): 근처 열차·칸 자세·탑승 정보·시계 점프(빨리감기).
      trains: () => sim.trainsNear(player.posWF, 300),
      trainCar: (id, k) => sim.trainCar(id, k),
      trainRide: (id) => sim.trainRide(id),
      jumpClock: (ms) => sim.clock.jumpTo(ms),
      // freecam G(ADR-0083): 월드 표시 뒤 world-extras가 채운다.
      landing: (p) => late.landing?.(p) ?? Promise.resolve({ ok: false, reason: 'not-ready' }),
      vehicles: () => late.cars?.enterables() ?? [], // 탈 수 있는 차·AEB 위험물(M08 — world-extras 차량 배선)
      hazards: (c, r) => late.hazards?.(c, r) ?? [],
    },
    { initial: { mode: 'freecam', params: startPose(ground) }, ...(fov ? { settings: { fovDeg: fov } } : {}) },
  );
  player.posWF = t.player.posWF;
  return t;
}

/** 첫 표시 뒤 적재(머티리얼·아바타·나무·간판·군중·신호 램프·열차 + 열차 물리). */
function startLateLayers(
  deps: WorldViewDeps,
  v: { render: RenderService; sim: SimService; ground: GroundQuery; late: LateState },
  world: LoadedWorld,
  wlog: Logger,
): void {
  const { render, late } = v;
  loadMaterialsLater(render, world.materialsUrl, late, wlog);
  loadAvatarLater(render, late, wlog);
  if (deps.trees === false) late.treesSettled = true;
  else loadTreesLater(render, late, wlog);
  loadSignageLater(render, late, wlog);
  const crowd = deps.crowd ?? 'agents';
  if (crowd === 'off') late.crowdSettled = true;
  else {
    startCrowdLater(v, world, { mode: crowd, traffic: deps.traffic !== false }, wlog);
    const far = crowdFarDensitySystem(v.sim, render);
    deps.scheduler.add({ systems: () => [far] });
  }
  render.setSignalLamps(signalLampsOf(v.sim));
  if (deps.trains === false) late.trainsSettled = true;
  else
    startTrainsLater(
      v,
      world,
      wlog,
      () => {
        late.trainsSettled = true;
      },
      (rail) => {
        late.rail = rail;
      },
    );
  // 열차·승강장·홈도어 물리(M07-T04): 철도·물리 준비 뒤부터 프레임마다.
  if (deps.trains !== false) {
    const rail = trainPhysicsSystem(v.sim, () => late.physics);
    deps.scheduler.add({ systems: () => [rail] });
  }
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
    input: InputService;
  },
  world: LoadedWorld,
): Promise<number> {
  const { render, traversal, ground, late } = v;
  const wlog = deps.log.child('world');
  // 스폰 셀은 대기 그룹에(그리지 않음) → 선컴파일과 겹쳐 셀 파이프라인을 만든 뒤 붙인다(첫 렌더 동기 컴파일 1.4 s 제거).
  render.stageCells(true);
  const pre = v.precompiled;
  const s = await startStreaming(deps, { render, traversal, sim: v.sim }, world, late);
  // 오디오는 스폰 셀 onReady를 받도록 스트리밍 직후(소리는 첫 제스처 unlock 뒤 — 녹음은 R2 shared/audio 지연 로딩).
  if (late.wiring) late.audio = startWorldExtras(deps, { ...v, streaming: s, cells: late.wiring }, world.baseUrl, late);
  late.boot.spawn = world.spawnCells;
  const centerWF = deps.start?.centerWF ?? world.spawnWF;
  // exclusive: 첫 표시(commitStaged)까지 준비 집합만 받는다(14 §2 초기 다운로드 — 선컴파일 끝 기준이면 선컴파일이 짧아진 뒤(ADR-0085)
  // 첫 표시 전 남은 몇 초에 이웃·HLOD 선적재가 쌓여 첫 로드가 26 → 75–94 MB였다).
  let markShown: () => void = () => {};
  const shown = new Promise<void>((r) => {
    markShown = r;
  });
  // 스폰 셀이 오는 동안 대기 그룹을 미리 컴파일(0.5 s마다 — 이미 만든 파이프라인은 캐시): 다운로드·디코드와 셀 셰이더 컴파일을 겹친다(ADR-0085).
  const warm = { on: true, stop: () => {} };
  const warming = warmStaged(render, warm);
  await s.whenReady({
    centerWF,
    radius: SPAWN_READY_RADIUS_M,
    levels: [0],
    exclusive: true,
    holdExclusiveUntil: shown,
  });
  warm.on = false;
  warm.stop();
  await warming;
  late.boot.precompile = '셀 셰이더…';
  await Promise.all([pre, render.compileStaged().catch((e: unknown) => wlog.warn('staged compile', e))]);
  render.commitStaged();
  markShown();
  late.boot.done = true;
  // 머티리얼 ID별 선컴파일은 첫 표시 뒤(ADR-0085 — 첫 표시 전엔 compileStaged와 다퉈 ≈ 3–4 s 늦었다).
  void render.precompileLate().catch((e: unknown) => wlog.warn('precompile late', e));
  if (deps.start === undefined && (deps.startMode ?? 'walk') === 'walk')
    traversal.request('walk', startWalkParams(world.spawnWF, world.spawnYawRad, ground));
  else traversal.request('freecam', startPoseOf(deps)(ground));
  startLateLayers(deps, v, world, wlog);
  return world.spawnCells.filter((k) => s.stateOf(k) === 'live').length;
}

/** 상시 배선: 카메라·환경·지면 대기 표시·차내 안내·조작 도움말. */
function wiringSystemsFor(
  deps: WorldViewDeps,
  v: { render: RenderService; traversal: TraversalService; sim: SimService; late: LateState },
): GameSystem[] {
  const doc = deps.canvas.ownerDocument;
  return [
    createCameraWiring(v.traversal, v.render),
    createEnvWiring(v.sim, v.render, deps.weather),
    createGroundLoadingIndicator(doc, v.traversal),
    trainLcdSystem(doc, v.traversal, () => v.late.rail),
    helpHudSystem(doc, v.traversal),
  ];
}

export async function createWorldView(deps: WorldViewDeps): Promise<WorldView> {
  const { canvas, bus, log } = deps;
  const render = await createRender({ canvas, bus, log, config: { ...deps.renderConfig, backend: deps.backend } });
  const late = initialLate();
  const precompiled = startPrecompile(render, late, log);
  const input = createInput({ target: canvas, bus, log });
  const ground: GroundQuery = { groundHeightAt: (x, z) => late.streaming?.groundHeightAt(x, z) };
  const sim = simFor(deps);
  const traversal = createTraversalFor(deps, input, ground, late, sim);
  const frameSource = frameSourceOf(traversal, sim);
  const wiringSystems = wiringSystemsFor(deps, { render, traversal, sim, late });

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
    get audio() {
      return late.audio;
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
    get cars() {
      return late.cars;
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
    get crowdSettled() {
      return late.crowdSettled && (sim.workerStats()?.crowd?.filled ?? true);
    },
    get trainsSettled() {
      return late.trainsSettled;
    },
    showWorld: (world) => showWorldWith(deps, { render, traversal, ground, late, precompiled, sim, input }, world),
    bootProgress: () => bootProgressText(late.boot, late.streaming),
  };
}
