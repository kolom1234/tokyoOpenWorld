// @sanpo/tile-format 공개 계약 — global/rail.bin(05 §9, M07-T01 — ADR-0070). api.ts가 재수출한다(api.ts 400줄 제한으로 분리).

/** rail.bin 매직 "RAIL"(u32 LE)·버전. */
export const RAIL_MAGIC = 0x4c49_4152;
export const RAIL_VERSION = 1;
/** 표본 플래그(비트): 터널(그리지 않음)·교량·승강장 옆. */
export const RAIL_FLAG = { tunnel: 1, bridge: 2, platform: 4 } as const;

export interface RailLineMeta {
  id: string;
  /** 이름(ko = 한국어 — 차내 안내 화면, M07-T05). */
  name: { ja: string; en: string; ko?: string };
  /** 노선색 #rrggbb(차체 띠만). */
  color: string;
  kind: 'jr' | 'metro' | 'private';
  /** 플레이어 탑승 가능(MVP = 야마노테만). */
  rideable: boolean;
  maxSpeedKmh: number;
  gaugeM: number;
  formation: { cars: number; carLengthM: number };
  /** 제3궤조 집전(가선·가선주·팬터그래프 없음 — 긴자선, M07-T03). 없으면 가공 전차선. */
  thirdRail?: boolean;
}

export interface RailStopMeta {
  station: string;
  /** 정차 위치(m, 선로 s — 편성 중심이 오는 곳 = 승강장 가운데). */
  s: number;
  /** 문 쪽: 진행 방향 왼쪽 'L'·오른쪽 'R'. */
  side: 'L' | 'R';
  platformLengthM: number;
  /** 승강장(RailNetwork.platforms 번호, M07-T04). 옛 파일은 없음. */
  platform?: number;
}

/** 승강장(M07-T04): OSM 승강장 윤곽(WF xz 닫힌 고리 — 선 승강장은 선로 반대쪽으로 3 m 두께를 준 고리)·윗면 높이(레일 윗면 + 1.1 m). */
export interface RailPlatformMeta {
  id: string;
  ringXZ: number[];
  topY: number;
}

export interface RailTrackMeta {
  id: string;
  line: string;
  /** 진행 방향 이름(노선 정의 — 야마노테 'outer'·'inner'). */
  heading: string;
  /** 표본 범위(점 단위) — 표본 k의 s = k × stepM(마지막 = lengthM). 점 순서 = 진행 방향. */
  ptOffset: number;
  ptCount: number;
  lengthM: number;
  stepM: number;
  stops: RailStopMeta[];
}

export interface RailStationMeta {
  id: string;
  /** 이름(ko = 한국어 — 차내 안내 화면, M07-T05). */
  name: { ja: string; en: string; ko?: string };
  /** WF 대표 위치(정차 위치 평균). */
  posWF: [number, number, number];
  /** MVP 경계역(자동 하차). */
  mvpEdge: boolean;
}

export interface RailNetwork {
  lines: RailLineMeta[];
  tracks: RailTrackMeta[];
  stations: RailStationMeta[];
  /** 승강장(M07-T04 — 정차 platform 번호가 가리킨다). 옛 파일 = 빈 배열. */
  platforms: RailPlatformMeta[];
  /** 표본 WF xyz(레일 윗면 중심선) × 점 수. */
  points: Float32Array;
  /** 표본 제한속도(m/s, 곡률 — 노선 최고 이하). */
  speed: Float32Array;
  /** 표본 RAIL_FLAG 비트. */
  flags: Uint8Array;
}

// ── global/timetables/<lineId>.json·index.json (M07-T02, ADR-0071 — 05 §9, schemas/timetable.schema.json) ──

export const TIMETABLE_SCHEMA = 1;
/** 운행일 경계(초, 0시 기준) — 시각 = 운행일 0시부터 초(04:00 = 14400, 24:00 넘김 허용 — GTFS와 같다). */
export const SERVICE_DAY_START_S = 14_400;
export type TimetableDay = 'weekday' | 'saturday' | 'holiday';

export interface TimetableStop {
  station: string;
  /** 정차 위치(m, 선로 s — rail.bin 정차와 같다). */
  s: number;
  arrS: number;
  depS: number;
}

export interface TimetableTrip {
  id: string;
  /** 운행 계통(routes[].id — 사이쿄·쇼난신주쿠 등). */
  route: string;
  track: string;
  /** 진행 방향 이름(= 선로 heading). */
  dir: string;
  cars: number;
  carLengthM: number;
  /** 편성 중심 s 범위(m) — from = 첫 정차면 시발, to = 마지막 정차면 종착, 아니면 영역 밖과 이어진 통과. */
  from: number;
  to: number;
  /** from에 있는 시각·to에 닿는 시각(운행일 초). */
  enterS: number;
  exitS: number;
  stops: TimetableStop[];
}

export interface TimetableRoute {
  id: string;
  /** 이름(ko = 한국어 — 차내 안내 화면, M07-T05). */
  name: { ja: string; en: string; ko?: string };
  color: string;
}

/** 요일 묶음(평일·토휴일 등) 하나의 트립(enterS 오름차순). */
export interface TimetableCalendar {
  id: string;
  days: TimetableDay[];
  trips: TimetableTrip[];
}

export interface TimetableFile {
  schema: 1;
  line: string;
  /** synthetic = 근사 시간표(실측 아님 — 크레딧 명시, ADR-0008), gtfs = 사업자 GTFS 컴파일. */
  source: 'synthetic' | 'gtfs';
  approximate: boolean;
  routes: TimetableRoute[];
  calendars: TimetableCalendar[];
}

export interface TimetableIndexFile {
  schema: 1;
  lines: { line: string; file: string; source: 'synthetic' | 'gtfs'; approximate: boolean; trips: number }[];
}
