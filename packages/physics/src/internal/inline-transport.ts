// 같은 스레드 전송: 워커 대신 워커 코어를 직접 돌린다(Node 테스트·도구 — 브라우저 게임은 쓰지 않는다). flush() = 마지막 메시지 처리 완료.
import type { PhysicsTransport } from '../api.ts';
import type { ToWorker } from './protocol.ts';
import { createPhysicsCore } from './worker/core.ts';

export function createInlineTransport(): PhysicsTransport & { flush(): Promise<void> } {
  let handler: ((d: unknown) => void) | undefined;
  const core = createPhysicsCore((msg) => handler?.(msg));
  let pending: Promise<void> = Promise.resolve();
  return {
    post(m) {
      const prev = pending;
      pending = prev.then(() => core.handle(m as ToWorker));
    },
    onMessage(h) {
      handler = h;
      return () => {
        handler = undefined;
      };
    },
    terminate() {},
    flush: () => pending,
  };
}
