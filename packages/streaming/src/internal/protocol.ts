// 디코드 워커 메시지(판별 유니온). 메인 ↔ decode.worker. see docs/15-conventions.md §6, docs/06-world-streaming.md §9
import type { CellPayload } from '@sanpo/tile-format';
import type { DecodeError, DecodeRequest } from '../api.ts';

/** 메인 → 워커. decode의 `bytes`는 transfer(메인에서 분리됨). */
export type ToDecodeWorker =
  | { t: 'decode'; id: number; bytes: ArrayBuffer; req: DecodeRequest; verifyHash: boolean }
  | { t: 'cancel'; id: number };

/** 워커 → 메인. decoded의 payload 배열은 transfer. */
export type FromDecodeWorker =
  | { t: 'decoded'; id: number; payload: CellPayload; workerMs: number }
  | { t: 'failed'; id: number; error: DecodeError }
  | { t: 'cancelled'; id: number };

export function isFromDecodeWorker(d: unknown): d is FromDecodeWorker {
  if (typeof d !== 'object' || d === null) return false;
  const m = d as { t?: unknown; id?: unknown };
  return (m.t === 'decoded' || m.t === 'failed' || m.t === 'cancelled') && typeof m.id === 'number';
}
