// 디코드 워커 본체(환경 독립): 메시지 처리, 요청별 AbortController, 결과 transfer. decode.worker.ts가 self에 연결한다. see docs/06-world-streaming.md §2, §9

import { decodeCell } from './decode.ts';
import { abortCheck, transferList, yieldTask } from './decode-util.ts';
import type { FromDecodeWorker, ToDecodeWorker } from './protocol.ts';

export type PostFn = (msg: FromDecodeWorker, transfer?: Transferable[]) => void;

export interface DecodeHost {
  handle(msg: ToDecodeWorker): void;
  /** 진행 중 요청 수(테스트용). */
  active(): number;
}

export interface DecodeHostOptions {
  /** 단계 사이 양보(기본 setTimeout 0 — 대기 중 cancel 처리). */
  yieldFn?: () => Promise<void>;
  now?: () => number;
}

/**
 * 요청마다 AbortController. cancel은 컨트롤러를 abort → 디코드가 다음 단계 경계(섹션·프리미티브)에서 멈추고 'cancelled'를 보낸다.
 * 이미 끝난(또는 모르는) id의 cancel은 무시.
 */
export function createDecodeHost(post: PostFn, opts: DecodeHostOptions = {}): DecodeHost {
  const running = new Map<number, AbortController>();
  const now = opts.now ?? (() => performance.now());
  const yieldFn = opts.yieldFn ?? yieldTask;

  async function run(msg: Extract<ToDecodeWorker, { t: 'decode' }>, ac: AbortController): Promise<void> {
    const t0 = now();
    try {
      const r = await decodeCell(msg.bytes, msg.req, {
        verifyHash: msg.verifyHash,
        check: abortCheck(ac.signal, yieldFn),
      });
      if (ac.signal.aborted || (!r.ok && r.error.code === 'aborted')) post({ t: 'cancelled', id: msg.id });
      else if (!r.ok) post({ t: 'failed', id: msg.id, error: r.error });
      else post({ t: 'decoded', id: msg.id, payload: r.value, workerMs: now() - t0 }, transferList(r.value));
    } catch (e) {
      post({
        t: 'failed',
        id: msg.id,
        error: { code: 'corrupt', message: e instanceof Error ? e.message : String(e) },
      });
    } finally {
      running.delete(msg.id);
    }
  }

  return {
    handle(msg) {
      if (msg.t === 'cancel') {
        running.get(msg.id)?.abort();
        return;
      }
      const ac = new AbortController();
      running.set(msg.id, ac);
      void run(msg, ac);
    },
    active: () => running.size,
  };
}
