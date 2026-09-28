// worker_threads 안에서 decode.worker.ts를 브라우저 워커처럼 실행하는 셈(테스트 전용): self.postMessage/onmessage ↔ parentPort.
import { parentPort } from 'node:worker_threads';

if (!parentPort) throw new Error('node-worker-shim: not in a worker thread');
const port = parentPort;
const scope = globalThis as unknown as {
  postMessage: (m: unknown, t?: Transferable[]) => void;
  onmessage: ((e: { data: unknown }) => void) | null;
};
scope.onmessage = null;
scope.postMessage = (m, t) => port.postMessage(m, (t ?? []) as never);
port.on('message', (data: unknown) => scope.onmessage?.({ data }));
await import('../../src/internal/decode.worker.ts');
