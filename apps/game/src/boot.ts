// 부트 시퀀스(M00 골격): 기능 감지 → core 서비스 → 빈 스케줄러 루프 → 월드 상태 조회. see docs/modules/game.md §부트 시퀀스
import { type CameraState, createLogger, createScheduler, type FrameSource, type PlayerState } from '@sanpo/core';
import { detectCaps } from './caps.ts';
import { createStatsHook } from './debug/stats.ts';
import { createLoop, type Loop } from './loop.ts';
import type { StatusView } from './status-view.ts';
import { fetchWorldStatus } from './world-status.ts';

/** URL 쿼리 디버그 플래그(docs/15-conventions.md §8). 이후 backend/tier/spawn 추가. */
export interface BootFlags {
  debug: boolean;
}

export function parseFlags(search: string): BootFlags {
  return { debug: new URLSearchParams(search).get('debug') === '1' };
}

/** 원점 정지 상태의 임시 FrameSource. traversal/sim 연결(M04–M06) 시 교체된다. */
export function createIdleFrameSource(now: () => number = Date.now): FrameSource {
  const camera: CameraState = { posWF: { x: 0, y: 0, z: 0 }, quat: { x: 0, y: 0, z: 0, w: 1 }, fovDeg: 60, near: 0.1 };
  const player: PlayerState = { posWF: { x: 0, y: 0, z: 0 }, velWF: { x: 0, y: 0, z: 0 }, yawRad: 0, mode: 'idle' };
  return { camera: () => camera, player: () => player, gameTimeMs: now, timeScale: () => 1 };
}

export interface BootResult {
  loop: Loop;
}

export async function boot(view: StatusView, flags: BootFlags = parseFlags(location.search)): Promise<BootResult> {
  const log = createLogger({ level: flags.debug ? 'debug' : 'info' });
  const caps = await detectCaps();
  view.setCaps(caps);
  log.child('boot').info('caps', caps);

  const scheduler = createScheduler({ log, clock: () => performance.now() });
  scheduler.setFrameSource(createIdleFrameSource());
  await scheduler.init();

  const loop = createLoop({ scheduler });
  if (flags.debug) loop.addHook(await createStatsHook(document.body));
  loop.start();

  // 월드 조회는 루프를 막지 않는다. 실패는 상태 화면에만 표시(M00에는 월드 로드 없음).
  void fetchWorldStatus().then((world) => {
    view.setWorld(world);
    log.child('boot').info('world', world);
  });
  return { loop };
}
