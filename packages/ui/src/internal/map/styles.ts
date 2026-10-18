// 지도 스타일(M10-T03, 12 §3): 레이어 순서 = 수면 → 공원 → 건물 → 도로(등급별 폭) → 철도 → (라벨·역·POI는 화면 위 겹쳐 그림). 밝은 종이 색 — 어두운 UI 위에서 읽힘.
export const MAP_BG = '#efece6';

export const LAYER_ORDER = ['water', 'park', 'building', 'road', 'rail'] as const;

export interface PolyStyle {
  fill: string;
  stroke?: string;
}
export interface LineStyle {
  /** 타일 512 px 기준 선 폭(px) — 줌에 따라 배율. */
  width: number;
  color: string;
  casing?: string;
  dash?: number[];
}

export const POLY: Readonly<Record<string, PolyStyle>> = {
  water: { fill: '#a9cfe8' },
  park: { fill: '#cfe5bd' },
  building: { fill: '#dcd5cd', stroke: '#c3b9ae' },
};

export const ROAD: Readonly<Record<string, LineStyle>> = {
  major: { width: 9, color: '#fbd9a4', casing: '#d8b27d' },
  medium: { width: 7, color: '#ffffff', casing: '#c9c2b8' },
  minor: { width: 4.5, color: '#ffffff', casing: '#d6d0c7' },
  path: { width: 2, color: '#b9a99a', dash: [4, 3] },
};

export const RAIL: Readonly<Record<string, LineStyle>> = {
  jr: { width: 4, color: '#5b5b5b', casing: '#ffffff', dash: [10, 8] },
  metro: { width: 3, color: '#8a6fb5', dash: [6, 6] },
  private: { width: 3, color: '#6b6b6b', dash: [8, 6] },
};

/** 낮은 줌에서 선 폭을 줄인다(타일 줌 z 기준). */
export const widthScale = (z: number): number => (z >= 16 ? 1 : z === 15 ? 0.75 : z === 14 ? 0.55 : 0.4);

export const LABEL = {
  place: { font: '600 13px system-ui,sans-serif', color: '#5c4f43', halo: 'rgba(255,255,255,.85)' },
  station: { font: '700 14px system-ui,sans-serif', color: '#1f2a44', halo: 'rgba(255,255,255,.9)' },
};
