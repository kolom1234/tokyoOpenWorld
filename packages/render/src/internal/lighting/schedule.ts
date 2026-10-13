// 야간 점등 일정(M09-T03 — ADR-0078, 07 §5-5): 시각(JST)·요일 유형 → 파사드 클래스별 창 점등 비율, lights.bin 일정 → 켜짐 비율, 태양 고도 → 밤 정도.
// 표 = 도쿄 생활 리듬 근사(사무 9–18시 근무·잔업 22시까지 감소, 주거 저녁 18–23시 피크, 상업 영업 10–22시). 실측 아님 — 가상.
import { LIGHT_SCHEDULE } from '@sanpo/tile-format';

export type DayKind = 'weekday' | 'saturday' | 'holiday';

/** 파사드 클래스(07 §5 `_FACADE.x`: 0 오피스·1 맨션·2 주택·3 상업·4 공공·5 공업) × 24시(0–23 JST) 평일 점등 비율. */
const WEEKDAY: readonly (readonly number[])[] = [
  // 0    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23
  [
    0.05, 0.04, 0.03, 0.03, 0.03, 0.04, 0.1, 0.3, 0.6, 0.85, 0.88, 0.88, 0.8, 0.88, 0.88, 0.88, 0.88, 0.85, 0.75, 0.6,
    0.45, 0.32, 0.2, 0.1,
  ],
  [
    0.22, 0.12, 0.06, 0.05, 0.05, 0.08, 0.25, 0.35, 0.22, 0.14, 0.12, 0.12, 0.14, 0.12, 0.12, 0.14, 0.2, 0.35, 0.55,
    0.7, 0.75, 0.72, 0.6, 0.42,
  ],
  [
    0.18, 0.1, 0.05, 0.04, 0.04, 0.08, 0.28, 0.35, 0.2, 0.12, 0.1, 0.1, 0.12, 0.1, 0.1, 0.12, 0.2, 0.38, 0.6, 0.72,
    0.72, 0.66, 0.5, 0.32,
  ],
  [
    0.12, 0.08, 0.06, 0.05, 0.05, 0.05, 0.08, 0.25, 0.4, 0.6, 0.88, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.88, 0.85,
    0.75, 0.5, 0.28,
  ],
  [
    0.03, 0.03, 0.03, 0.03, 0.03, 0.03, 0.05, 0.2, 0.6, 0.82, 0.85, 0.85, 0.8, 0.85, 0.85, 0.85, 0.8, 0.6, 0.35, 0.2,
    0.1, 0.06, 0.04, 0.03,
  ],
  [
    0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.15, 0.3, 0.45, 0.5, 0.5, 0.5, 0.45, 0.5, 0.5, 0.5, 0.5, 0.45, 0.3, 0.2, 0.15,
    0.12, 0.12, 0.12,
  ],
];

/** 토·휴일 배율(사무·공공·공업은 출근이 적고, 주거는 낮에도 사람이 있다). */
const DAY_SCALE: Readonly<Record<DayKind, readonly number[]>> = {
  weekday: [1, 1, 1, 1, 1, 1],
  saturday: [0.4, 1.15, 1.15, 1.05, 0.35, 0.6],
  holiday: [0.22, 1.2, 1.2, 1, 0.12, 0.35],
};

/** 주말 주거 낮 시간 최소(집에 사람이 있다). */
const WEEKEND_HOME_DAY_MIN = 0.22;

const JST_MS = 9 * 3_600_000;

/** 게임 시각 → JST 시(실수, 0–24). */
export function hourJst(ms: number): number {
  return ((((ms + JST_MS) / 3_600_000) % 24) + 24) % 24;
}

/** 클래스별 점등 비율(0–1, 시 단위 선형 보간). */
export function windowLitFractions(ms: number, day: DayKind): number[] {
  const h = hourJst(ms);
  const h0 = Math.floor(h) % 24;
  const h1 = (h0 + 1) % 24;
  const t = h - Math.floor(h);
  return WEEKDAY.map((row, c) => {
    const v = ((row[h0] as number) * (1 - t) + (row[h1] as number) * t) * (DAY_SCALE[day][c] as number);
    const home = c === 1 || c === 2;
    const weekendDay = day !== 'weekday' && home && h >= 9 && h < 17;
    return Math.min(1, weekendDay ? Math.max(v, WEEKEND_HOME_DAY_MIN) : v);
  });
}

/** 태양 고도(sunDir.y) → 밤 정도 0(낮)..1(밤): 해 지기 직전(+3°)부터 시민 박명 끝(−6°)까지. */
export function nightOf(sunY: number): number {
  const lo = Math.sin((-6 * Math.PI) / 180);
  const hi = Math.sin((3 * Math.PI) / 180);
  const t = Math.min(Math.max((hi - sunY) / (hi - lo), 0), 1);
  return t * t * (3 - 2 * t);
}

/** lights.bin 일정 → 켜짐 비율(0–1). night = 밤 정도, h = JST 시. */
export function scheduleOn(schedule: number, night: number, h: number): number {
  if (schedule === LIGHT_SCHEDULE.always) return 1;
  if (schedule === LIGHT_SCHEDULE.night) return night > 0.15 ? 1 : 0;
  if (schedule === LIGHT_SCHEDULE.shop) {
    const open = h >= 10 && h < 23 ? 0.95 : h >= 7 && h < 10 ? 0.4 : 0.12;
    return night > 0.15 ? open : 0;
  }
  const signs = h >= 17 || h < 1 ? 0.95 : h < 4 ? 0.35 : 0.15;
  return night > 0.15 ? signs : 0;
}

/** 색온도(K) → 선형 RGB(근사, Tanner Helland 식의 정규화 — 6600 K ≈ 흰색). */
export function kelvinRgb(k: number): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305;
  const lin = (v: number) => (Math.min(Math.max(v, 0), 255) / 255) ** 2.2;
  return [lin(r), lin(g), lin(b)];
}
