// `?probe=physics` 디버그 프로브(렌더 없이, M04-T01 수락): 물리 워커(Jolt)를 띄워 바닥 + 떨어지는 상자 → 3 s 동안 60 Hz로 스텝 →
// 보간 포즈·스냅샷 통계를 `globalThis.__SANPO_PHYSICS_PROBE__`에. `&physicsIsolation=degraded`면 격리돼도 postMessage 폴백. e2e physics.spec.ts가 읽는다.
import { createEventBus, createLogger, createWorkerSupervisor, type FrameContext } from '@sanpo/core';
import { createPhysics, type JoltBuild, type PhysicsIsolation } from '@sanpo/physics';

export interface PhysicsProbeReport {
  isolation: PhysicsIsolation;
  crossOriginIsolated: boolean;
  build: JoltBuild | null;
  initMs: number;
  /** 프레임마다 보간 포즈 y(떨어지는 상자 중심). */
  ys: number[];
  finalY: number;
  finalVy: number;
  steps: number;
  simTimeS: number;
  /** 워커 틱(스텝 묶음) 평균(ms). */
  tickMs: number;
  /** 프로브 동안 관측된 50 ms 이상 메인 스레드 작업(ms). */
  longTasks: number[];
}

const DURATION_MS = 3000;

function observeLongTasks(): { stop(): number[] } {
  const out: number[] = [];
  let obs: PerformanceObserver | undefined;
  try {
    obs = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) out.push(e.duration);
    });
    obs.observe({ type: 'longtask', buffered: false });
  } catch {
    obs = undefined;
  }
  return {
    stop() {
      obs?.disconnect();
      return out;
    },
  };
}

export async function runPhysicsProbe(isolation: 'auto' | 'degraded'): Promise<PhysicsProbeReport> {
  const log = createLogger({ level: 'info' });
  const supervisor = createWorkerSupervisor({ log });
  const origin = { x: -22, y: 15, z: 8 };
  const phys = createPhysics({ bus: createEventBus(log), log, supervisor, originWF: origin, config: { isolation } });
  await phys.ready;
  phys.debugSpawnBox({ x: origin.x, y: origin.y - 0.5, z: origin.z }, { x: 10, y: 0.5, z: 10 }, false);
  const box = phys.debugSpawnBox({ x: origin.x, y: origin.y + 10, z: origin.z }, { x: 0.5, y: 0.5, z: 0.5 }, true);
  const sys = phys.systems()[0];
  const lt = observeLongTasks();
  const ys: number[] = [];
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = (): void => {
      sys?.update({} as FrameContext);
      const p = phys.pose(box);
      if (p) ys.push(p.posWF.y - origin.y);
      if (performance.now() - t0 < DURATION_MS) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const p = phys.pose(box);
  const s = phys.stats();
  const report: PhysicsProbeReport = {
    isolation: phys.isolation,
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    build: s.build,
    initMs: s.initMs,
    ys,
    finalY: (p?.posWF.y ?? Number.NaN) - origin.y,
    finalVy: p?.linVel.y ?? Number.NaN,
    steps: s.steps,
    simTimeS: s.simTimeS,
    tickMs: s.tickMs,
    longTasks: lt.stop(),
  };
  phys.dispose();
  supervisor.dispose();
  return report;
}
