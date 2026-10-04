// sim.worker 호스트(10 §1, M06-T01·T03): 감독자로 워커를 띄우고 SAB 인스턴스 버퍼를 넘긴다. 재시작되면 같은 SAB·파라미터로 다시 init하고
// 적재해 둔 셀 nav.bin·lanes.bin(사본)을 다시 보낸다. 교통(M06-T05) = 두 번째 SAB(차량). SAB가 없으면(교차 출처 격리 아님) 군중 없이 undefined — postMessage 복사 경로는 필요해지면(M08 설정) 추가.
import type { Logger, Vec3, Vec3d, WorkerSupervisor } from '@sanpo/core';
import type { SignalPlansFile, SimWorkerStats, TrafficParams } from '../../api.ts';
import type { CrowdParams } from '../crowd/dummy.ts';
import type { ClockSync } from './crowd-runtime.ts';
import { allocInstanceSab, type InstanceReader, instanceReader } from './instance-buffer.ts';
import type { SimWorkerMsg } from './sim.worker.ts';

/** 보행자 버퍼 용량: tier A + B(10 §4.2 High 250 + 750). 차량: 10 §5.1 High 150 + 여유. */
export const PEDESTRIAN_CAPACITY = 1000;
export const TRAFFIC_CAPACITY = 160;

export interface CrowdWorkerStats {
  agents: number;
  flow: number;
  promoted: number;
  demoted: number;
  waiting: number;
  crossing: number;
  plans: number;
  spawned: number;
  despawned: number;
  offMesh: number;
  stuck: number;
  tiles: number;
  cells: number;
  crossings: number;
}

export interface SimWorkerHost {
  readonly pedestrians: InstanceReader;
  readonly traffic: InstanceReader | undefined;
  setCenter(c: Readonly<Vec3d>): void;
  setPlayer(pos: Readonly<Vec3d>, vel: Readonly<Vec3>, fwd?: Readonly<Vec3>): void;
  setDensityScale(k: number): void;
  setClock(c: ClockSync): void;
  addCell(key: number, nav: ArrayBuffer | undefined, lanes: ArrayBuffer | undefined): void;
  removeCell(key: number): void;
  scenario(center: Readonly<Vec3d>, radius: number, count: number): void;
  /** 마지막 틱 소요(ms)·인스턴스 수·군중 통계. */
  stats(): {
    tickMs: number;
    maxTickMs: number;
    p95TickMs: number;
    count: number;
    ticks: number;
    crowd?: CrowdWorkerStats;
    traffic?: NonNullable<SimWorkerStats['traffic']>;
  };
  dispose(): void;
}

type HostStats = ReturnType<SimWorkerHost['stats']>;

/** 최근 틱 창(10 s @ 30 Hz) — p95(한 번뿐인 장면 생성·셀 적재 틱을 빼고 보려고). */
const WINDOW = 300;
const recent: number[] = [];

function onTick(st: HostStats, m: unknown): void {
  const d = m as {
    t?: string;
    ms?: number;
    count?: number;
    crowd?: CrowdWorkerStats;
    traffic?: SimWorkerStats['traffic'];
  };
  if (d.t !== 'tick') return;
  st.tickMs = d.ms ?? 0;
  st.maxTickMs = Math.max(st.maxTickMs, st.tickMs);
  recent.push(st.tickMs);
  if (recent.length > WINDOW) recent.shift();
  const sorted = [...recent].sort((a, b) => a - b);
  st.p95TickMs = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  st.count = d.count ?? 0;
  st.ticks++;
  if (d.crowd) st.crowd = d.crowd;
  if (d.traffic) st.traffic = d.traffic;
}

type CellCopy = { nav?: ArrayBuffer | undefined; lanes?: ArrayBuffer | undefined };

function hostApi(h: {
  pedestrians: InstanceReader;
  traffic: InstanceReader | undefined;
  post: (m: SimWorkerMsg, transfer?: Transferable[]) => void;
  copies: Map<number, CellCopy>;
  sendCell: (key: number, c: CellCopy) => void;
  st: HostStats;
  setCenterLocal: (c: Vec3d) => void;
  setClockLocal: (c: ClockSync) => void;
  dispose: () => void;
}): SimWorkerHost {
  return {
    pedestrians: h.pedestrians,
    traffic: h.traffic,
    setCenter(c) {
      h.setCenterLocal(c);
      h.post({ t: 'center', center: { ...c } });
    },
    setPlayer(pos, vel, fwd) {
      h.setCenterLocal(pos);
      h.post({ t: 'player', pos: { ...pos }, vel: { ...vel }, ...(fwd ? { fwd: { ...fwd } } : {}) });
    },
    setDensityScale: (scale) => h.post({ t: 'density', scale }),
    setClock(c) {
      h.setClockLocal(c);
      h.post({ t: 'clock', clock: c });
    },
    addCell(key, nav, lanes) {
      const c: CellCopy = { nav, lanes };
      h.copies.set(key, c);
      h.sendCell(key, c);
    },
    removeCell(key) {
      if (h.copies.delete(key)) h.post({ t: 'cell-remove', key });
    },
    scenario: (c, radius, count) => h.post({ t: 'scenario', center: { ...c }, radius, count }),
    stats: () => ({ ...h.st }),
    dispose: h.dispose,
  };
}

function initMsg(
  o: { params: CrowdParams; mode: 'dummy' | 'agents'; plans?: SignalPlansFile; traffic?: TrafficParams },
  sab: SharedArrayBuffer,
  capacity: number,
  center: Vec3d,
  clock: ClockSync,
  tsab: SharedArrayBuffer | undefined,
): SimWorkerMsg {
  return {
    t: 'init',
    sab,
    capacity,
    params: o.params,
    center,
    mode: o.mode,
    clock,
    ...(o.plans ? { plans: o.plans } : {}),
    ...(tsab && o.traffic ? { traffic: { sab: tsab, capacity: TRAFFIC_CAPACITY, params: o.traffic } } : {}),
  };
}

export function startSimWorker(o: {
  supervisor: WorkerSupervisor;
  params: CrowdParams;
  centerWF: Readonly<Vec3d>;
  mode: 'dummy' | 'agents';
  plans?: SignalPlansFile;
  clock: ClockSync;
  traffic?: TrafficParams;
  log: Logger;
}): SimWorkerHost | undefined {
  if (typeof SharedArrayBuffer === 'undefined' || !globalThis.crossOriginIsolated) {
    o.log.warn('sim worker: SharedArrayBuffer unavailable (not cross-origin isolated) — crowd disabled');
    return undefined;
  }
  const capacity = Math.max(PEDESTRIAN_CAPACITY, o.params.dummy.count);
  const sab = allocInstanceSab(capacity);
  const tsab = o.traffic && o.mode === 'agents' ? allocInstanceSab(TRAFFIC_CAPACITY) : undefined;
  const w = o.supervisor.spawn(
    'sim',
    // Vite가 이 패턴(new Worker(new URL(…, import.meta.url)))을 보고 워커 청크를 만든다.
    () => new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'sanpo-sim' }),
  );
  const post = (m: SimWorkerMsg, transfer?: Transferable[]): void => {
    w.post(m, transfer);
  };
  let center: Vec3d = { ...o.centerWF };
  let clock = o.clock;
  const copies = new Map<number, CellCopy>();
  const st: HostStats = { tickMs: 0, maxTickMs: 0, p95TickMs: 0, count: 0, ticks: 0 };
  const sendCell = (key: number, c: CellCopy): void => {
    const nav = c.nav?.slice(0);
    const lanes = c.lanes?.slice(0);
    post(
      { t: 'cell-add', key, ...(nav ? { nav } : {}), ...(lanes ? { lanes } : {}) },
      [nav, lanes].filter((b) => b !== undefined),
    );
  };
  const init = () => {
    post(initMsg(o, sab, capacity, center, clock, tsab));
    for (const [k, c] of copies) sendCell(k, c);
  };
  init();
  const offRestart = w.onRestart(init);
  const offMsg = w.onMessage((m) => onTick(st, m));
  return hostApi({
    pedestrians: instanceReader(sab, capacity),
    traffic: tsab ? instanceReader(tsab, TRAFFIC_CAPACITY) : undefined,
    post,
    copies,
    sendCell,
    st,
    setCenterLocal: (c) => {
      center = { ...c };
    },
    setClockLocal: (c) => {
      clock = c;
    },
    dispose() {
      offRestart();
      offMsg();
      post({ t: 'stop' });
      w.terminate();
    },
  });
}
