// @sanpo/tile-format 공개 계약 — nav.bin 부분(api.ts가 재수출, 400줄 한도로 분리). see docs/05-tile-format.md §4, ADR-0063

// ── nav.bin (05 §4, M06-T03 — ADR-0063). Detour 타일 + 횡단보도 기록 ──

/** nav.bin 매직 "NAVT"(u32 LE)·버전. */
export const NAV_MAGIC = 0x5456414e;
export const NAV_VERSION = 1;
/** 내비 타일 한 변(m) — 셀 256 m = 4 × 4 타일, Detour 타일 좌표 = floor(WF / 64)(원점 0). */
export const NAV_TILE_M = 64;
/** 신호 없는 횡단. */
export const NAV_NO_SIGNAL = 0xffffffff;
/**
 * Detour 폴리곤 area(파이프라인이 굽는 값 — sim 필터·비용과 같은 번호, 추가만): 보도·교통섬 1, 보차 공용 생활도로 2, 횡단보도 3, 그 밖 보행로(광장·공원 길) 4.
 * 폴리곤 flags: bit0 걷기(1·2·4), bit1 횡단(3).
 */
export const NAV_AREA = { sidewalk: 1, street: 2, crossing: 3, open: 4 } as const;
export const NAV_FLAG = { walk: 1, cross: 2 } as const;

/** 횡단보도 1개(WF — 셀 경계를 넘는 횡단은 양쪽 셀에 같은 id로 들어간다). */
export interface NavCrossing {
  /** 끝점 WF id(반올림 좌표 해시) — 셀 간 중복 제거. */
  id: number;
  /** 중심선 양 끝(보도 쪽 연석 너머, WF xyz). */
  a: [number, number, number];
  b: [number, number, number];
  halfWidth: number;
  /** 보행 신호 코드(교차로 ID × 16 + 계획 × 4 + 보행 그룹 — ADR-0062) 또는 NAV_NO_SIGNAL. */
  signal: number;
}
export interface NavTile {
  tx: number;
  tz: number;
  /** dtCreateNavMeshData 결과(Detour 타일 바이트, WF 좌표). */
  data: Uint8Array;
}
export interface NavCellData {
  tiles: NavTile[];
  crossings: NavCrossing[];
}
