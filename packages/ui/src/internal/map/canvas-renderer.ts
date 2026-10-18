// 지도 보기 그리기(M10-T03): 캐시 비트맵(타일 줌 = 보기 줌 반올림, 범위 밖은 확대) drawImage — 없는 타일은 부모 타일 일부로 대신. 그다음 화면 정렬 라벨(겹침 제거)·표식·플레이어 화살표.
// 미니맵(원형·10 Hz)과 전체 지도(팬·줌 60 fps)가 같이 쓴다. 매 호출 할당 최소(라벨 배열만).
import type { LocalName } from '../../api.ts';
import { pick } from '../i18n/t.ts';
import { LABEL, MAP_BG } from './styles.ts';
import type { MapLabel, RasterTile, TileCache } from './tile-cache.ts';
import { type MapView, tilesInView, tileZoomFor, toScreen, worldPx } from './view.ts';

export interface MapMarker {
  id: string;
  mx: number;
  my: number;
  kind: 'station' | 'place' | 'poi' | 'poi-unknown';
  label?: LocalName;
  active: boolean;
  selected?: boolean;
}

export interface DrawOptions {
  minZoom: number;
  maxZoom: number;
  player?: { mx: number; my: number; yawRad: number };
  markers?: readonly MapMarker[];
  /** 지명 라벨(전체 지도 토글). */
  placeLabels: boolean;
  /** 역 라벨·철도. */
  stationLabels: boolean;
}

function parentDraw(
  ctx: CanvasRenderingContext2D,
  cache: TileCache,
  z: number,
  x: number,
  y: number,
  minZ: number,
  S: number,
  dx: number,
  dy: number,
): void {
  for (let pz = z - 1, k = 2; pz >= minZ; pz--, k *= 2) {
    const px = Math.floor(x / k);
    const py = Math.floor(y / k);
    const t: RasterTile | undefined = cache.peek(pz, px, py);
    if (!t) continue;
    const sub = t.canvas.width / k;
    ctx.drawImage(t.canvas as CanvasImageSource, (x - px * k) * sub, (y - py * k) * sub, sub, sub, dx, dy, S, S);
    return;
  }
}

/** 타일 비트맵을 회전된 보기로. 반환 = 보인 타일 라벨들. */
function drawTiles(ctx: CanvasRenderingContext2D, v: MapView, cache: TileCache, o: DrawOptions): MapLabel[] {
  const tz = tileZoomFor(v.zoom, o.minZoom, o.maxZoom);
  const n = 2 ** tz;
  const S = worldPx(v.zoom) / n;
  const W = worldPx(v.zoom);
  const labels: MapLabel[] = [];
  ctx.save();
  ctx.translate(v.w / 2, v.h / 2);
  ctx.rotate(v.rotation);
  for (const { x, y } of tilesInView(v, tz)) {
    const dx = (x / n - v.cx) * W;
    const dy = (y / n - v.cy) * W;
    const t = cache.get(tz, x, y);
    // 이음새 틈 방지 0.5 px 겹침.
    if (t) {
      ctx.drawImage(t.canvas as CanvasImageSource, dx, dy, S + 0.5, S + 0.5);
      for (const l of t.labels) labels.push(l);
    } else parentDraw(ctx, cache, tz, x, y, o.minZoom, S + 0.5, dx, dy);
  }
  ctx.restore();
  return labels;
}

function haloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  halo: string,
): void {
  ctx.font = font;
  ctx.lineWidth = 3;
  ctx.strokeStyle = halo;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** 라벨(역 우선, 겹치면 생략 — 40 px 격자). */
function drawLabels(ctx: CanvasRenderingContext2D, v: MapView, labels: readonly MapLabel[], o: DrawOptions): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const taken = new Set<string>();
  const sorted = [...labels].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'station' ? -1 : 1));
  for (const l of sorted) {
    if (l.kind === 'place' && (!o.placeLabels || v.zoom < 14.5)) continue;
    if (l.kind === 'station' && !o.stationLabels) continue;
    const [x, y] = toScreen(v, l.mx, l.my);
    if (x < -40 || y < -20 || x > v.w + 40 || y > v.h + 20) continue;
    const cell = `${Math.round(x / 70)},${Math.round(y / 26)}`;
    if (taken.has(cell)) continue;
    taken.add(cell);
    const st = LABEL[l.kind];
    if (l.kind === 'station') {
      ctx.fillStyle = '#1f2a44';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      haloText(ctx, pick(l.name), x, y - 14, st.font, st.color, st.halo);
    } else haloText(ctx, pick(l.name), x, y, st.font, st.color, st.halo);
  }
}

const MARKER_COLOR: Readonly<Record<MapMarker['kind'], string>> = {
  station: '#1f6feb',
  place: '#e8590c',
  poi: '#2b8a3e',
  'poi-unknown': '#9a9a9a',
};

function drawMarkers(ctx: CanvasRenderingContext2D, v: MapView, ms: readonly MapMarker[]): void {
  for (const m of ms) {
    const [x, y] = toScreen(v, m.mx, m.my);
    if (x < -20 || y < -20 || x > v.w + 20 || y > v.h + 20) continue;
    const r = m.selected ? 9 : 6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = m.active ? MARKER_COLOR[m.kind] : '#9a9a9a';
    ctx.fill();
    ctx.lineWidth = m.selected ? 3 : 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (m.label && m.selected)
      haloText(ctx, pick(m.label), x, y - 18, LABEL.station.font, '#111', 'rgba(255,255,255,.95)');
  }
}

/** 플레이어 화살표(시선 방향 — yaw +Y 반시계, 0 = 북). */
function drawPlayer(ctx: CanvasRenderingContext2D, v: MapView, p: NonNullable<DrawOptions['player']>): void {
  const [x, y] = toScreen(v, p.mx, p.my);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(v.rotation - p.yawRad);
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(7, 8);
  ctx.lineTo(0, 4);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fillStyle = '#e8590c';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
}

export function drawMap(ctx: CanvasRenderingContext2D, v: MapView, cache: TileCache, o: DrawOptions): void {
  ctx.fillStyle = MAP_BG;
  ctx.fillRect(0, 0, v.w, v.h);
  const labels = drawTiles(ctx, v, cache, o);
  drawLabels(ctx, v, labels, o);
  if (o.markers) drawMarkers(ctx, v, o.markers);
  if (o.player) drawPlayer(ctx, v, o.player);
}
