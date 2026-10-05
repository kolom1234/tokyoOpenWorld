// @sanpo/tile-format 공개 계약 — global/rail.bin(05 §9, M07-T01 — ADR-0070). api.ts가 재수출한다(api.ts 400줄 제한으로 분리).

/** rail.bin 매직 "RAIL"(u32 LE)·버전. */
export const RAIL_MAGIC = 0x4c49_4152;
export const RAIL_VERSION = 1;
/** 표본 플래그(비트): 터널(그리지 않음)·교량·승강장 옆. */
export const RAIL_FLAG = { tunnel: 1, bridge: 2, platform: 4 } as const;

export interface RailLineMeta {
  id: string;
  name: { ja: string; en: string };
  /** 노선색 #rrggbb(차체 띠만). */
  color: string;
  kind: 'jr' | 'metro' | 'private';
  /** 플레이어 탑승 가능(MVP = 야마노테만). */
  rideable: boolean;
  maxSpeedKmh: number;
  gaugeM: number;
  formation: { cars: number; carLengthM: number };
}

export interface RailStopMeta {
  station: string;
  /** 정차 위치(m, 선로 s — 편성 중심이 오는 곳 = 승강장 가운데). */
  s: number;
  /** 문 쪽: 진행 방향 왼쪽 'L'·오른쪽 'R'. */
  side: 'L' | 'R';
  platformLengthM: number;
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
  name: { ja: string; en: string };
  /** WF 대표 위치(정차 위치 평균). */
  posWF: [number, number, number];
  /** MVP 경계역(자동 하차). */
  mvpEdge: boolean;
}

export interface RailNetwork {
  lines: RailLineMeta[];
  tracks: RailTrackMeta[];
  stations: RailStationMeta[];
  /** 표본 WF xyz(레일 윗면 중심선) × 점 수. */
  points: Float32Array;
  /** 표본 제한속도(m/s, 곡률 — 노선 최고 이하). */
  speed: Float32Array;
  /** 표본 RAIL_FLAG 비트. */
  flags: Uint8Array;
}
