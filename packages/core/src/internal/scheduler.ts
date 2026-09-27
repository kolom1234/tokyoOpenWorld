// 프레임 스케줄러: phase 오름차순 실행, dtReal 클램프, FrameContext 구성. see docs/01-architecture.md §5
import type { FrameContext, FrameSource, GameSystem, Scheduler, SchedulerDeps, SystemProvider } from '../api.ts';

/** dtReal 상한(s). 탭 전환·디버거 정지 후 폭주 방지. */
export const MAX_DT_REAL_S = 0.1;
/** 메인 스레드 단일 작업 예산(ms). CLAUDE.md Hard Rule 8, docs/14-testing-perf.md §2 */
const SYSTEM_BUDGET_MS = 4;
/** 예산 초과 경고의 시스템별 최소 간격(프레임). 로그 폭주 방지. */
const BUDGET_WARN_INTERVAL_FRAMES = 300;

interface Entry {
  sys: GameSystem;
  order: number;
  lastWarnFrame: number;
  /** remove()됨 — 진행 중인 tick 스냅샷에서도 이후 update를 건너뛴다(dispose 후 update 금지). */
  removed: boolean;
}

function isProvider(p: GameSystem | SystemProvider): p is SystemProvider {
  return typeof (p as SystemProvider).systems === 'function';
}

function byPhaseThenOrder(a: Entry, b: Entry): number {
  return a.sys.phase - b.sys.phase || a.order - b.order;
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const log = deps.log.child('scheduler');
  // copy-on-write: tick 중 add/remove가 일어나도 현재 프레임의 순회 목록은 불변.
  let entries: readonly Entry[] = [];
  let source: FrameSource | undefined;
  let orderSeq = 0;
  let frameIndex = 0;
  let lastNowMs: number | undefined;

  const addOne = (sys: GameSystem): void => {
    if (entries.some((e) => e.sys.id === sys.id)) throw new Error(`Scheduler.add: duplicate system id '${sys.id}'`);
    entries = [
      ...entries,
      { sys, order: orderSeq++, lastWarnFrame: -BUDGET_WARN_INTERVAL_FRAMES, removed: false },
    ].sort(byPhaseThenOrder);
  };

  const runOne = (e: Entry, frame: FrameContext): void => {
    if (e.removed) return;
    const t0 = deps.clock();
    try {
      e.sys.update(frame);
    } catch (err) {
      log.error(`system '${e.sys.id}' update threw`, err);
    }
    const spentMs = deps.clock() - t0;
    if (spentMs > SYSTEM_BUDGET_MS && frame.frameIndex - e.lastWarnFrame >= BUDGET_WARN_INTERVAL_FRAMES) {
      e.lastWarnFrame = frame.frameIndex;
      log.warn(`system '${e.sys.id}' took ${spentMs.toFixed(2)} ms (> ${SYSTEM_BUDGET_MS} ms budget)`);
    }
  };

  return {
    add(p) {
      if (isProvider(p)) for (const s of p.systems()) addOne(s);
      else addOne(p);
    },
    remove(id) {
      const e = entries.find((x) => x.sys.id === id);
      if (!e) return;
      e.removed = true;
      entries = entries.filter((x) => x !== e);
      try {
        e.sys.dispose();
      } catch (err) {
        log.error(`system '${id}' dispose threw`, err);
      }
    },
    setFrameSource(src) {
      source = src;
    },
    async init() {
      for (const e of entries) await e.sys.init?.();
    },
    tick(nowMs) {
      if (!source) throw new Error('Scheduler.tick: setFrameSource() must be called first');
      const rawDt = lastNowMs === undefined ? 0 : (nowMs - lastNowMs) / 1000;
      lastNowMs = nowMs;
      const dtReal = Math.min(Math.max(rawDt, 0), MAX_DT_REAL_S);
      const frame: FrameContext = {
        frameIndex: frameIndex++,
        dtReal,
        dtGame: dtReal * source.timeScale(),
        gameTimeMs: source.gameTimeMs(),
        camera: source.camera(),
        player: source.player(),
      };
      for (const e of entries) runOne(e, frame);
    },
  };
}
