// 부트 7–9단계 조립: render + input + traversal(freecam) + 카메라 배선, 월드 로드 후 streaming(디코드 워커) + streaming→render 배선.
// 지면 질의는 streaming 높이장(월드 로드 전 = 미적재). see docs/modules/game.md §부트 시퀀스, docs/06-world-streaming.md §8
import {
  createWorkerSupervisor,
  type EventBus,
  type FrameSource,
  type GroundQuery,
  type Logger,
  type Scheduler,
  type SystemProvider,
  type Vec3d,
} from '@sanpo/core';
import { createInput, type InputService } from '@sanpo/input';
import { createRender, type RenderService } from '@sanpo/render';
import { createStreaming, type StreamingService } from '@sanpo/streaming';
import { createTraversal, type FreecamParams, type TraversalService } from '@sanpo/traversal';
import { startFreecamPose } from './start-view.ts';
import { createCameraWiring } from './wiring/camera.ts';
import { createStreamingRenderWiring, type StreamingRenderWiring } from './wiring/streaming-render.ts';
import type { LoadedWorld } from './world-load.ts';

/** 부팅 대기 영역: 스폰 수평 384 m 안 L0 — 스폰 셀 안 어디서든 3×3 모서리 셀(≤ 362 m)까지 포함(06 §8 스폰 3×3). 상위 레벨은 우선순위상 먼저 온다. */
export const SPAWN_READY_RADIUS_M = 384;

export interface WorldView {
  readonly render: RenderService;
  readonly input: InputService;
  readonly traversal: TraversalService;
  readonly ground: GroundQuery;
  readonly providers: readonly SystemProvider[];
  readonly frameSource: FrameSource;
  /** showWorld 뒤에만 있다. */
  readonly streaming: StreamingService | undefined;
  readonly wiring: StreamingRenderWiring | undefined;
  /** streaming 시작 → 스폰 영역 live까지 대기 → 시작 시점으로 이동. 반환 = 스폰 영역 live L0 셀 수. */
  showWorld(world: LoadedWorld): Promise<number>;
}

export interface WorldViewDeps {
  canvas: HTMLCanvasElement;
  bus: EventBus;
  log: Logger;
  scheduler: Pick<Scheduler, 'add'>;
  backend: 'auto' | 'webgl';
  now?: () => number;
  /** 시작 시점 재정의(골든뷰 북마크 `?view=`): 부팅 대기 중심과 지면 확인 뒤 포즈. 없으면 스폰·startFreecamPose. */
  start?: { centerWF: Vec3d; pose: (ground: GroundQuery) => FreecamParams; fovDeg?: number };
}

export async function createWorldView(deps: WorldViewDeps): Promise<WorldView> {
  const { canvas, bus, log } = deps;
  const render = await createRender({ canvas, bus, log, config: { backend: deps.backend } });
  const input = createInput({ target: canvas, bus, log });
  let streaming: StreamingService | undefined;
  let wiring: StreamingRenderWiring | undefined;
  const ground: GroundQuery = { groundHeightAt: (x, z) => streaming?.groundHeightAt(x, z) };
  const startPose = deps.start?.pose ?? startFreecamPose;
  const fov = deps.start?.fovDeg;
  const traversal = createTraversal(
    { input, bus, log, ground },
    { initial: { mode: 'freecam', params: startPose(ground) }, ...(fov ? { settings: { fovDeg: fov } } : {}) },
  );
  const now = deps.now ?? Date.now;
  const frameSource: FrameSource = {
    camera: () => traversal.camera,
    player: () => traversal.player,
    gameTimeMs: now,
    timeScale: () => 1,
  };
  const cameraWiring = createCameraWiring(traversal, render);

  return {
    render,
    input,
    traversal,
    ground,
    frameSource,
    providers: [input, traversal, { systems: () => [cameraWiring] }, render],
    get streaming() {
      return streaming;
    },
    get wiring() {
      return wiring;
    },
    async showWorld(world) {
      const wlog = log.child('world');
      await render.precompile().catch((e: unknown) => wlog.warn('precompile', e));
      const s = createStreaming({
        bus,
        log,
        world: { baseUrl: world.baseUrl, buildId: world.buildId, cellsIndex: world.cellsIndex },
        supervisor: createWorkerSupervisor({ log }),
        initialMode: 'freecam',
      });
      streaming = s;
      wiring = createStreamingRenderWiring({ streaming: s, render, traversal, log: wlog });
      // 스케줄러 init은 이미 지났다 → streaming init(옛 buildId 캐시 삭제)은 직접.
      for (const sys of s.systems()) await sys.init?.();
      deps.scheduler.add(s);
      deps.scheduler.add({ systems: () => wiring?.systems ?? [] });
      const centerWF = deps.start?.centerWF ?? world.spawnWF;
      await s.whenReady({ centerWF, radius: SPAWN_READY_RADIUS_M, levels: [0] });
      // 지면 높이를 알게 됐으니 "지면 위 60 m"를 정확히 다시 잡는다.
      traversal.request('freecam', startPose(ground));
      return world.spawnCells.filter((k) => s.stateOf(k) === 'live').length;
    },
  };
}
