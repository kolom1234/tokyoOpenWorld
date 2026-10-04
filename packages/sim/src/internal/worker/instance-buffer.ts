// SAB 인스턴스 버퍼(10 §1, M06-T01): 머리 64 B(Int32 seq·count·front, Float64 anchor x·y·z·tick 절대 ms) + 이중 데이터 영역 × capacity × stride 8.
// 워커가 뒤쪽 영역에 쓰고 front를 바꾼 뒤 seq++ → 메인(render)은 front 영역만 읽는다(30 Hz 쓰기 vs 60 Hz 읽기 — 두 번 바뀌기 전에 읽기가 끝난다).
// 필드(stride 8): x, y, z(= WF − anchor), yaw(전방 = (−sin, 0, −cos)), anim(클립 번호 + 속력 m/s ÷ 10), phase(주기 0..1), variant(u16 외형 씨앗), rate(주기/s — 외삽).
import type { SharedInstanceBuffer, Vec3d } from '@sanpo/core';

export const STRIDE = 8;
const HEADER_BYTES = 64;
const I_SEQ = 0;
const I_COUNT = 1;
const I_FRONT = 2;
/** Float64 인덱스(머리 16 B부터). */
const D_ANCHOR = 2;
const D_TICK = 5;

export const instanceBytes = (capacity: number): number => HEADER_BYTES + 2 * capacity * STRIDE * 4;

export function allocInstanceSab(capacity: number): SharedArrayBuffer {
  return new SharedArrayBuffer(instanceBytes(capacity));
}

const regions = (sab: SharedArrayBuffer, capacity: number): [Float32Array, Float32Array] => [
  new Float32Array(sab, HEADER_BYTES, capacity * STRIDE),
  new Float32Array(sab, HEADER_BYTES + capacity * STRIDE * 4, capacity * STRIDE),
];

export interface InstanceReader extends SharedInstanceBuffer {
  /** 마지막 게시 시각(절대 ms = performance.timeOrigin + now — 워커·창 공통 시계). */
  tickAbsMs(): number;
  readonly capacity: number;
}

export function instanceReader(sab: SharedArrayBuffer, capacity: number): InstanceReader {
  const head = new Int32Array(sab, 0, 4);
  const d = new Float64Array(sab, 0, 8);
  const data = regions(sab, capacity);
  return {
    stride: STRIDE,
    capacity,
    get data() {
      return data[Atomics.load(head, I_FRONT) & 1] as Float32Array;
    },
    anchorWF: () => ({ x: d[D_ANCHOR] ?? 0, y: d[D_ANCHOR + 1] ?? 0, z: d[D_ANCHOR + 2] ?? 0 }),
    count: () => Atomics.load(head, I_COUNT),
    seq: () => Atomics.load(head, I_SEQ),
    tickAbsMs: () => d[D_TICK] ?? 0,
  };
}

export interface InstanceWriter {
  /** 이번 틱에 쓸 영역(front가 아닌 쪽). */
  back(): Float32Array;
  publish(count: number, anchorWF: Readonly<Vec3d>, tickAbsMs: number): void;
}

export function instanceWriter(sab: SharedArrayBuffer, capacity: number): InstanceWriter {
  const head = new Int32Array(sab, 0, 4);
  const d = new Float64Array(sab, 0, 8);
  const data = regions(sab, capacity);
  return {
    back: () => data[(Atomics.load(head, I_FRONT) & 1) ^ 1] as Float32Array,
    publish(count, anchor, tick) {
      const next = (Atomics.load(head, I_FRONT) & 1) ^ 1;
      d[D_ANCHOR] = anchor.x;
      d[D_ANCHOR + 1] = anchor.y;
      d[D_ANCHOR + 2] = anchor.z;
      d[D_TICK] = tick;
      Atomics.store(head, I_COUNT, Math.min(count, capacity));
      Atomics.store(head, I_FRONT, next);
      Atomics.add(head, I_SEQ, 1);
    },
  };
}
