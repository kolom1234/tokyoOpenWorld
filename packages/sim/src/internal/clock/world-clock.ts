// 월드 시계(10 §2): realtime / custom(시작 시각 + 배속, 프레임 dtReal 누적) / frozen. 요일 유형은 04:00 JST 운행일 경계.
import type { ClockMode, DayType, TimeScale, WorldClock } from '../../api.ts';

const JST_OFFSET_MS = 9 * 3600_000;
/** 운행일 경계(10 §2): 04:00 JST 이전은 전날 운행일. */
const SERVICE_DAY_START_MS = 4 * 3600_000;

/** 운행일 기준 요일 유형. 공휴일 표(content/sim/holidays-jp.json)는 M06 — 지금은 일요일만 holiday. */
export function dayTypeOf(ms: number): DayType {
  const dow = new Date(ms + JST_OFFSET_MS - SERVICE_DAY_START_MS).getUTCDay();
  if (dow === 0) return 'holiday';
  return dow === 6 ? 'saturday' : 'weekday';
}

export interface ClockCore extends WorldClock {
  /** 프레임마다(phase 10): realtime은 현실 시각, custom은 dtReal × 배속만큼 전진, frozen은 그대로. */
  tick(dtRealS: number): void;
}

function startOf(m: ClockMode, now: () => number): number {
  if (m.kind === 'custom') return m.startMs;
  return m.kind === 'frozen' ? m.atMs : now();
}

export function createWorldClock(now: () => number, initial: ClockMode = { kind: 'realtime' }): ClockCore {
  let mode: ClockMode = initial;
  let t = startOf(initial, now);
  let scale: number = initial.kind === 'custom' ? initial.scale : 1;
  return {
    get gameTimeMs() {
      return t;
    },
    get timeScale() {
      return mode.kind === 'frozen' ? 0 : scale;
    },
    get mode() {
      return mode.kind;
    },
    get dayType() {
      return dayTypeOf(t);
    },
    setMode(m) {
      mode = m;
      t = startOf(m, now);
      scale = m.kind === 'custom' ? m.scale : 1;
    },
    setTimeScale(s: TimeScale) {
      scale = s;
    },
    jumpTo(ms) {
      t = ms;
      if (mode.kind === 'frozen') mode = { kind: 'frozen', atMs: ms };
    },
    tick(dtRealS) {
      if (mode.kind === 'realtime') t = now();
      else if (mode.kind === 'custom') t += dtRealS * 1000 * scale;
    },
  };
}
