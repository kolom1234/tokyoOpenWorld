// 스냅샷 쓰기(08 §9): SAB 더블 버퍼(비활성 버퍼에 쓰고 writeIndex 교체 + seq 증가) 또는 폴백 postMessage(Transferable).
import { FRAME_F64, type FromWorker, H_SEQ, H_WRITE_INDEX, HEADER_INTS } from '../protocol.ts';

export interface SnapshotSink {
  /** 이번에 채울 버퍼(FRAME_F64). */
  begin(): Float64Array;
  /** 채운 버퍼 공개. */
  commit(): void;
}

/** SAB 헤더·프레임 뷰(메인 리더와 같은 배치). */
export function sabViews(sab: SharedArrayBuffer): { header: Int32Array; frames: [Float64Array, Float64Array] } {
  const header = new Int32Array(sab, 0, HEADER_INTS);
  const base = HEADER_INTS * 4;
  return {
    header,
    frames: [new Float64Array(sab, base, FRAME_F64), new Float64Array(sab, base + FRAME_F64 * 8, FRAME_F64)],
  };
}

export function createSabSink(sab: SharedArrayBuffer): SnapshotSink {
  const { header, frames } = sabViews(sab);
  let target = 0;
  return {
    begin() {
      target = 1 - Atomics.load(header, H_WRITE_INDEX);
      return frames[target] as Float64Array;
    },
    commit() {
      Atomics.store(header, H_WRITE_INDEX, target);
      Atomics.add(header, H_SEQ, 1);
    },
  };
}

export function createPostSink(send: (msg: FromWorker, transfer: Transferable[]) => void): SnapshotSink {
  let frame = new Float64Array(FRAME_F64);
  return {
    begin() {
      frame = new Float64Array(FRAME_F64);
      return frame;
    },
    commit() {
      send({ t: 'snapshot', frame }, [frame.buffer]);
    },
  };
}
