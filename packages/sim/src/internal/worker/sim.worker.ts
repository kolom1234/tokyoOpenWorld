// sim.worker(10 §1, M06-T01): 30 Hz 고정 틱 — 군중(지금은 더미 원형 걷기) → SAB 인스턴스 버퍼(instance-buffer.ts) 게시.
// 메시지: init {sab, capacity, params, center} · center {x,y,z} · stop. 이후 태스크(T02–T05)가 신호·내비메시·교통을 여기에 붙인다.
import type { Vec3d } from '@sanpo/core';
import { type CrowdParams, createDummyAgents, type DummyAgent, stepDummy } from '../crowd/dummy.ts';
import { type InstanceWriter, instanceWriter } from './instance-buffer.ts';

export const TICK_HZ = 30;

type Msg =
  | { t: 'init'; sab: SharedArrayBuffer; capacity: number; params: CrowdParams; center: Vec3d }
  | { t: 'center'; center: Vec3d }
  | { t: 'stop' };

interface State {
  writer: InstanceWriter;
  params: CrowdParams;
  agents: DummyAgent[];
  center: Vec3d;
  anchor: Vec3d;
  last: number;
  timer: ReturnType<typeof setInterval> | undefined;
  tickMs: number;
}

/** 워커 전역(tsconfig lib = DOM — WebWorker 타입 없음, physics.worker와 같은 방식). */
interface WorkerScope {
  postMessage(msg: unknown): void;
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
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
  const n = stepDummy(st.agents, st.params, dt, st.center, st.anchor, st.writer.back());
  st.writer.publish(n, st.anchor, now);
  st.tickMs = performance.now() - t0;
  scope.postMessage({ t: 'tick', ms: st.tickMs, count: n });
}

scope.onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    if (st?.timer) clearInterval(st.timer);
    st = {
      writer: instanceWriter(m.sab, m.capacity),
      params: m.params,
      agents: createDummyAgents(m.params),
      center: { ...m.center },
      anchor: anchorOf(m.center),
      last: nowAbs(),
      timer: undefined,
      tickMs: 0,
    };
    st.timer = setInterval(tick, 1000 / TICK_HZ);
  } else if (m.t === 'center' && st) {
    st.center = { ...m.center };
    st.anchor = anchorOf(m.center);
  } else if (m.t === 'stop' && st) {
    if (st.timer) clearInterval(st.timer);
    st = undefined;
  }
};
