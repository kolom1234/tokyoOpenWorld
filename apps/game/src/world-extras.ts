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

/** 승강장 스폰(ADR-0084): walk 착지 + 철도(승강장 윗면) 적재 1 s 뒤 한 번 — 프리셋 xz 둘레 안전 자리로. */
function platformSpawnSystem(
  p: SpawnPreset,
  v: { traversal: TraversalService },
  geometry: () => { tops: PlatformTops | undefined },
): GameSystem {
  let readyAt = -1;
  let t = 0;
  let done = false;
  return {
    id: 'wiring.platformSpawn',
    phase: 59,
    update(f) {
      t += f.dtReal;
      const tops = geometry().tops;
      if (done || v.traversal.mode !== 'walk' || !tops) return;
      if (readyAt < 0) readyAt = t;
      if (t - readyAt < 1) return;
      done = true;
      const dest = safeArrival(tops, { x: p.posWF[0], z: p.posWF[2] });
      if (dest) void v.traversal.teleport(dest, (p.yawDeg * Math.PI) / 180);
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
  if (deps.spawn?.surface === 'platform') {
    const ps = platformSpawnSystem(deps.spawn, v, () => stations.geometry());
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
