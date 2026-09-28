// 테스트용 Worker 대역: ① 같은 스레드에서 createDecodeHost를 도는 가짜(structuredClone + transfer로 분리까지 재현)
// ② worker_threads에서 실제 decode.worker.ts를 도는 어댑터(웹 Worker 모양으로 감쌈 → core WorkerSupervisor에 그대로 투입).
import { Worker as ThreadWorker } from 'node:worker_threads';
import { createDecodeHost } from '../../src/internal/decode-host.ts';
import type { ToDecodeWorker } from '../../src/internal/protocol.ts';

type MsgHandler = ((e: { data: unknown }) => void) | null;

/** WorkerSupervisor가 쓰는 부분만 가진 웹 Worker 모양. */
export interface WorkerLike {
  onmessage: MsgHandler;
  onerror: ((e: { message: string; preventDefault?: () => void }) => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface FakeWorker extends WorkerLike {
  /** 워커가 받은 메시지 종류 기록(transfer 후 사본). */
  readonly received: ToDecodeWorker['t'][];
  /** 워커가 보낸 메시지 종류 기록. */
  readonly sent: string[];
  terminated: boolean;
  /** 워커 크래시 흉내(onerror). */
  crash(): void;
}

/** 같은 스레드 가짜 워커. 메시지 전달은 매크로태스크(실제 워커처럼 비동기), 본문은 structuredClone(transfer 분리). */
export function createFakeWorker(): FakeWorker {
  const w: FakeWorker = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    received: [],
    sent: [],
    terminated: false,
    postMessage(msg, transfer = []) {
      const copy = structuredClone(msg, { transfer }) as ToDecodeWorker;
      w.received.push(copy.t);
      setTimeout(() => {
        if (!w.terminated) host.handle(copy);
      }, 0);
    },
    terminate() {
      w.terminated = true;
    },
    crash() {
      w.onerror?.({ message: 'fake crash', preventDefault: () => undefined });
    },
  };
  const host = createDecodeHost((msg, transfer = []) => {
    if (w.terminated) return;
    const copy = structuredClone(msg, { transfer });
    w.sent.push(msg.t);
    setTimeout(() => {
      if (!w.terminated) w.onmessage?.({ data: copy });
    }, 0);
  });
  return w;
}

const SHIM = new URL('./node-worker-shim.ts', import.meta.url);

/** 실제 스레드에서 decode.worker.ts 실행. */
export function createThreadWorker(): WorkerLike & { readonly thread: ThreadWorker; readonly sent: string[] } {
  const thread = new ThreadWorker(SHIM);
  const w = {
    thread,
    /** 스레드가 보낸 메시지 종류(`t`) 기록. */
    sent: [] as string[],
    onmessage: null as MsgHandler,
    onerror: null as WorkerLike['onerror'],
    onmessageerror: null as WorkerLike['onmessageerror'],
    postMessage(msg: unknown, transfer: Transferable[] = []) {
      thread.postMessage(msg, transfer as never);
    },
    terminate() {
      void thread.terminate();
    },
  };
  thread.on('message', (data: unknown) => {
    w.sent.push(String((data as { t?: unknown }).t));
    w.onmessage?.({ data });
  });
  thread.on('error', (e: Error) => w.onerror?.({ message: e.message }));
  return w;
}
