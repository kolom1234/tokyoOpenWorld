// 메인 ↔ sim.worker 연결(M06-T03): 시작 전 셀 nav는 보관, 플레이어 상태는 30 Hz로, 시계는 배속·점프가 바뀌거나 예측과 50 ms 넘게 어긋날 때 동기.
import type {
  CameraState,
  CellKey,
  PlayerState,
  SharedInstanceBuffer,
  Vec3,
  Vec3d,
  WorkerSupervisor,
} from '@sanpo/core';
import type { CrowdParams, SimDeps, SimWorkerStats, WorldClock } from '../../api.ts';
import type { ClockSync } from './crowd-runtime.ts';
import { type SimWorkerHost, startSimWorker } from './host.ts';

const PLAYER_INTERVAL_MS = 1000 / 30;
const CLOCK_DRIFT_MS = 50;

export interface WorkerLink {
  start(o: {
    supervisor: WorkerSupervisor;
    crowd: CrowdParams;
    centerWF: Vec3d;
    mode?: 'dummy' | 'agents';
  }): SharedInstanceBuffer | undefined;
  addCell(key: CellKey, nav?: ArrayBuffer): void;
  removeCell(key: CellKey): void;
  scenario(c: Vec3d, r: number, n: number): void;
  /** 매 프레임(sim 시계 시스템): 플레이어·카메라 전방(스폰 시야 판정)·시계·밀도 배율 동기. */
  frame(player: Readonly<PlayerState>, camera: Readonly<CameraState>, densityScale: number): void;
  stats(): SimWorkerStats | undefined;
}

const absNow = (): number => performance.timeOrigin + performance.now();

/** 쿼터니언으로 돌린 카메라 전방(로컬 −Z). */
export function forwardOf(q: Readonly<{ x: number; y: number; z: number; w: number }>): Vec3 {
  return {
    x: -2 * (q.x * q.z + q.w * q.y),
    y: -2 * (q.y * q.z - q.w * q.x),
    z: -(1 - 2 * (q.x * q.x + q.y * q.y)),
  };
}

export function createWorkerLink(clock: WorldClock, deps: SimDeps): WorkerLink {
  let worker: SimWorkerHost | undefined;
  const early = new Map<CellKey, ArrayBuffer>();
  let lastPlayer = Number.NEGATIVE_INFINITY;
  let lastDensity = 1;
  let synced: ClockSync | undefined;
  const sync = (): ClockSync => ({ gameMs: clock.gameTimeMs, atAbs: absNow(), scale: clock.timeScale });
  return {
    start(o) {
      if (worker) return worker.pedestrians;
      synced = sync();
      worker = startSimWorker({
        supervisor: o.supervisor,
        params: o.crowd,
        centerWF: o.centerWF,
        mode: o.mode ?? 'agents',
        ...(deps.signalPlans ? { plans: deps.signalPlans } : {}),
        clock: synced,
        log: deps.log.child('sim'),
      });
      if (worker) for (const [k, b] of early) worker.addCell(k, b);
      early.clear();
      return worker?.pedestrians;
    },
    addCell(key, nav) {
      if (!nav) return;
      if (worker) worker.addCell(key, nav);
      else early.set(key, nav);
    },
    removeCell(key) {
      early.delete(key);
      worker?.removeCell(key);
    },
    scenario: (c, r, n) => worker?.scenario(c, r, n),
    frame(player, camera, densityScale) {
      if (!worker) return;
      const now = absNow();
      if (now - lastPlayer >= PLAYER_INTERVAL_MS) {
        lastPlayer = now;
        worker.setPlayer(player.posWF, player.velWF, forwardOf(camera.quat));
      }
      if (densityScale !== lastDensity) {
        lastDensity = densityScale;
        worker.setDensityScale(densityScale);
      }
      const s = synced;
      const predicted = s ? s.gameMs + (now - s.atAbs) * s.scale : Number.NaN;
      if (!s || s.scale !== clock.timeScale || !(Math.abs(predicted - clock.gameTimeMs) <= CLOCK_DRIFT_MS)) {
        synced = sync();
        worker.setClock(synced);
      }
    },
    stats: () => worker?.stats(),
  };
}
