// 지도 보기 수학(M10-T03): 메르카토르 정규 좌표(0…1) ↔ 화면 px, 줌(실수 — 월드 폭 = 256·2^zoom px), 회전(라디안, 시계 = +). 순수 함수(테스트).
export interface MapView {
  /** 화면 가운데의 메르카토르 정규 좌표. */
  cx: number;
  cy: number;
  zoom: number;
  /** 화면 회전(라디안). 0 = 북쪽 위. */
  rotation: number;
  /** 화면(CSS px). */
  w: number;
  h: number;
}

export const worldPx = (zoom: number): number => 256 * 2 ** zoom;

/** 메르카토르 → 화면 px. */
export function toScreen(v: MapView, mx: number, my: number): [number, number] {
  const s = worldPx(v.zoom);
  const dx = (mx - v.cx) * s;
  const dy = (my - v.cy) * s;
  const c = Math.cos(v.rotation);
  const n = Math.sin(v.rotation);
  return [v.w / 2 + dx * c - dy * n, v.h / 2 + dx * n + dy * c];
}

/** 화면 px → 메르카토르. */
export function toMerc(v: MapView, sx: number, sy: number): [number, number] {
  const s = worldPx(v.zoom);
  const dx = sx - v.w / 2;
  const dy = sy - v.h / 2;
  const c = Math.cos(-v.rotation);
  const n = Math.sin(-v.rotation);
  return [v.cx + (dx * c - dy * n) / s, v.cy + (dx * n + dy * c) / s];
}

/** 보기에 걸치는 타일(z) 범위 — 회전을 고려해 화면 대각선 반경으로. */
export function tilesInView(v: MapView, z: number): { x: number; y: number }[] {
  const n = 2 ** z;
  const r = Math.hypot(v.w, v.h) / 2 / worldPx(v.zoom);
  const x0 = Math.floor((v.cx - r) * n);
  const x1 = Math.floor((v.cx + r) * n);
  const y0 = Math.floor((v.cy - r) * n);
  const y1 = Math.floor((v.cy + r) * n);
  const out: { x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < n && y < n) out.push({ x, y });
  return out;
}

/** 줌 → 그릴 타일 줌(데이터 범위로 자르고, 넘으면 확대해서 쓴다). */
export const tileZoomFor = (zoom: number, minZ: number, maxZ: number): number =>
  Math.max(minZ, Math.min(maxZ, Math.round(zoom)));

/** 축척 막대 m/px(위도 보정). */
export function metersPerPx(v: MapView): number {
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * v.cy)));
  return (40_075_016.7 * Math.cos(lat)) / worldPx(v.zoom);
}
