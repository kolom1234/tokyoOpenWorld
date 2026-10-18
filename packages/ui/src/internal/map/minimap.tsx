// 미니맵(M10-T03, 12 §2 HUD 오른쪽 아래 원형): HUD 시그널(≤ 10 Hz)이 바뀔 때만 다시 그림 + 대기 타일 1장씩 래스터. 북쪽 고정(기본)·회전(설정).
// 비용 측정: globalThis.__SANPO_UI_STATS__.minimap { draws, ms }(그리기 + 래스터 누적 — 실제 GPU 스크립트가 프레임당 평균을 낸다).
import { useEffect, useRef } from 'preact/hooks';
import type { UiBridge } from '../../api.ts';
import { drawMap, type MapMarker } from './canvas-renderer.ts';
import { createTileCache, type TileCache } from './tile-cache.ts';

const SIZE = 200;
const ZOOM = 16.3;

interface Stats {
  draws: number;
  ms: number;
  rasters: number;
}

export function uiStats(): { minimap: Stats; fullmap: Stats } {
  const g = globalThis as unknown as { __SANPO_UI_STATS__?: { minimap: Stats; fullmap: Stats } };
  if (!g.__SANPO_UI_STATS__)
    g.__SANPO_UI_STATS__ = { minimap: { draws: 0, ms: 0, rasters: 0 }, fullmap: { draws: 0, ms: 0, rasters: 0 } };
  return g.__SANPO_UI_STATS__;
}

export function markersOf(b: UiBridge, all: boolean): MapMarker[] {
  const out: MapMarker[] = [];
  for (const p of b.places.value) {
    if (!all && !p.unlocked) continue;
    const m = b.worldToMap(p.posWF);
    out.push({
      id: p.id,
      mx: m.x,
      my: m.y,
      kind: p.kind === 'station' ? 'station' : 'place',
      label: p.name,
      active: p.unlocked,
    });
  }
  for (const d of b.discoveries.value) {
    const found = d.discoveredAtMs !== null;
    if (!all && !found) continue;
    const m = b.worldToMap(d.posWF);
    out.push({
      id: `poi:${d.id}`,
      mx: m.x,
      my: m.y,
      kind: found ? 'poi' : 'poi-unknown',
      label: d.name,
      active: found,
    });
  }
  return out;
}

export function Minimap(p: { bridge: UiBridge; rotate: boolean; idle: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<TileCache | null>(null);
  const raf = useRef(0);
  const b = p.bridge;
  const state = b.map.state.value;
  const hud = b.hud.value;
  const draw = () => {
    const c = ref.current;
    const tc = cache.current;
    if (!c || !tc || b.map.state.peek() !== 'ready') return;
    const t0 = performance.now();
    const st = uiStats().minimap;
    if (tc.pump()) st.rasters++;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    const h = b.hud.peek();
    const m = b.worldToMap(h.posWF);
    const view = { cx: m.x, cy: m.y, zoom: ZOOM, rotation: p.rotate ? h.yawRad : 0, w: SIZE, h: SIZE };
    drawMap(ctx, view, tc, {
      minZoom: b.map.minZoom,
      maxZoom: b.map.maxZoom,
      player: { mx: m.x, my: m.y, yawRad: h.yawRad },
      markers: markersOf(b, false),
      placeLabels: false,
      stationLabels: true,
    });
    st.draws++;
    st.ms += performance.now() - t0;
    if (tc.pending > 0) raf.current = requestAnimationFrame(draw);
  };
  useEffect(() => {
    b.map.load();
  }, []);
  useEffect(() => {
    if (state !== 'ready') return;
    cache.current = createTileCache(b.map, () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(draw);
    });
    draw();
    return () => cancelAnimationFrame(raf.current);
  }, [state]);
  useEffect(() => {
    draw();
  }, [hud, p.rotate]);
  if (state !== 'ready') return null;
  return (
    <div id="sanpo-minimap" class={`minimap ${p.idle ? 'idle' : ''}`}>
      <canvas ref={ref} width={SIZE} height={SIZE} />
      {p.rotate ? (
        <span class="north" style={{ transform: `rotate(${hud.yawRad}rad) translateY(-${SIZE / 2 - 10}px)` }}>
          N
        </span>
      ) : null}
    </div>
  );
}
