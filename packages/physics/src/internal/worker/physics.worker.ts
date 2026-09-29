// 물리 워커 엔트리(08 §1): 메시지 → 코어(순서 보장). 치명적 오류는 감독자 규약(`worker/error`, fatal) → 메인이 재시작.
import type { WorkerErrorMessage } from '@sanpo/core';
import type { ToWorker } from '../protocol.ts';
import { createPhysicsCore } from './core.ts';

const scope = globalThis as unknown as {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};

const core = createPhysicsCore((msg, transfer) => scope.postMessage(msg, transfer ?? []));

scope.onmessage = (e) => {
  core.handle(e.data).catch((err: unknown) => {
    const msg: WorkerErrorMessage = {
      t: 'worker/error',
      message: err instanceof Error ? err.message : String(err),
      fatal: true,
    };
    scope.postMessage(msg);
  });
};
