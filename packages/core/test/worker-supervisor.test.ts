// WorkerSupervisor: 메시지 전달, fatal 오류 재시작(백오프), 연속 재시작 한도, terminate. see docs/15-conventions.md §5–6
import { describe, expect, it } from 'vitest';
import { createWorkerSupervisor } from '../src/index.ts';
import { recordingLogger } from './helpers.ts';

/** Worker의 on* 프로퍼티만 흉내내는 가짜. */
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string; preventDefault(): void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: unknown[] = [];
  terminated = false;
  postMessage(m: unknown): void {
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data });
  }
  crash(message = 'boom'): void {
    this.onerror?.({ message, preventDefault: () => {} });
  }
}

function setup(maxRestarts = 2) {
  const { log, records } = recordingLogger();
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const workers: FakeWorker[] = [];
  const sup = createWorkerSupervisor({
    log,
    options: { maxRestarts, backoffMs: 100 },
    setTimer: (fn, ms) => timers.push({ fn, ms }),
  });
  const w = sup.spawn('decode', () => {
    const fw = new FakeWorker();
    workers.push(fw);
    return fw as unknown as Worker;
  });
  const flush = () => {
    for (const t of timers.splice(0)) t.fn();
  };
  const last = () => workers[workers.length - 1] as FakeWorker;
  return { sup, w, workers, timers, records, flush, last };
}

describe('WorkerSupervisor', () => {
  it('forwards messages and posts while running', () => {
    const { w, last } = setup();
    const got: unknown[] = [];
    w.onMessage((d) => got.push(d));
    last().emit({ t: 'ready' });
    expect(got).toEqual([{ t: 'ready' }]);
    expect(w.post({ t: 'addCell' })).toBe(true);
    expect(last().posted).toEqual([{ t: 'addCell' }]);
  });

  it('restarts on crash with exponential backoff, keeping handlers', () => {
    const { w, workers, timers, flush, last } = setup(5);
    const got: unknown[] = [];
    const restarts: number[] = [];
    w.onMessage((d) => got.push(d));
    w.onRestart((n) => restarts.push(n));
    last().crash();
    expect(w.state()).toBe('restarting');
    expect(workers[0]?.terminated).toBe(true);
    expect(w.post('x')).toBe(false);
    expect(timers.map((t) => t.ms)).toEqual([100]);
    flush();
    expect(w.state()).toBe('running');
    expect(workers).toHaveLength(2);
    last().crash();
    expect(timers.map((t) => t.ms)).toEqual([200]);
    flush();
    last().emit('alive');
    expect(got).toEqual(['alive']);
    expect(restarts).toEqual([1, 2]);
    // 성공 메시지 후 백오프 리셋
    last().crash();
    expect(timers.map((t) => t.ms)).toEqual([100]);
  });

  it('handles worker/error messages: fatal restarts, non-fatal only warns', () => {
    const { w, records, last } = setup();
    const got: unknown[] = [];
    w.onMessage((d) => got.push(d));
    last().emit({ t: 'worker/error', message: 'minor', fatal: false });
    expect(w.state()).toBe('running');
    expect(records.some((r) => r.level === 'warn')).toBe(true);
    last().emit({ t: 'worker/error', message: 'oom', fatal: true });
    expect(w.state()).toBe('restarting');
    expect(got).toEqual([]);
  });

  it('gives up after maxRestarts consecutive failures', () => {
    const { w, flush, last, records } = setup(2);
    last().crash();
    flush();
    last().crash();
    flush();
    last().crash();
    expect(w.state()).toBe('failed');
    expect(records.some((r) => r.level === 'error' && String(r.args[0]).includes('giving up'))).toBe(true);
  });

  it('treats a throwing factory as a crash', () => {
    const { log } = recordingLogger();
    const timers: Array<() => void> = [];
    const sup = createWorkerSupervisor({ log, options: { maxRestarts: 0 }, setTimer: (fn) => timers.push(fn) });
    const w = sup.spawn('bad', () => {
      throw new Error('no wasm');
    });
    expect(w.state()).toBe('failed');
  });

  it('terminate cancels pending restart; dispose terminates all', () => {
    const { sup, w, flush, last, workers } = setup();
    last().crash();
    w.terminate();
    flush();
    expect(w.state()).toBe('terminated');
    expect(workers).toHaveLength(1);
    const { sup: sup2, w: w2, last: last2 } = setup();
    sup2.dispose();
    expect(w2.state()).toBe('terminated');
    expect(last2().terminated).toBe(true);
    sup.dispose();
  });
});
