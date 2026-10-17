// 월드 표시 직후 붙는 부가 배선(world-view.ts 400줄 제한으로 분리): 오디오(M09-T04) + 역 시설·동선(M07-T06) + freecam G 카메라 아래 내리기(ADR-0083).
import type { AudioService } from '@sanpo/audio';
import type { GameSystem, GroundQuery, Logger, Scheduler } from '@sanpo/core';
import type { InputService } from '@sanpo/input';
import type { PhysicsService } from '@sanpo/physics';
import type { RenderService } from '@sanpo/render';
import type { SimService } from '@sanpo/sim';
import type { StreamingService } from '@sanpo/streaming';
import type { TraversalService } from '@sanpo/traversal';
import ACCESS from '../../../content/stations/access.json';
import { evaluateSpot, findLanding, type LandingQueries, roadIndex } from './landing.ts';
import type { SpawnPreset } from './spawn-presets.ts';
import type { AccessFile } from './station/layout.ts';
import { type PlatformTops, safeArrival } from './station/platform-geo.ts';
import { stationSystem } from './station/wiring.ts';
import { createVehicleWiring } from './vehicles/wiring.ts';
import type { StreamingRenderWiring } from './wiring/streaming-render.ts';
import { type AudioFlags, audioForWorld } from './world-audio.ts';
import type { LateState } from './world-late.ts';

function landingQueries(
  ph: PhysicsService,
  g: ReturnType<ReturnType<typeof stationSystem>['geometry']>,
  onRoad: (x: number, z: number) => Promise<boolean>,
): LandingQueries {
  return {
    ray: (o, d, m) => ph.raycast(o, d, m),
    sphere: (o, d, r, m) => ph.sphereCast(o, d, r, m),
    tops: g.tops,
    pits: g.pits,
    onRoad,
  };
}

/**
 * 프리셋 착지 보정(ADR-0084): walk 착지 1 s 뒤 한 번 — platform = 철도(승강장 윗면) 적재 뒤 프리셋 xz 둘레 안전 자리,
 * exact = 그 자리 아래 물리 레이(위 3 m → 8 m) 첫 면(차양·처마 아래 바닥 — 하늘 레이 착지는 지붕 아래를 피해 옆으로 비킨다). 레이가 빗나가면 0.5 s 뒤 다시(10 s까지).
 */
function presetSpawnSystem(
  p: SpawnPreset,
  v: { traversal: TraversalService },
  geometry: () => { tops: PlatformTops | undefined },
  physics: () => PhysicsService | undefined,
): GameSystem {
  let readyAt = -1;
  let t = 0;
  let next = 1;
  let busy = false;
  let done = false;
  const yaw = (p.yawDeg * Math.PI) / 180;
  const [x, y, z] = p.posWF;
  const exact = async (ph: PhysicsService): Promise<boolean> => {
    const hit = await ph.raycast({ x, y: y + 3, z }, { x: 0, y: -1, z: 0 }, 8);
    if (!hit || Math.abs(hit.posWF.y - y) > 1.5) return false;
    void v.traversal.teleport({ x, y: hit.posWF.y + 0.02, z }, yaw);
    return true;
  };
  return {
    id: 'wiring.presetSpawn',
    phase: 59,
    update(f) {
      t += f.dtReal;
      if (done || busy || v.traversal.mode !== 'walk') return;
      if (readyAt < 0) readyAt = t;
      if (t - readyAt < next) return;
      if (p.surface === 'platform') {
        const tops = geometry().tops;
        if (!tops) return;
        done = true;
        const dest = safeArrival(tops, { x, z });
        if (dest) void v.traversal.teleport(dest, yaw);
        return;
      }
      const ph = physics();
      if (!ph) return;
      busy = true;
      void exact(ph).then((ok) => {
        busy = false;
        done = ok || t - readyAt > 10;
        next = t - readyAt + 0.5;
      });
    },
    dispose() {},
  };
}

export function startWorldExtras(
  deps: {
    canvas: HTMLCanvasElement;
    log: Logger;
    audio?: AudioFlags;
    scheduler: Pick<Scheduler, 'add'>;
    debug?: boolean;
    spawn?: SpawnPreset;
  },
  v: {
    render: RenderService;
    input: InputService;
    traversal: TraversalService;
    ground: GroundQuery;
    sim: SimService;
    streaming: StreamingService;
    cells: Pick<StreamingRenderWiring, 'onCell'>;
  },
  baseUrl: string,
  late: LateState,
): AudioService | undefined {
  const audio = audioForWorld(deps, v, baseUrl, () => late.physics);
  const stations = stationSystem({
    doc: deps.canvas.ownerDocument,
    access: ACCESS as unknown as AccessFile,
    render: v.render,
    input: v.input,
    traversal: v.traversal,
    sim: v.sim,
    physics: () => late.physics,
    audio: () => late.audio,
    rail: () => late.rail?.network,
    ...(deps.debug ? { debug: true } : {}),
  });
  deps.scheduler.add({ systems: () => [stations] });
  // 플레이어 차(M08-T01): 세워 둔 차·차 부르기·계기판.
  const cars = createVehicleWiring({
    doc: deps.canvas.ownerDocument,
    render: v.render,
    input: v.input,
    traversal: v.traversal,
    sim: v.sim,
    physics: () => late.physics,
    requestLanes: (key) => v.streaming.requestSections(key, ['lanes.bin']).then((p) => p.lanes),
    ...(deps.spawn ? { spawn: deps.spawn } : {}),
  });
  late.cars = cars.cars;
  deps.scheduler.add({ systems: () => cars.systems });
  if (deps.spawn?.surface) {
    const ps = presetSpawnSystem(
      deps.spawn,
      v,
      () => stations.geometry(),
      () => late.physics,
    );
    deps.scheduler.add({ systems: () => [ps] });
  }
  // freecam G(ADR-0083): 물리 레이·구 캐스트 + 역 격자(승강장·선로) + 셀 차선(lanes.bin 지연 적재).
  const onRoad = roadIndex((key) => v.streaming.requestSections(key, ['lanes.bin']).then((p) => p.lanes));
  late.landing = (cam) => {
    const ph = late.physics;
    if (!ph) return Promise.resolve({ ok: false, reason: 'not-ready' });
    const g = stations.geometry();
    return findLanding(landingQueries(ph, g, onRoad), cam);
  };
  if (deps.debug)
    Object.assign(globalThis, {
      __SANPO_LANDING__: {
        evaluate: (x: number, z: number, y: number) =>
          late.physics ? evaluateSpot(landingQueries(late.physics, stations.geometry(), onRoad), x, z, y) : undefined,
        onRoad,
      },
    });
  return audio;
}
