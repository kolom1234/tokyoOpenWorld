// 물리 워커 코어(08 §1·§9): init → Jolt 로드·월드·스냅샷 싱크, step → 명령 적용 + 고정 스텝(메인 시계 targetS까지, 최대 N, 초과 시간은 버림) → 스냅샷.
// 워커 엔트리(physics.worker.ts)와 테스트(같은 스레드 전송)가 같이 쓴다.
import type { Vec3d } from '@sanpo/core';
import type { FromWorker, ToWorker } from '../protocol.ts';
import { type BodySlots, createBodySlots } from './bodies.ts';
import { loadJolt } from './jolt-init.ts';
import { createPostSink, createSabSink, type SnapshotSink } from './snapshot-writer.ts';
import { createWorld, type PhysicsWorld } from './world.ts';

export type Send = (msg: FromWorker, transfer?: Transferable[]) => void;

interface State {
  world: PhysicsWorld;
  bodies: BodySlots;
  sink: SnapshotSink;
  dt: number;
  maxSteps: number;
  simT: number | null;
  steps: number;
  tickMs: number;
}

export interface PhysicsCore {
  handle(msg: ToWorker): Promise<void>;
}

function step(st: State, targetS: number): void {
  const t0 = performance.now();
  if (st.simT === null) st.simT = targetS - st.dt;
  let n = 0;
  while (st.simT + st.dt <= targetS + 1e-9 && n < st.maxSteps) {
    st.world.step(st.dt);
    st.simT += st.dt;
    st.steps++;
    n++;
  }
  // 스파이럴 방지: 따라잡지 못한 시간은 버린다(바디는 그 시간 동안 멈춘 것으로).
  if (targetS - st.simT > st.dt) st.simT = targetS - st.dt;
  const frame = st.sink.begin();
  const top = st.bodies.fill(frame);
  frame[0] = st.simT;
  frame[1] = st.steps;
  frame[2] = top;
  st.tickMs += (performance.now() - t0 - st.tickMs) * 0.1;
  frame[3] = st.tickMs;
  st.sink.commit();
}

async function init(msg: Extract<ToWorker, { t: 'init' }>, send: Send): Promise<State> {
  const loaded = await loadJolt();
  const world = createWorld(loaded.Jolt, 0);
  const anchor: Vec3d = { ...msg.anchorWF };
  const st: State = {
    world,
    bodies: createBodySlots(world, anchor),
    sink: msg.sab ? createSabSink(msg.sab) : createPostSink(send),
    dt: 1 / msg.stepHz,
    maxSteps: msg.maxSteps,
    simT: null,
    steps: 0,
    tickMs: 0,
  };
  send({ t: 'ready', build: loaded.build, initMs: loaded.initMs });
  return st;
}

/** 메시지는 도착 순서대로 하나씩(init의 Jolt 로드를 기다린 뒤 step). */
export function createPhysicsCore(send: Send): PhysicsCore {
  let st: State | undefined;
  let queue: Promise<void> = Promise.resolve();
  const run = async (msg: ToWorker): Promise<void> => {
    if (msg.t === 'init') {
      st = await init(msg, send);
      return;
    }
    if (!st) return;
    if (msg.t === 'step') {
      for (const c of msg.cmds) st.bodies.apply(c);
      step(st, msg.targetS);
    } else if (msg.t === 'dispose') {
      st.bodies.dispose();
      st.world.dispose();
      st = undefined;
    }
  };
  return {
    handle(msg) {
      const p = queue.then(() => run(msg));
      // 한 메시지가 실패해도 뒤 메시지는 계속 처리(오류는 호출자에게).
      queue = p.catch(() => undefined);
      return p;
    },
  };
}
