// 디코드 워커 엔트리(모듈 워커): self ↔ createDecodeHost 연결만. 예외는 WorkerErrorMessage로 보고. see docs/06-world-streaming.md §9, docs/15-conventions.md §5–6
import { createDecodeHost } from './decode-host.ts';
import type { ToDecodeWorker } from './protocol.ts';

/** 워커 전역의 필요한 부분만(DOM lib과 WebWorker lib 충돌 회피). */
interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const host = createDecodeHost((msg, transfer) => scope.postMessage(msg, transfer ?? []));

scope.onmessage = (e) => {
  try {
    host.handle(e.data as ToDecodeWorker);
  } catch (err) {
    scope.postMessage({ t: 'worker/error', message: err instanceof Error ? err.message : String(err), fatal: false });
  }
};
