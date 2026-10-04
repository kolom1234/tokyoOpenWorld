// sim.worker(10 §1): 30 Hz 고정 틱 — 군중 → SAB 인스턴스 버퍼(instance-buffer.ts) 게시. 모드: dummy(M06-T01 원형 걷기) | agents(M06-T03 DetourCrowd tier A).
// 메시지: init {sab, capacity, params, center, mode, plans?, clock} · center · player {pos, vel} · clock · nav-add {key, nav} · nav-remove {key} · scenario · stop.
import type { Vec3, Vec3d } from '@sanpo/core';
import type { SignalPlansFile } from '../../api.ts';
import { type CrowdParams, createDummyAgents, type DummyAgent, stepDummy } from '../crowd/dummy.ts';
import { type ClockSync, type CrowdRuntime, createCrowdRuntime } from './crowd-runtime.ts';
import { type InstanceWriter, instanceWriter } from './instance-buffer.ts';

export const TICK_HZ = 30;

export type SimWorkerMsg =
  | {
      t: 'init';
      sab: SharedArrayBuffer;
      capacity: number;
      params: CrowdParams;
      center: Vec3d;
      mode: 'dummy' | 'agents';
      plans?: SignalPlansFile;
      clock: ClockSync;
    }
  | { t: 'center'; center: Vec3d }
  | { t: 'player'; pos: Vec3d; vel: Vec3 }
  | { t: 'clock'; clock: ClockSync }
  | { t: 'nav-add'; key: number; nav: ArrayBuffer }
  | { t: 'nav-remove'; key: number }
  | { t: 'scenario'; center: Vec3d; radius: number; count: number }
  | { t: 'stop' };

interface State {
  writer: InstanceWriter;
  params: CrowdParams;
  dummy: DummyAgent[] | undefined;
  crowd: CrowdRuntime | undefined;
  center: Vec3d;
  anchor: Vec3d;
  last: number;
  timer: ReturnType<typeof setInterval> | undefined;
  tickMs: number;
}

/** 워커 전역(tsconfig lib = DOM — WebWorker 타입 없음, physics.worker와 같은 방식). */
interface WorkerScope {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent<SimWorkerMsg>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let st: State | undefined;
const nowAbs = (): number => performance.timeOrigin + performance.now();
/** 앵커 = 중심의 256 m 격자점(float32 정밀도 — WF − anchor가 작게). */
const anchorOf = (c: Readonly<Vec3d>): Vec3d => ({
  x: Math.round(c.x / 256) * 256,
  y: 0,
  z: Math.round(c.z / 256) * 256,
});

function tick(): void {
  if (!st) return;
  const t0 = performance.now();
  const now = nowAbs();
  const dt = Math.min(Math.max((now - st.last) / 1000, 0), 0.1);
  st.last = now;
  const back = st.writer.back();
  const n = st.crowd
    ? st.crowd.step(dt, now, back, st.anchor)
    : stepDummy(st.dummy ?? [], st.params, dt, st.center, st.anchor, back);
  st.writer.publish(n, st.anchor, now);
  st.tickMs = performance.now() - t0;
  scope.postMessage({ t: 'tick', ms: st.tickMs, count: n, crowd: st.crowd?.stats() });
}

function start(m: Extract<SimWorkerMsg, { t: 'init' }>): void {
  if (st?.timer) clearInterval(st.timer);
  const agents = m.mode === 'agents';
  st = {
    writer: instanceWriter(m.sab, m.capacity),
    params: m.params,
    dummy: agents ? undefined : createDummyAgents(m.params),
    crowd: agents ? createCrowdRuntime(m.params, m.plans, m.clock) : undefined,
    center: { ...m.center },
    anchor: anchorOf(m.center),
    last: nowAbs(),
    timer: undefined,
    tickMs: 0,
  };
  st.timer = setInterval(tick, 1000 / TICK_HZ);
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') return start(m);
  if (!st) return;
  if (m.t === 'center' || m.t === 'player') {
    st.center = { ...(m.t === 'center' ? m.center : m.pos) };
    st.anchor = anchorOf(st.center);
    if (m.t === 'player') st.crowd?.setPlayer(m.pos, m.vel);
  } else if (m.t === 'clock') st.crowd?.setClock(m.clock);
  else if (m.t === 'nav-add') st.crowd?.addCell(m.key, m.nav);
  else if (m.t === 'nav-remove') st.crowd?.removeCell(m.key);
  else if (m.t === 'scenario') st.crowd?.scenario(m.center, m.radius, m.count);
  else if (m.t === 'stop') {
    if (st.timer) clearInterval(st.timer);
    st = undefined;
  }
};
