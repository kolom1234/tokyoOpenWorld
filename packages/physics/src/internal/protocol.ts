// 메인 ↔ 물리 워커 프로토콜(08 §9): 명령 묶음·스냅샷 배치. 메인·워커 공용 — Jolt 타입 없음.
// 스냅샷 = 헤더 Int32[16] + 버퍼 2개 × (메타 f64[8] + 바디 f64[MAX_BODIES × 16]). 워커가 비활성 버퍼에 쓰고 writeIndex 교체 + seq 증가(seqlock).
import type { CellKey, Vec3, Vec3d } from '@sanpo/core';
import type { HeightfieldData } from '@sanpo/tile-format';

export const MAX_BODIES = 128;
/** posWF(3), quat(4), linVel(3), angVel(3), flags, groundMat, reserved. */
export const BODY_STRIDE = 16;
/** simTimeS, stepIndex, bodyCount(슬롯 상한), tickMs, 콜라이더 남은 작업, 콜라이더 셀 수, 적재 틱 최대 ms, 8 ms 초과 적재 틱 수. */
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
/** 캐릭터가 에스컬레이터 구간 안(08 §5). */
export const BODY_ESCALATOR = 8;

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
  | { c: 'teleport'; h: number; posWF: Vec3d; yaw: number }
  /** 도보 캐릭터(08 §5) 생성 — 위치 = 발(WF). */
  | { c: 'character'; h: number; posWF: Vec3d; yaw: number }
  /** 원하는 수평 속도(m/s, WF)·방향(yaw — 아바타). */
  | { c: 'charInput'; h: number; moveWF: Vec3; yaw?: number; hold?: boolean }
  /** 앵커 재설정(08 §2): 모든 바디·캐릭터·구간을 −Δ 이동, 브로드페이즈 최적화. */
  | { c: 'rebase'; anchorWF: Vec3d }
  | { c: 'removeCell'; key: CellKey };

/** 레이캐스트 결과(WF). */
export interface RayHitMsg {
  posWF: Vec3d;
  normal: Vec3;
  distance: number;
  /** ObjectLayer(08 §3). */
  layer: number;
  /** JCOL 재질(바디 userData). */
  material: number;
}

export type ToWorker =
  | {
      t: 'init';
      /** 격리면 스냅샷 SAB, 아니면 null(폴백). */
      sab: SharedArrayBuffer | null;
      anchorWF: Vec3d;
      stepHz: number;
      maxSteps: number;
      /** 셀 콜라이더 적재 틱 예산(ms, 08 §4). */
      cellBudgetMs: number;
    }
  /** 셀 콜라이더(버퍼는 Transferable). 적재는 step 틱마다 예산 안에서. */
  | { t: 'addCell'; key: CellKey; originWF: Vec3d; jcol?: ArrayBuffer; hf?: HeightfieldData }
  | { t: 'ray'; id: number; originWF: Vec3d; dir: Vec3; maxDist: number }
  /** 구 캐스트(카메라 충돌, 08 §10) — 결과는 rayHit(같은 id). */
  | { t: 'sphere'; id: number; originWF: Vec3d; dir: Vec3; radius: number; maxDist: number }
  /** 메인 시계 targetS까지 고정 스텝(명령은 첫 스텝 전에 적용). */
  | { t: 'step'; targetS: number; cmds: Command[] }
  | { t: 'dispose' };

export type FromWorker =
  | { t: 'ready'; build: 'multithread' | 'single'; initMs: number }
  /** 폴백 스냅샷(한 버퍼 — FRAME_F64). */
  | { t: 'snapshot'; frame: Float64Array }
  | { t: 'cellLoaded'; key: CellKey }
  | { t: 'rayHit'; id: number; hit: RayHitMsg | null }
  /** 경고(치명적이지 않음). 치명적 오류는 core `WorkerErrorMessage`(감독자가 재시작). */
  | { t: 'warn'; message: string };
