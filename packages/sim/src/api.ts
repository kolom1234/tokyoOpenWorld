// @sanpo/sim 공개 계약. M03-T03: 월드 시계 + 천문(태양·달 → EnvironmentState)만. 날씨·군중·교통·열차는 M06·M07·M09.
// see docs/modules/sim.md, docs/10-simulation.md §2·§8
import type { EnvironmentState, EventBus, Logger, SystemProvider } from '@sanpo/core';

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
}

export interface SimDeps {
  bus: EventBus;
  log: Logger;
  /** 현실 시계(ms). 테스트 주입용. */
  now?: () => number;
  initialClock?: ClockMode;
}
