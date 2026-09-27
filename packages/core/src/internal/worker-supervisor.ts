// 워커 생성·오류 감시·지수 백오프 재시작. see docs/15-conventions.md §5–6
import type {
  Logger,
  SupervisedWorker,
  SupervisedWorkerState,
  Unsubscribe,
  WorkerErrorMessage,
  WorkerFactory,
  WorkerSupervisor,
  WorkerSupervisorDeps,
} from '../api.ts';

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_BACKOFF_MS = 250;

function isWorkerErrorMessage(d: unknown): d is WorkerErrorMessage {
  return typeof d === 'object' && d !== null && (d as { t?: unknown }).t === 'worker/error';
}

function subscribe<H>(set: Set<H>, h: H): Unsubscribe {
  set.add(h);
  return () => {
    set.delete(h);
  };
}

function wire(w: Worker, log: Logger, onData: (d: unknown) => void, fail: (reason: unknown) => void): Worker {
  w.onmessage = (e) => onData(e.data);
  w.onerror = (e) => {
    e.preventDefault?.();
    fail(e.message || e);
  };
  w.onmessageerror = () => log.warn('message deserialization failed');
  return w;
}

interface Ctx {
  log: Logger;
  maxRestarts: number;
  backoffMs: number;
  setTimer: (fn: () => void, ms: number) => void;
}

/** 워커 1개의 가변 상태. supervise()의 핸들과 fail/onData/start 헬퍼가 공유한다. */
interface Slot {
  readonly name: string;
  readonly log: Logger;
  readonly factory: WorkerFactory;
  readonly msgHandlers: Set<(data: unknown) => void>;
  readonly restartHandlers: Set<(n: number) => void>;
  state: SupervisedWorkerState;
  worker: Worker | undefined;
  /** 성공 메시지 없이 이어진 재시작 횟수 */
  streak: number;
  totalRestarts: number;
}

function start(ctx: Ctx, s: Slot): void {
  s.state = 'running';
  try {
    s.worker = wire(
      s.factory(),
      s.log,
      (data) => onData(ctx, s, data),
      (reason) => fail(ctx, s, reason),
    );
  } catch (e) {
    fail(ctx, s, e);
  }
}

function fail(ctx: Ctx, s: Slot, reason: unknown): void {
  if (s.state !== 'running') return;
  s.log.error('worker failed', reason);
  s.worker?.terminate();
  s.worker = undefined;
  if (s.streak >= ctx.maxRestarts) {
    s.state = 'failed';
    s.log.error(`giving up after ${s.streak} consecutive restarts`);
    return;
  }
  s.state = 'restarting';
  const delayMs = ctx.backoffMs * 2 ** s.streak;
  s.streak++;
  ctx.setTimer(() => {
    if (s.state !== 'restarting') return; // 그 사이 terminate됨
    start(ctx, s);
    s.totalRestarts++;
    s.log.info(`restarted (#${s.totalRestarts})`);
    for (const h of s.restartHandlers) h(s.totalRestarts);
  }, delayMs);
}

function onData(ctx: Ctx, s: Slot, data: unknown): void {
  if (isWorkerErrorMessage(data)) {
    if (data.fatal) fail(ctx, s, data.message);
    else s.log.warn('worker reported', data.message);
    return;
  }
  s.streak = 0;
  for (const h of s.msgHandlers) h(data);
}

function supervise(ctx: Ctx, name: string, factory: WorkerFactory): SupervisedWorker {
  const s: Slot = {
    name,
    log: ctx.log.child(name),
    factory,
    msgHandlers: new Set(),
    restartHandlers: new Set(),
    state: 'running',
    worker: undefined,
    streak: 0,
    totalRestarts: 0,
  };
  start(ctx, s);
  return {
    name,
    state: () => s.state,
    post(msg, transfer) {
      if (s.state !== 'running' || !s.worker) return false;
      s.worker.postMessage(msg, transfer ?? []);
      return true;
    },
    onMessage: (h) => subscribe(s.msgHandlers, h),
    onRestart: (h) => subscribe(s.restartHandlers, h),
    terminate() {
      s.state = 'terminated';
      s.worker?.terminate();
      s.worker = undefined;
    },
  };
}

export function createWorkerSupervisor(deps: WorkerSupervisorDeps): WorkerSupervisor {
  const ctx: Ctx = {
    log: deps.log.child('worker'),
    maxRestarts: deps.options?.maxRestarts ?? DEFAULT_MAX_RESTARTS,
    backoffMs: deps.options?.backoffMs ?? DEFAULT_BACKOFF_MS,
    setTimer: deps.setTimer ?? ((fn, ms) => void setTimeout(fn, ms)),
  };
  const all: SupervisedWorker[] = [];
  return {
    spawn(name, factory) {
      const w = supervise(ctx, name, factory);
      all.push(w);
      return w;
    },
    dispose() {
      for (const w of all) w.terminate();
      all.length = 0;
    },
  };
}
