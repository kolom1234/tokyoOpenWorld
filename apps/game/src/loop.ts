// rAF 프레임 루프 → scheduler.tick. 디버그 계측(stats-gl)은 프레임 훅으로만 끼운다. see docs/01-architecture.md §5
import type { Scheduler } from '@sanpo/core';

/** 프레임 앞뒤 훅(예: stats-gl begin/end). 게임 로직은 GameSystem으로 scheduler에 등록한다. */
export interface FrameHook {
  before?(): void;
  after?(): void;
}

export interface LoopDeps {
  scheduler: Scheduler;
  /** 기본 `requestAnimationFrame`. 콜백 인자는 performance.now()와 같은 시간축(ms). */
  raf?: (cb: (nowMs: number) => void) => number;
  cancelRaf?: (id: number) => void;
}

export interface Loop {
  start(): void;
  stop(): void;
  addHook(hook: FrameHook): void;
  readonly running: boolean;
}

export function createLoop(deps: LoopDeps): Loop {
  const raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));
  const cancelRaf = deps.cancelRaf ?? ((id) => cancelAnimationFrame(id));
  const hooks: FrameHook[] = [];
  let handle: number | undefined;

  const frame = (nowMs: number): void => {
    handle = raf(frame);
    for (const h of hooks) h.before?.();
    deps.scheduler.tick(nowMs);
    for (const h of hooks) h.after?.();
  };

  return {
    start() {
      if (handle === undefined) handle = raf(frame);
    },
    stop() {
      if (handle === undefined) return;
      cancelRaf(handle);
      handle = undefined;
    },
    addHook(hook) {
      hooks.push(hook);
    },
    get running() {
      return handle !== undefined;
    },
  };
}
