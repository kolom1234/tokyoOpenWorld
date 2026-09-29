// 메인 ↔ 물리 워커 프로토콜(08 §9): 명령 묶음·스냅샷 배치. 메인·워커 공용 — Jolt 타입 없음.
// 스냅샷 = 헤더 Int32[16] + 버퍼 2개 × (메타 f64[8] + 바디 f64[MAX_BODIES × 16]). 워커가 비활성 버퍼에 쓰고 writeIndex 교체 + seq 증가(seqlock).
import type { Vec3, Vec3d } from '@sanpo/core';

export const MAX_BODIES = 128;
/** posWF(3), quat(4), linVel(3), angVel(3), flags, groundMat, reserved. */
export const BODY_STRIDE = 16;
/** simTimeS, stepIndex, bodyCount(슬롯 상한), tickMs, reserved×4. */
export const META_STRIDE = 8;
export const HEADER_INTS = 16;
/** 헤더 인덱스. */
export const H_WRITE_INDEX = 0;
export const H_SEQ = 1;

/** 한 버퍼(메타 + 바디) 크기(f64 개수). postMessage 폴백은 이 한 덩어리를 보낸다. */
export const FRAME_F64 = META_STRIDE + MAX_BODIES * BODY_STRIDE;
export const SNAPSHOT_BYTES = HEADER_INTS * 4 + 2 * FRAME_F64 * 8;

/** 바디 플래그(f64로 저장, 비트는 정수 부분). */
export const BODY_ALIVE = 1;
export const BODY_ACTIVE = 2;
export const BODY_GROUNDED = 4;

/** 격리 여부(SharedArrayBuffer 사용 가능) — 메인·워커 공용(메인 번들에 Jolt를 끌어오지 않게 여기 둔다). */
export function isIsolated(): boolean {
  return (
    (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true &&
    typeof SharedArrayBuffer === 'function'
  );
}

/** 슬롯 = 핸들 하위 7비트, 세대 = 나머지(재사용 슬롯의 옛 핸들 무시). */
export const SLOT_BITS = 7;
export const slotOf = (h: number): number => h & (MAX_BODIES - 1);

export type Command =
  | { c: 'box'; h: number; posWF: Vec3d; half: Vec3; dynamic: boolean }
  | { c: 'despawn'; h: number }
  | { c: 'teleport'; h: number; posWF: Vec3d; yaw: number };

export type ToWorker =
  | {
      t: 'init';
      /** 격리면 스냅샷 SAB, 아니면 null(폴백). */
      sab: SharedArrayBuffer | null;
      anchorWF: Vec3d;
      stepHz: number;
      maxSteps: number;
    }
  /** 메인 시계 targetS까지 고정 스텝(명령은 첫 스텝 전에 적용). */
  | { t: 'step'; targetS: number; cmds: Command[] }
  | { t: 'dispose' };

export type FromWorker =
  | { t: 'ready'; build: 'multithread' | 'single'; initMs: number }
  /** 폴백 스냅샷(한 버퍼 — FRAME_F64). */
  | { t: 'snapshot'; frame: Float64Array }
  /** 경고(치명적이지 않음). 치명적 오류는 core `WorkerErrorMessage`(감독자가 재시작). */
  | { t: 'warn'; message: string };
