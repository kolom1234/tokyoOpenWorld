// 스냅샷 읽기·보간(08 §9): SAB는 seqlock으로 최신 버퍼를 복사, 폴백은 받은 프레임 그대로. 최근 몇 개를 시뮬레이션 시각 순으로 두고
// 렌더 시각(지금 − 지연)을 감싸는 두 프레임 사이를 보간한다(위치·속도 선형, 회전 nlerp). 순간 이동(프레임 간 10 m 이상)은 보간하지 않는다.
import type { Pose } from '../../api.ts';
import {
  BODY_ALIVE,
  BODY_ESCALATOR,
  BODY_GROUNDED,
  BODY_STRIDE,
  FRAME_F64,
  H_SEQ,
  H_WRITE_INDEX,
  META_STRIDE,
} from '../protocol.ts';

const CAPACITY = 6;
const SNAP_DISTANCE_M = 10;

export interface SnapshotHistory {
  /** 프레임 복사 보관(같은 시뮬레이션 시각이면 최신을 교체 — 시간 진행 없이 명령만 반영된 경우). */
  push(frame: Float64Array): void;
  readonly latest: Float64Array | undefined;
  /** tS 시각의 슬롯 포즈(핸들 확인). 없으면 false. */
  sample(slot: number, handle: number, tS: number, out: Pose): boolean;
}

function alive(f: Float64Array, slot: number, handle: number): boolean {
  const o = META_STRIDE + slot * BODY_STRIDE;
  return (Math.trunc(f[o + 13] ?? 0) & BODY_ALIVE) !== 0 && f[o + 15] === handle;
}

function write(out: Pose, a: Float64Array, b: Float64Array, slot: number, k: number): void {
  const o = META_STRIDE + slot * BODY_STRIDE;
  const at = (i: number): number => {
    const x = a[o + i] ?? 0;
    return x + ((b[o + i] ?? 0) - x) * k;
  };
  out.posWF.x = at(0);
  out.posWF.y = at(1);
  out.posWF.z = at(2);
  // nlerp: 반대 반구면 부호를 뒤집어 짧은 쪽으로.
  const dot =
    (a[o + 3] ?? 0) * (b[o + 3] ?? 0) +
    (a[o + 4] ?? 0) * (b[o + 4] ?? 0) +
    (a[o + 5] ?? 0) * (b[o + 5] ?? 0) +
    (a[o + 6] ?? 0) * (b[o + 6] ?? 1);
  const s = dot < 0 ? -1 : 1;
  const q = [3, 4, 5, 6].map((i) => (a[o + i] ?? 0) * (1 - k) + s * (b[o + i] ?? 0) * k);
  const n = Math.hypot(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1) || 1;
  out.quat.x = (q[0] ?? 0) / n;
  out.quat.y = (q[1] ?? 0) / n;
  out.quat.z = (q[2] ?? 0) / n;
  out.quat.w = (q[3] ?? 1) / n;
  out.linVel.x = at(7);
  out.linVel.y = at(8);
  out.linVel.z = at(9);
  const flags = Math.trunc(b[o + 13] ?? 0);
  out.grounded = (flags & BODY_GROUNDED) !== 0;
  out.escalator = (flags & BODY_ESCALATOR) !== 0;
  out.groundMaterial = b[o + 14] ?? 0;
}

function farApart(a: Float64Array, b: Float64Array, slot: number): boolean {
  const o = META_STRIDE + slot * BODY_STRIDE;
  const d = Math.hypot((b[o] ?? 0) - (a[o] ?? 0), (b[o + 1] ?? 0) - (a[o + 1] ?? 0), (b[o + 2] ?? 0) - (a[o + 2] ?? 0));
  return d > SNAP_DISTANCE_M;
}

export function createSnapshotHistory(): SnapshotHistory {
  const frames: Float64Array[] = [];
  return {
    push(frame) {
      const copy = new Float64Array(frame);
      const last = frames[frames.length - 1];
      if (last && last[0] === copy[0]) frames[frames.length - 1] = copy;
      else frames.push(copy);
      if (frames.length > CAPACITY) frames.shift();
    },
    get latest() {
      return frames[frames.length - 1];
    },
    sample(slot, handle, tS, out) {
      // 시각 순 — 뒤에서부터 tS 이하인 첫 프레임 a와 그다음 b.
      let bi = frames.length - 1;
      while (bi > 0 && (frames[bi - 1]?.[0] ?? 0) >= tS) bi--;
      const b = frames[bi];
      if (!b || !alive(b, slot, handle)) return false;
      const a = bi > 0 ? frames[bi - 1] : undefined;
      if (!a || !alive(a, slot, handle) || farApart(a, b, slot)) {
        write(out, b, b, slot, 1);
        return true;
      }
      const ta = a[0] ?? 0;
      const tb = b[0] ?? 0;
      const k = tb > ta ? Math.min(Math.max((tS - ta) / (tb - ta), 0), 1) : 1;
      write(out, a, b, slot, k);
      return true;
    },
  };
}

/** SAB 최신 프레임을 dst로 복사(seqlock: 복사 중 두 번 이상 바뀌면 재시도). 새 seq면 반환, 아니면 null. */
export function readSab(
  header: Int32Array,
  frames: readonly Float64Array[],
  lastSeq: number,
  dst: Float64Array,
): number | null {
  for (let attempt = 0; attempt < 4; attempt++) {
    const seq = Atomics.load(header, H_SEQ);
    if (seq === lastSeq) return null;
    const idx = Atomics.load(header, H_WRITE_INDEX);
    dst.set((frames[idx] as Float64Array).subarray(0, FRAME_F64));
    // 복사 동안 워커는 반대 버퍼에 한 번 쓸 수 있다(seq + 1). 두 번이면 이 버퍼가 덮였을 수 있다.
    if (Atomics.load(header, H_SEQ) - seq < 2) return seq;
  }
  return null;
}
