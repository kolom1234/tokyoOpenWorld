// 디코드 워커 풀(메인): 워커당 동시 perWorker개, 초과분 FIFO 대기, 취소 → 대기열 제거 또는 워커에 cancel. 늦게 온 결과는 id로 폐기.
// 메인 작업 = postMessage(transfer)·Map 조작뿐(파싱 없음, Hard Rule 8). see docs/06-world-streaming.md §4, §9, docs/15-conventions.md §6
import { ok, type Result, type SupervisedWorker } from '@sanpo/core';
import type { DecodeError, DecodePool, DecodePoolDeps, DecodeRequest, DecodeResult } from '../api.ts';
import { type FromDecodeWorker, isFromDecodeWorker, type ToDecodeWorker } from './protocol.ts';

type Done = Result<DecodeResult, DecodeError>;

interface Job {
  id: number;
  bytes: ArrayBuffer;
  req: DecodeRequest;
  resolve: (r: Done) => void;
  cleanup: () => void;
  slot?: Slot;
}
interface Slot {
  worker: SupervisedWorker;
  jobs: Set<number>;
}

/** 자동 워커 수: 코어 − 2(메인·렌더 몫), 1…4. */
const AUTO_WORKERS_MAX = 4;
const AUTO_RESERVED_CORES = 2;

export function autoWorkerCount(hardwareConcurrency: number | undefined): number {
  return Math.min(AUTO_WORKERS_MAX, Math.max(1, (hardwareConcurrency ?? 4) - AUTO_RESERVED_CORES));
}

/** Vite가 이 패턴(new Worker(new URL(…, import.meta.url)))을 보고 워커 청크를 만든다. */
function defaultWorker(): Worker {
  return new Worker(new URL('./decode.worker.ts', import.meta.url), { type: 'module', name: 'sanpo-decode' });
}

const err = (code: DecodeError['code'], message: string): Done => ({ ok: false, error: { code, message } });

interface Pool {
  deps: DecodePoolDeps;
  jobs: Map<number, Job>;
  queue: Job[];
  slots: Slot[];
  nextId: number;
  disposed: boolean;
}

function finish(p: Pool, job: Job, r: Done): void {
  if (!p.jobs.delete(job.id)) return;
  job.slot?.jobs.delete(job.id);
  const qi = p.queue.indexOf(job);
  if (qi >= 0) p.queue.splice(qi, 1);
  job.cleanup();
  job.resolve(r);
}

/** 멈춘(재시작 중·포기) 워커에 있던 작업은 바이트가 사라졌으므로 실패 처리 — 재요청은 스케줄러 몫. */
function sweep(p: Pool): void {
  for (const s of p.slots) {
    if (s.worker.state() === 'running') continue;
    for (const id of [...s.jobs]) {
      const job = p.jobs.get(id);
      if (job) finish(p, job, err('worker', `${s.worker.name} ${s.worker.state()}`));
    }
  }
}

/** 실행 중이고 여유 있는 워커 중 작업이 가장 적은 것. */
function freeSlot(p: Pool): Slot | undefined {
  let best: Slot | undefined;
  for (const s of p.slots) {
    if (s.worker.state() !== 'running' || s.jobs.size >= p.deps.config.perWorker) continue;
    if (!best || s.jobs.size < best.jobs.size) best = s;
  }
  return best;
}

function pump(p: Pool): void {
  sweep(p);
  for (let s = freeSlot(p); s && p.queue.length > 0; s = freeSlot(p)) {
    const job = p.queue.shift() as Job;
    const verifyHash = p.deps.config.verifyHash;
    const msg: ToDecodeWorker = { t: 'decode', id: job.id, bytes: job.bytes, req: job.req, verifyHash };
    if (!s.worker.post(msg, [job.bytes])) {
      p.queue.unshift(job);
      break;
    }
    job.slot = s;
    s.jobs.add(job.id);
  }
  if (p.queue.length > 0 && p.slots.every((s) => s.worker.state() === 'failed')) {
    for (const job of [...p.queue]) finish(p, job, err('worker', 'all decode workers failed'));
  }
}

function onWorkerMessage(p: Pool, data: unknown): void {
  if (!isFromDecodeWorker(data)) return;
  const job = p.jobs.get(data.id);
  if (job) finish(p, job, toResult(data));
  pump(p);
}

function submit(p: Pool, bytes: ArrayBuffer, req: DecodeRequest, signal: AbortSignal | undefined): Promise<Done> {
  return new Promise<Done>((resolve) => {
    const id = p.nextId++;
    const onAbort = () => {
      const job = p.jobs.get(id);
      if (!job) return;
      if (job.slot) job.slot.worker.post({ t: 'cancel', id } satisfies ToDecodeWorker);
      finish(p, job, err('aborted', 'cancelled'));
      pump(p);
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const job: Job = { id, bytes, req, resolve, cleanup };
    p.jobs.set(id, job);
    p.queue.push(job);
    signal?.addEventListener('abort', onAbort, { once: true });
    pump(p);
  });
}

export function createDecodePool(deps: DecodePoolDeps): DecodePool {
  const auto = autoWorkerCount(deps.hardwareConcurrency ?? globalThis.navigator?.hardwareConcurrency);
  const count = deps.config.workers > 0 ? deps.config.workers : auto;
  const p: Pool = { deps, jobs: new Map(), queue: [], slots: [], nextId: 1, disposed: false };
  for (let i = 0; i < count; i++) {
    const worker = deps.supervisor.spawn(`decode-${i}`, deps.createWorker ?? defaultWorker);
    worker.onMessage((data) => onWorkerMessage(p, data));
    worker.onRestart(() => pump(p));
    p.slots.push({ worker, jobs: new Set() });
  }
  return {
    decode(bytes, req, signal) {
      if (p.disposed) return Promise.resolve(err('worker', 'pool disposed'));
      if (signal?.aborted) return Promise.resolve(err('aborted', 'cancelled before dispatch'));
      return submit(p, bytes, req, signal);
    },
    stats() {
      sweep(p);
      const running = p.slots.filter((s) => s.worker.state() === 'running').length;
      return { workers: p.slots.length, running, inFlight: p.jobs.size - p.queue.length, queued: p.queue.length };
    },
    dispose() {
      p.disposed = true;
      for (const job of [...p.jobs.values()]) finish(p, job, err('worker', 'pool disposed'));
      for (const s of p.slots) s.worker.terminate();
    },
  };
}

function toResult(m: FromDecodeWorker): Done {
  if (m.t === 'decoded') return ok({ payload: m.payload, workerMs: m.workerMs });
  if (m.t === 'failed') return { ok: false, error: m.error };
  return err('aborted', 'cancelled in worker');
}
