// 전역 이벤트 목록(EventMap) 단일 정의 파일. 이벤트 추가는 여기서만. see docs/01-architecture.md §6
import type { CellKey, ModeId, QualityTier, Vec3d, WeatherParams } from './api.ts';

/** 이벤트 이름 → payload. 이름 규칙 `'domain/verb-past'` (docs/15-conventions.md §3). */
export interface EventMap {
  /** 셀 준비됨(키만). payload는 `streaming.onReady` 콜백으로 단 한 번 소유권 이전. 발행: streaming */
  'cell/ready': { key: CellKey };
  /** 발행: streaming */
  'cell/evicted': { key: CellKey };
  /** 렌더 원점 재설정(WF). 발행: render */
  'origin/rebased': { oldOrigin: Vec3d; newOrigin: Vec3d };
  /** 발행: traversal */
  'mode/changed': { from: ModeId; to: ModeId };
  /** 발행: sim(poi) */
  'poi/discovered': { poiId: string };
  /** 게임 시각 점프(Unix ms). 발행: clock */
  'time/jumped': { gameTimeMs: number };
  /** 발행: sim(weather) */
  'weather/changed': { params: WeatherParams };
  /** 발행: ui/settings */
  'quality/changed': { tier: QualityTier };
}
export type EventName = keyof EventMap;
