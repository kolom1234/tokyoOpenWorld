// 디코드 공용: Result 오류 헬퍼, 취소 확인 함수형, transfer 목록 수집. see docs/06-world-streaming.md §9
import { err, type Result } from '@sanpo/core';
import type { CellPayload } from '@sanpo/tile-format';
import type { DecodeError, DecodeErrorCode } from '../api.ts';

export function fail(code: DecodeErrorCode, message: string): Result<never, DecodeError> {
  return err({ code, message });
}

/**
 * 단계 사이에서 호출: 이벤트 루프에 한 번 양보(대기 중인 cancel 메시지가 처리되게)한 뒤 취소됐으면 'aborted' 오류.
 * 계속하면 undefined.
 */
export type AbortCheck = () => Promise<DecodeError | undefined>;

/** 매크로태스크 양보. 워커에서 postMessage로 온 cancel이 이 사이에 처리된다. */
export function yieldTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function abortCheck(signal: AbortSignal | undefined, yieldFn: () => Promise<void> = yieldTask): AbortCheck {
  return async () => {
    await yieldFn();
    return signal?.aborted ? { code: 'aborted', message: 'cancelled' } : undefined;
  };
}

/** payload 안 모든 TypedArray/ArrayBuffer의 버퍼(중복 제거) — postMessage transfer 목록. */
export function transferList(p: CellPayload): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const add = (b: ArrayBufferLike | undefined) => {
    if (b instanceof ArrayBuffer && b.byteLength > 0) out.add(b);
  };
  for (const mesh of Object.values(p.meshes)) {
    for (const prim of mesh?.primitives ?? []) {
      for (const a of Object.values(prim.attributes)) add(a.array.buffer);
      add(prim.index?.buffer);
    }
  }
  add(p.heightfield?.data.buffer);
  add(p.collision);
  add(p.nav);
  add(p.lanes);
  for (const b of p.instances?.props ?? []) add(b.transforms.buffer);
  add(p.instances?.trees?.records);
  return [...out];
}
