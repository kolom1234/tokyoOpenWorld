// 부트 시퀀스: 기능 감지 → core 서비스 → 렌더·입력·freecam 조립 → 루프 → 월드 로드 → streaming 시작·스폰 영역 대기. see docs/modules/game.md §부트 시퀀스
import {
  type CameraState,
  createEventBus,
  createLogger,
  createScheduler,
  type DeepPartial,
  type EventBus,
  type FrameSource,
  type Logger,
  type PlayerState,
  type Scheduler,
} from '@sanpo/core';
import type { PostEffects, QualityTier, RenderConfig } from '@sanpo/render';
import type { ClockMode } from '@sanpo/sim';
import { detectCaps } from './caps.ts';
import { createGoldenWatch, type GoldenView, loadGoldenView, viewCenterWF, viewPose } from './debug/bookmarks.ts';
import { createDebugOverlay } from './debug/overlay.ts';
import { parsePostFlag, parseQualityFlag } from './debug/post-flags.ts';
import { createStatsHook } from './debug/stats.ts';
import { createSunOverride, parseSunFlag } from './debug/sun-override.ts';
import { mountWetSlider, parseWetFlag, type WeatherOverride } from './debug/wet-override.ts';
import { createLoop, type Loop } from './loop.ts';
import type { StatusView } from './status-view.ts';
import { loadTier, type QualityWiring, startQualityWiring } from './wiring/quality.ts';
import {
  type LoadedWorld,
  loadWorld,
  WORLD_LOCAL_BASE_URL,
  WORLD_MINI_BASE_URL,
  type WorldSource,
} from './world-load.ts';
import { fetchWorldStatus, type WorldStatus } from './world-status.ts';
import { createWorldView, type WorldView } from './world-view.ts';

/** URL 쿼리 디버그 플래그(docs/15-conventions.md §8). 이후 tier/spawn 추가. */
export interface BootFlags {
  debug: boolean;
  /**
   * `?world=mini` → 저장소 픽스처 world-mini(/fixtures/world-mini)를 API 대신 사용(dev·PR preview·staging·CI e2e).
   * `?world=local` → 로컬 파이프라인 빌드(data/build/<SANPO_LOCAL_BUILD>, vite dev 전용 /local-world).
   */
  world?: 'mini' | 'local';
  /** `?backend=webgl` → WebGPU가 있어도 WebGL2 백엔드 강제(폴백 경로 확인). */
  backend?: 'webgl';
  /** `?probe=decode|physics` → 부트 대신 디코드 워커(debug/decode-probe.ts) 또는 물리 워커(debug/physics-probe.ts) 프로브(e2e). */
  probe?: 'decode' | 'physics';
  /** `?physicsIsolation=degraded` → 격리돼도 물리 스냅샷을 postMessage로(폴백 경로 확인). */
  physicsIsolation?: 'degraded';
  /** `?view=<id>` → 골든뷰 북마크(tests/golden/views.json, debug/bookmarks.ts). */
  view?: string;
  /** `?exposure=<n>` → 톤매핑 노출 고정값(자동 노출 M03-T07 전 조정·비교용). */
  exposure?: number;
  /** `?sun=<방위>,<고도>` → 태양 방향 고정(debug/sun-override.ts). */
  sun?: { azDeg: number; elDeg: number };
  /** `?gpuTiming=1` → GPU 타이머(render stats().gpu, 골든 metrics). */
  gpuTiming?: boolean;
  /** `?time=<ISO 8601>` → 시계를 그 시각에 고정(frozen). 골든뷰는 북마크의 time. */
  timeMs?: number;
  /** `?shadows=0` → 태양 그림자 끔(A/B 성능 비교). */
  noShadows?: boolean;
  /** `?facade=flat` → 파사드 단색(셰이더 비용 A/B). */
  flatFacade?: boolean;
  /** `?wet=<0..1>` → 노면 젖음 고정 + 슬라이더(debug/wet-override.ts). */
  wet?: number;
  /** `?quality=` → 품질 티어(07 §9, debug/post-flags.ts). */
  quality?: QualityTier;
  /** `?post=` → 후처리 효과 덮어쓰기(A/B). */
  post?: Partial<PostEffects>;
  /** `?dynres=0` → 동적 해상도 끔. */
  noDynres?: boolean;
  /** `?gpuLoad=<n>` → 디버그 GPU 부하(동적 해상도 확인). */
  gpuLoad?: number;
  /** `?forcePost=1` → 소프트웨어 래스터에서도 후처리 체인(e2e flicker.spec.ts). */
  forcePost?: boolean;
  /** `?mode=freecam` → 첫 표시를 freecam 시작 시점으로(기본 = walk, 09 §1). 렌더 e2e·비교용. */
  mode?: 'freecam';
}

const VIEW_ID = /^[a-z0-9-]{1,64}$/;

/** 시계: `?time=` > 골든뷰 time > 기본(world-view). 둘 다 frozen(결정론). */
function clockOf(flags: BootFlags, golden: GoldenView | undefined): { clock?: ClockMode } {
  const ms = flags.timeMs ?? (golden ? Date.parse(golden.time) : undefined);
  return ms === undefined ? {} : { clock: { kind: 'frozen', atMs: ms } };
}

function sunFlag(v: string | null): Pick<BootFlags, 'sun'> {
  const sun = parseSunFlag(v);
  return sun ? { sun } : {};
}

export function parseFlags(search: string): BootFlags {
  const q = new URLSearchParams(search);
  return {
    debug: q.get('debug') === '1',
    ...(q.get('world') === 'mini' || q.get('world') === 'local' ? { world: q.get('world') as 'mini' | 'local' } : {}),
    ...(q.get('backend') === 'webgl' ? { backend: 'webgl' as const } : {}),
    ...(q.get('probe') === 'decode' || q.get('probe') === 'physics'
      ? { probe: q.get('probe') as 'decode' | 'physics' }
      : {}),
    ...(q.get('physicsIsolation') === 'degraded' ? { physicsIsolation: 'degraded' as const } : {}),
    ...(VIEW_ID.test(q.get('view') ?? '') ? { view: q.get('view') as string } : {}),
    ...(Number(q.get('exposure')) > 0 ? { exposure: Number(q.get('exposure')) } : {}),
    ...sunFlag(q.get('sun')),
    ...(q.get('gpuTiming') === '1' ? { gpuTiming: true } : {}),
    ...(Number.isFinite(Date.parse(q.get('time') ?? '')) ? { timeMs: Date.parse(q.get('time') ?? '') } : {}),
    ...(q.get('shadows') === '0' ? { noShadows: true } : {}),
    ...(q.get('facade') === 'flat' ? { flatFacade: true } : {}),
    ...(parseWetFlag(q.get('wet')) !== undefined ? { wet: parseWetFlag(q.get('wet')) as number } : {}),
    ...(parseQualityFlag(q.get('quality')) ? { quality: parseQualityFlag(q.get('quality')) as QualityTier } : {}),
    ...(q.get('post') ? { post: parsePostFlag(q.get('post')) } : {}),
    ...(q.get('dynres') === '0' ? { noDynres: true } : {}),
    ...(Number(q.get('gpuLoad')) > 0 ? { gpuLoad: Math.min(Math.floor(Number(q.get('gpuLoad'))), 4096) } : {}),
    ...(q.get('forcePost') === '1' ? { forcePost: true } : {}),
    ...(q.get('mode') === 'freecam' ? { mode: 'freecam' as const } : {}),
  };
}

/** 골든뷰 비(`weather: 'rain'`)의 노면 젖음 — sim 날씨(M06) 전까지 고정값. */
const GOLDEN_RAIN_WETNESS = 0.85;

/** 날씨 덮어쓰기: `?wet=` > 골든뷰 비 > 없음(sim 값). */
function weatherOf(flags: BootFlags, golden: GoldenView | undefined): WeatherOverride | undefined {
  if (flags.wet !== undefined) return { wetness: flags.wet };
  return golden?.weather === 'rain' ? { wetness: GOLDEN_RAIN_WETNESS } : undefined;
}

/** 월드 출처 결정(API 또는 픽스처) → 데이터 로드. 각 단계 상태를 onStatus로 알리고, 성공하면 로드 결과를 돌려준다. */
export async function startWorld(
  flags: BootFlags,
  onStatus: (w: WorldStatus) => void,
  fetchFn: (u: string) => Promise<Response> = (u) => fetch(u),
): Promise<LoadedWorld | undefined> {
  let target: { baseUrl: string; source: WorldSource };
  if (flags.world === 'mini') target = { baseUrl: WORLD_MINI_BASE_URL, source: 'fixture' };
  else if (flags.world === 'local') target = { baseUrl: WORLD_LOCAL_BASE_URL, source: 'local' };
  else {
    const status = await fetchWorldStatus(fetchFn);
    onStatus(status);
    if (status.kind !== 'ready') return undefined;
    target = { baseUrl: status.baseUrl, source: 'api' };
  }
  const r = await loadWorld(target.baseUrl, target.source, fetchFn);
  onStatus(
    r.ok
      ? {
          kind: 'loaded',
          source: r.value.source,
          buildId: r.value.buildId,
          cells: r.value.spawnCells.length,
          indexed: r.value.indexed,
        }
      : { kind: 'error', detail: r.error },
  );
  return r.ok ? r.value : undefined;
}

/** 원점 정지 상태의 임시 FrameSource. traversal/sim 연결(M04–M06) 시 교체된다. */
export function createIdleFrameSource(now: () => number = Date.now): FrameSource {
  const camera: CameraState = { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 60, near: 0.1 };
  const player: PlayerState = { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0, mode: 'idle' };
  return { camera: () => camera, player: () => player, gameTimeMs: now, timeScale: () => 1 };
}

export interface BootResult {
  loop: Loop;
  /** 렌더 초기화 실패 시 undefined(상태 화면에 오류 표시, 루프는 계속). */
  world: WorldView | undefined;
}

/** 전체 화면 캔버스(상태 화면 뒤). */
function mountCanvas(doc: Document): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  canvas.id = 'view';
  doc.body.prepend(canvas);
  return canvas;
}

/** render 설정: 플래그 + 품질(`?quality=` > 저장값 > 기본) + 골든뷰 결정론(동적 해상도 끔). */
function renderConfigOf(flags: BootFlags, golden: GoldenView | undefined): DeepPartial<RenderConfig> {
  const quality = flags.quality ?? (golden ? undefined : loadTier(storageOf()));
  return {
    ...(flags.exposure ? { exposure: flags.exposure } : {}),
    ...(flags.gpuTiming ? { gpuTiming: true } : {}),
    ...(flags.noShadows ? { shadows: false } : {}),
    ...(flags.flatFacade ? { facade: 'flat' as const } : {}),
    ...(quality ? { quality } : {}),
    ...(flags.post ? { post: flags.post } : {}),
    ...(flags.noDynres || golden ? { dynamicResolution: false } : {}),
    ...(flags.gpuLoad ? { debugGpuLoad: flags.gpuLoad } : {}),
    ...(flags.forcePost ? { debugForcePost: true } : {}),
  };
}

function storageOf(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** 월드 로드 뒤 정해지는 안정 조건(디버그 오버레이 `data-settled`). */
interface LateReady {
  quality?: QualityWiring;
}

async function setupWorldView(
  flags: BootFlags,
  scheduler: Scheduler,
  log: Logger,
  view: StatusView,
  golden: GoldenView | undefined,
  bus: EventBus,
  late: LateReady,
): Promise<WorldView | undefined> {
  try {
    const weather = weatherOf(flags, golden);
    const world = await createWorldView({
      canvas: mountCanvas(document),
      bus,
      log,
      scheduler,
      backend: flags.backend === 'webgl' ? 'webgl' : 'auto',
      renderConfig: renderConfigOf(flags, golden),
      ...clockOf(flags, golden),
      ...(weather ? { weather } : {}),
      ...(flags.mode ? { startMode: flags.mode } : {}),
      ...(golden
        ? { start: { centerWF: viewCenterWF(golden), pose: (g) => viewPose(golden, g), fovDeg: golden.fovDeg } }
        : {}),
    });
    for (const p of world.providers) scheduler.add(p);
    if (flags.sun)
      scheduler.add({
        systems: () => [createSunOverride(world.render, flags.sun as NonNullable<BootFlags['sun']>, weather)],
      });
    if (weather && !golden) mountWetSlider(document, weather);
    scheduler.setFrameSource(world.frameSource);
    document.body.classList.add('rendering');
    view.setRenderer(world.render.backend, world.render.depth);
    if (flags.debug) {
      const overlay = createDebugOverlay({
        parent: document.body,
        render: world.render,
        traversal: world.traversal,
        ground: world.ground,
        log,
        // streaming은 월드 로드 뒤에 생긴다 → getter로 넘긴다(스프레드하면 undefined로 고정).
        get streaming() {
          return world.streaming;
        },
        settledExtra: () => world.materialsSettled && world.avatarSettled && late.quality?.settled === true,
      });
      scheduler.add(overlay.system);
      // e2e·콘솔 조작용 핸들(디버그 모드에서만 노출).
      Object.assign(globalThis, { __SANPO_DEBUG__: { world, rebaseTest: overlay.rebaseTest } });
    }
    return world;
  } catch (e) {
    view.showError(`렌더러 초기화 실패: ${e instanceof Error ? e.message : String(e)}`);
    log.child('boot').error('render init', e);
    return undefined;
  }
}

/** 골든뷰: 안정 판정 시스템 등록 + 캡처 스크립트용 핸들(`__SANPO_GOLDEN__`). */
function addGoldenWatch(scheduler: Scheduler, world: WorldView, golden: GoldenView): { start(): void } {
  const root = document.getElementById('app') ?? document.body;
  const watch = createGoldenWatch({
    root,
    streaming: () => world.streaming?.stats(),
    render: () => world.render.stats(),
    extra: () => world.materialsSettled,
  });
  scheduler.add({ systems: () => [watch.system] });
  Object.assign(globalThis, { __SANPO_GOLDEN__: { view: golden, render: () => world.render.stats() } });
  return watch;
}

export async function boot(view: StatusView, flags: BootFlags = parseFlags(location.search)): Promise<BootResult> {
  const log = createLogger({ level: flags.debug ? 'debug' : 'info' });
  const caps = await detectCaps();
  view.setCaps(caps);
  log.child('boot').info('caps', caps);

  const scheduler = createScheduler({ log, clock: () => performance.now() });
  scheduler.setFrameSource(createIdleFrameSource());
  const golden = flags.view === undefined ? undefined : await loadGoldenView(flags.view);
  if (flags.view !== undefined && golden === undefined) view.showError(`골든뷰 없음: ${flags.view}`);
  const bus = createEventBus(log);
  const late: LateReady = {};
  const world = await setupWorldView(flags, scheduler, log, view, golden, bus, late);
  const watch = golden && world ? addGoldenWatch(scheduler, world, golden) : undefined;
  await scheduler.init();

  const loop = createLoop({ scheduler });
  if (flags.debug) loop.addHook(await createStatsHook(document.body));
  loop.start();

  // 월드 조회·로드는 루프를 막지 않는다. 실패는 상태 화면에만 표시.
  void startWorld(flags, (w) => {
    view.setWorld(w);
    log.child('boot').info('world', w);
  }).then(async (loaded) => {
    if (loaded === undefined || world === undefined) return;
    const shown = await world.showWorld(loaded);
    view.setRendered(shown);
    watch?.start();
    late.quality = startQualityWiring({
      render: world.render,
      bus,
      log: log.child('quality'),
      storage: storageOf(),
      fixed: flags.quality !== undefined || golden !== undefined,
      streamingIdle: () => {
        const st = world.streaming?.stats();
        return st !== undefined && st.queued + st.fetching + st.decoding + st.pendingReady === 0;
      },
    });
  });
  return { loop, world };
}
