// 일본 공휴일 표(10 §2, M09-T05): content/sim/holidays-jp.json(법 규칙 생성 2026–2035)을 createSim이 등록 → 운행일 요일 유형(dayTypeOf)이 휴일로 본다.
// 모듈 전역 표(sim 서비스는 하나) — 테스트는 setHolidays([])로 비운다. 표 밖 연도는 일요일만 휴일.

const JST_MS = 9 * 3_600_000;
let table: ReadonlySet<string> = new Set();

/** YYYY-MM-DD(JST) 목록 등록(이전 표를 대체). */
export function setHolidays(dates: Iterable<string>): void {
  table = new Set(dates);
}

/** 운행일 시각(ms — 이미 04:00 경계를 뺀 값)의 JST 날짜가 공휴일인가. */
export function isHolidayJst(msShifted: number): boolean {
  if (table.size === 0) return false;
  return table.has(new Date(msShifted + JST_MS).toISOString().slice(0, 10));
}
