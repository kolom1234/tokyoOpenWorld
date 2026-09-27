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

function supervise(ctx: Ctx, name: string, factory: WorkerFactory): SupervisedWorker {
  const log = ctx.log.child(name);
  const msgHandlers = new Set<(data: unknown) => void>();
  const restartHandlers = new Set<(n: number) => void>();
  let state: SupervisedWorkerState = 'running';
  let worker: Worker | undefined;
  let streak = 0; // 성공 메시지 없이 이어진 재시작 횟수
  let totalRestarts = 0;

  const fail = (reason: unknown): void => {
    if (state !== 'running') return;
    log.error('worker failed', reason);
    worker?.terminate();
    worker = undefined;
    if (streak >= ctx.maxRestarts) {
      state = 'failed';
      log.error(`giving up after ${streak} consecutive restarts`);
      return;
    }
    state = 'restarting';
    const delayMs = ctx.backoffMs * 2 ** streak;
    streak++;
    ctx.setTimer(() => {
      if (state !== 'restarting') return; // 그 사이 terminate됨
      start();
      totalRestarts++;
      log.info(`restarted (#${totalRestarts})`);
      for (const h of restartHandlers) h(totalRestarts);
    }, delayMs);
  };

  const onData = (data: unknown): void => {
    if (isWorkerErrorMessage(data)) {
      if (data.fatal) fail(data.message);
      else log.warn('worker reported', data.message);
      return;
    }
    streak = 0;
    for (const h of msgHandlers) h(data);
  };

  const start = (): void => {
    state = 'running';
    try {
      worker = wire(factory(), log, onData, fail);
    } catch (e) {
      fail(e);
    }
  };

  start();
  return {
    name,
    state: () => state,
    post(msg, transfer) {
      if (state !== 'running' || !worker) return false;
      worker.postMessage(msg, transfer ?? []);
      return true;
    },
    onMessage: (h) => subscribe(msgHandlers, h),
    onRestart: (h) => subscribe(restartHandlers, h),
    terminate() {
      state = 'terminated';
      worker?.terminate();
      worker = undefined;
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
