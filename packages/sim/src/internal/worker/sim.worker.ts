// sim.worker(10 §1): 30 Hz 고정 틱 — 군중 → SAB 인스턴스 버퍼(instance-buffer.ts) 게시. 모드: dummy(M06-T01 원형 걷기) | agents(M06-T03 DetourCrowd tier A).
// 메시지: init {sab, capacity, params, center, mode, plans?, clock, traffic?} · center · player {pos, vel, fwd?} · clock · density {scale} · cell-add {key, nav?, lanes?} · cell-remove {key} · scenario · stop.
// 교통(M06-T05): 군중 다음 같은 틱 — 군중 출력 칸을 보행자 격자로 넘겨 차량 양보, 출력 = 두 번째 SAB.
import type { Vec3, Vec3d } from '@sanpo/core';
import type { SignalPlansFile, TrafficParams } from '../../api.ts';
import { type CrowdParams, createDummyAgents, type DummyAgent, stepDummy } from '../crowd/dummy.ts';
import { type ClockSync, type CrowdRuntime, createCrowdRuntime } from './crowd-runtime.ts';
import { type InstanceWriter, instanceWriter } from './instance-buffer.ts';
import { createTrafficRuntime, type TrafficRuntime } from './traffic-runtime.ts';

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
      /** 교통 출력 SAB(M06-T05). 없으면 교통 없음. */
      traffic?: { sab: SharedArrayBuffer; capacity: number; params: TrafficParams };
    }
  | { t: 'center'; center: Vec3d }
  | { t: 'player'; pos: Vec3d; vel: Vec3; fwd?: Vec3 }
  | { t: 'density'; scale: number }
  | { t: 'clock'; clock: ClockSync }
  | { t: 'cell-add'; key: number; nav?: ArrayBuffer; lanes?: ArrayBuffer }
  | { t: 'cell-remove'; key: number }
  | { t: 'scenario'; center: Vec3d; radius: number; count: number }
  | { t: 'stop' };

interface State {
  writer: InstanceWriter;
  params: CrowdParams;
  dummy: DummyAgent[] | undefined;
  crowd: CrowdRuntime | undefined;
  traffic: { rt: TrafficRuntime; writer: InstanceWriter } | undefined;
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
  const tr = st.traffic;
  if (tr && st.crowd) {
    tr.rt.setPedestrians(back, n, st.anchor);
    const m = tr.rt.step(dt, st.crowd.gameMs(), tr.writer.back(), st.anchor);
    tr.writer.publish(m, st.anchor, now);
  }
  st.tickMs = performance.now() - t0;
  scope.postMessage({ t: 'tick', ms: st.tickMs, count: n, crowd: st.crowd?.stats(), traffic: tr?.rt.stats() });
}

function start(m: Extract<SimWorkerMsg, { t: 'init' }>): void {
  if (st?.timer) clearInterval(st.timer);
  const agents = m.mode === 'agents';
  const crowd = agents ? createCrowdRuntime(m.params, m.plans, m.clock) : undefined;
  const t = m.traffic;
  st = {
    writer: instanceWriter(m.sab, m.capacity),
    params: m.params,
    dummy: agents ? undefined : createDummyAgents(m.params),
    crowd,
    traffic:
      crowd && t
        ? {
            rt: createTrafficRuntime(t.params, (code) => crowd.vehicleLamp(code)),
            writer: instanceWriter(t.sab, t.capacity),
          }
        : undefined,
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
    if (m.t === 'player') {
      st.crowd?.setPlayer(m.pos, m.vel, m.fwd);
      st.traffic?.rt.setPlayer(m.pos, m.fwd);
    }
  } else if (m.t === 'clock') st.crowd?.setClock(m.clock);
  else if (m.t === 'density') st.crowd?.setDensityScale(m.scale);
  else if (m.t === 'cell-add') {
    if (m.nav) st.crowd?.addCell(m.key, m.nav);
    if (m.lanes) st.traffic?.rt.addCell(m.key, m.lanes);
  } else if (m.t === 'cell-remove') {
    st.crowd?.removeCell(m.key);
    st.traffic?.rt.removeCell(m.key);
  } else if (m.t === 'scenario') st.crowd?.scenario(m.center, m.radius, m.count);
  else if (m.t === 'stop') {
    if (st.timer) clearInterval(st.timer);
    st = undefined;
  }
};
