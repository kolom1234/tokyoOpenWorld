// 물리 워커 코어(08 §1·§9): init → Jolt 로드·월드·스냅샷 싱크, step → 명령 적용 + 고정 스텝(메인 시계 targetS까지, 최대 N, 초과 시간은 버림) → 스냅샷.
// 워커 엔트리(physics.worker.ts)와 테스트(같은 스레드 전송)가 같이 쓴다.
import type { KinematicFrame, Vec3d } from '@sanpo/core';
import type { FromWorker, ToWorker } from '../protocol.ts';
import { type BodySlots, createBodySlots } from './bodies.ts';
import { type CellColliders, createCellColliders } from './cell-colliders.ts';
import { type Characters, createCharacters } from './character.ts';
import { createEscalators, type Escalators } from './escalators.ts';
import { warmUpShapes } from './heightfield.ts';
import { loadJolt } from './jolt-init.ts';
import { createKinematics, type Kinematics } from './kinematics.ts';
import { createQueries, type Queries } from './queries.ts';
import { createPostSink, createSabSink, type SnapshotSink } from './snapshot-writer.ts';
import { createWorld, type PhysicsWorld } from './world.ts';

export type Send = (msg: FromWorker, transfer?: Transferable[]) => void;

/** 08 §4 수락: 셀 적재 틱 ≤ 8 ms. */
const LOAD_TICK_LIMIT_MS = 8;

interface State {
  world: PhysicsWorld;
  /** 앵커(PHYS = WF − 앵커) — bodies·colliders·queries가 같은 객체를 읽는다(재설정 = 제자리 갱신). */
  anchor: Vec3d;
  escalators: Escalators;
  bodies: BodySlots;
  characters: Characters;
  /** sim 직결 키네마틱 차량(M06-T06). */
  kin: Kinematics;
  kinPort: MessagePort | undefined;
  colliders: CellColliders;
  queries: Queries;
  cellBudgetMs: number;
  loadMs: number;
  /** 적재 틱이 8 ms(08 §4 수락)를 넘은 횟수. */
  loadOver: number;
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

/** 앵커 재설정(08 §2): 모든 정적·강체 바디·캐릭터·에스컬레이터 구간을 −Δ, 앵커 제자리 갱신, 브로드페이즈 최적화. */
function rebase(st: State, to: Readonly<Vec3d>): void {
  const dx = to.x - st.anchor.x;
  const dy = to.y - st.anchor.y;
  const dz = to.z - st.anchor.z;
  if (dx === 0 && dy === 0 && dz === 0) return;
  st.colliders.shift(dx, dy, dz);
  st.bodies.shift(dx, dy, dz);
  st.characters.shift(dx, dy, dz);
  st.kin.shift(dx, dy, dz);
  st.escalators.shift(dx, dy, dz);
  Object.assign(st.anchor, to);
  st.world.system.OptimizeBroadPhase();
}

/** 적재 한 조각(예산 안, 최소 1작업) + 적재 틱 통계. */
function pumpLoad(st: State): void {
  if (st.colliders.pending === 0) return;
  const t0 = performance.now();
  st.colliders.pump(st.cellBudgetMs);
  const ms = performance.now() - t0;
  st.loadMs = Math.max(st.loadMs, ms);
  if (ms > LOAD_TICK_LIMIT_MS) st.loadOver++;
}

function step(st: State, targetS: number): void {
  const t0 = performance.now();
  pumpLoad(st);
  if (st.simT === null) st.simT = targetS - st.dt;
  st.kin.sync();
  let n = 0;
  while (st.simT + st.dt <= targetS + 1e-9 && n < st.maxSteps) {
    st.kin.beforeStep(st.dt);
    st.characters.update(st.dt);
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
  frame[4] = st.colliders.pending;
  frame[5] = st.colliders.cells;
  frame[6] = st.loadMs;
  frame[7] = st.loadOver;
  frame[8] = st.kin.count;
  frame[9] = st.kin.frames;
  st.sink.commit();
}

/** sim 직결 포트: 프레임은 받아 두기만(Jolt 변경은 step 안 — kinematics.sync). */
function attachKinematicPort(st: State, port: MessagePort): void {
  st.kinPort?.close();
  st.kinPort = port;
  const kin = st.kin;
  port.onmessage = (e: MessageEvent) =>
    kin.receive(e.data as KinematicFrame, performance.timeOrigin + performance.now());
}

async function init(msg: Extract<ToWorker, { t: 'init' }>, send: Send): Promise<State> {
  const loaded = await loadJolt();
  warmUpShapes(loaded.Jolt);
  const world = createWorld(loaded.Jolt, 0);
  const anchor: Vec3d = { ...msg.anchorWF };
  const escalators = createEscalators();
  const characters = createCharacters(world, escalators);
  const st: State = {
    world,
    anchor,
    escalators,
    characters,
    kin: createKinematics(world, anchor),
    kinPort: undefined,
    bodies: createBodySlots(world, anchor, characters),
    colliders: createCellColliders(
      world,
      anchor,
      escalators,
      (key) => send({ t: 'cellLoaded', key }),
      (m) => send({ t: 'warn', message: m }),
    ),
    queries: createQueries(world, anchor),
    cellBudgetMs: msg.cellBudgetMs,
    loadMs: 0,
    loadOver: 0,
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

/**
 * 메시지는 도착 순서대로 하나씩(init의 Jolt 로드를 기다린 뒤 step). 적재 작업이 남으면 메시지 사이 빈 시간에도 조각(예산 cellBudgetMs = 3 ms)씩 처리 —
 * 적재 속도가 메인 프레임률(step 1회/프레임)에 묶이지 않게(저 FPS·SwiftShader). 조각 사이엔 다음 메시지가 먼저 들어올 수 있다.
 */
export function createPhysicsCore(send: Send): PhysicsCore {
  let st: State | undefined;
  let queue: Promise<void> = Promise.resolve();
  let idleScheduled = false;
  const scheduleIdle = (): void => {
    if (idleScheduled || !st || st.colliders.pending === 0) return;
    idleScheduled = true;
    setTimeout(() => {
      queue = queue
        .then(() => {
          idleScheduled = false;
          if (st) pumpLoad(st);
          scheduleIdle();
        })
        .catch((e: unknown) => send({ t: 'warn', message: `collider load: ${String(e)}` }));
    }, 0);
  };
  const run = async (msg: ToWorker): Promise<void> => {
    if (msg.t === 'init') {
      st = await init(msg, send);
      return;
    }
    if (!st) return;
    if (msg.t === 'step') {
      for (const c of msg.cmds) {
        if (c.c === 'removeCell') st.colliders.remove(c.key);
        else if (c.c === 'rebase') rebase(st, c.anchorWF);
        else st.bodies.apply(c);
      }
      step(st, msg.targetS);
    } else if (msg.t === 'addCell') st.colliders.enqueue(msg.key, msg.originWF, msg.jcol, msg.hf);
    else if (msg.t === 'ray')
      send({ t: 'rayHit', id: msg.id, hit: st.queries.raycast(msg.originWF, msg.dir, msg.maxDist) });
    else if (msg.t === 'sphere')
      send({ t: 'rayHit', id: msg.id, hit: st.queries.sphereCast(msg.originWF, msg.dir, msg.radius, msg.maxDist) });
    else if (msg.t === 'kinematicPort') attachKinematicPort(st, msg.port);
    else if (msg.t === 'dispose') {
      st.kinPort?.close();
      st.kin.dispose();
      st.colliders.dispose();
      st.queries.dispose();
      st.bodies.dispose();
      st.characters.dispose();
      st.world.dispose();
      st = undefined;
    }
  };
  return {
    handle(msg) {
      const p = queue.then(() => run(msg)).finally(scheduleIdle);
      // 한 메시지가 실패해도 뒤 메시지는 계속 처리(오류는 호출자에게).
      queue = p.catch(() => undefined);
      return p;
    },
  };
}
