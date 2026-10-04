// @sanpo/sim 공개 계약. M03-T03: 월드 시계 + 천문(태양·달 → EnvironmentState). M06-T01: sim.worker(30 Hz) + SAB 보행자 인스턴스 버퍼.
// 날씨·교통·열차는 M06·M07·M09.
// see docs/modules/sim.md, docs/10-simulation.md §2·§8
import type {
  EnvironmentState,
  EventBus,
  Logger,
  SharedInstanceBuffer,
  SystemProvider,
  Vec3d,
  WorkerSupervisor,
} from '@sanpo/core';

/** 군중 조정값(content/sim/crowd.json — game이 읽어 넘김). */
export interface CrowdParams {
  /** 보행 주기 길이(m): 걷기 위상 = 이동 거리 ÷ 주기. */
  gaitCycleM: number;
  /** 대기·휴대폰 클립 반복 길이(s). */
  idleLoopS: number;
  /** M06-T01 더미 원형 걷기(수락 장면). */
  dummy: { count: number; minRadiusM: number; maxRadiusM: number; idleShare: number; phoneShare: number };
}

/** sim.worker 상태(디버그·성능 표). */
export interface SimWorkerStats {
  tickMs: number;
  maxTickMs: number;
  count: number;
  ticks: number;
}

export type DayType = 'weekday' | 'saturday' | 'holiday';
export type TimeScale = 1 | 2 | 10 | 60;

/** 10 §2: realtime = 현실 시각 동기, custom = 시작 시각 + 배속, frozen = 고정(포토모드·골든뷰). */
export type ClockMode =
  | { kind: 'realtime' }
  | { kind: 'custom'; startMs: number; scale: TimeScale }
  | { kind: 'frozen'; atMs: number };

export interface WorldClock {
  /** 게임 시각(Unix ms, UTC 순간). 표시는 Asia/Tokyo. */
  readonly gameTimeMs: number;
  /** frozen이면 0. */
  readonly timeScale: number;
  readonly mode: ClockMode['kind'];
  /** 운행일(04:00 JST 경계) 기준 요일 유형. M03은 일요일 = holiday(공휴일 표는 M06). */
  readonly dayType: DayType;
  setMode(m: ClockMode): void;
  setTimeScale(s: TimeScale): void;
  jumpTo(ms: number): void;
}

export interface SimService extends SystemProvider {
  readonly clock: WorldClock;
  /** 현재 시각·관측 위치(카메라 WF)의 환경 — render·audio가 소비. 같은 시각·1 km 안이면 캐시. */
  environment(): EnvironmentState;
  /**
   * sim.worker 시작(M06-T01, 10 §1): 30 Hz 틱이 보행자 SAB 인스턴스 버퍼(stride 8)를 게시한다. 반환 = pedestrians 버퍼
   * (SAB 불가 = undefined). 두 번째 호출은 기존 버퍼를 돌려준다.
   */
  startWorker(o: {
    supervisor: WorkerSupervisor;
    crowd: CrowdParams;
    centerWF: Vec3d;
  }): SharedInstanceBuffer | undefined;
  /** 워커 틱 통계(시작 전 undefined). */
  workerStats(): SimWorkerStats | undefined;
}

export interface SimDeps {
  bus: EventBus;
  log: Logger;
  /** 현실 시계(ms). 테스트 주입용. */
  now?: () => number;
  initialClock?: ClockMode;
}
