// sim.worker 호스트(10 §1, M06-T01): 감독자로 워커를 띄우고 SAB 인스턴스 버퍼를 넘긴다. 재시작되면 같은 SAB·파라미터로 다시 init.
// SAB가 없으면(교차 출처 격리 아님) 군중 없이 undefined — postMessage 복사 경로는 필요해지면(M08 설정) 추가.
import type { Logger, Vec3d, WorkerSupervisor } from '@sanpo/core';
import type { CrowdParams } from '../crowd/dummy.ts';
import { allocInstanceSab, type InstanceReader, instanceReader } from './instance-buffer.ts';

export interface SimWorkerHost {
  readonly pedestrians: InstanceReader;
  setCenter(c: Readonly<Vec3d>): void;
  /** 마지막 틱 소요(ms)·인스턴스 수. */
  stats(): { tickMs: number; maxTickMs: number; count: number; ticks: number };
  dispose(): void;
}

export function startSimWorker(o: {
  supervisor: WorkerSupervisor;
  params: CrowdParams;
  centerWF: Readonly<Vec3d>;
  log: Logger;
}): SimWorkerHost | undefined {
  if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) {
    o.log.warn('sim worker: SharedArrayBuffer unavailable (not cross-origin isolated) — crowd disabled');
    return undefined;
  }
  const capacity = Math.max(1, o.params.dummy.count);
  const sab = allocInstanceSab(capacity);
  const w = o.supervisor.spawn(
    'sim',
    // Vite가 이 패턴(new Worker(new URL(…, import.meta.url)))을 보고 워커 청크를 만든다.
    () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'sanpo-sim' }),
  );
  let center: Vec3d = { ...o.centerWF };
  const st = { tickMs: 0, maxTickMs: 0, count: 0, ticks: 0 };
  const init = () => w.post({ t: 'init', sab, capacity, params: o.params, center });
  init();
  const offRestart = w.onRestart(init);
  const offMsg = w.onMessage((m) => {
    const d = m as { t?: string; ms?: number; count?: number };
    if (d.t !== 'tick') return;
    st.tickMs = d.ms ?? 0;
    st.maxTickMs = Math.max(st.maxTickMs, st.tickMs);
    st.count = d.count ?? 0;
    st.ticks++;
  });
  return {
    pedestrians: instanceReader(sab, capacity),
    setCenter(c) {
      center = { ...c };
      w.post({ t: 'center', center });
    },
    stats: () => ({ ...st }),
    dispose() {
      offRestart();
      offMsg();
      w.post({ t: 'stop' });
      w.terminate();
    },
  };
}
