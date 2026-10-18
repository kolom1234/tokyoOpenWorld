// 전체 지도 컨트롤러(M10-T03): 보기 상태·입력(WASD·Q/E·+/−·마우스 끌기·휠·패드 R스틱·LT/RT)·rAF 루프. 컴포넌트 밖 — 프레임마다 preact 렌더 없이 그린다(60 fps 목표).
// 그리기는 바뀐 것(입력·타일 도착·레이어·선택)이 있을 때만. 비용 = __SANPO_UI_STATS__.fullmap.
import type { UiBridge } from '../../api.ts';
import { drawMap } from './canvas-renderer.ts';
import { markersOf, uiStats } from './minimap.tsx';
import { createTileCache, type TileCache } from './tile-cache.ts';
import { type MapView, metersPerPx } from './view.ts';

const ZMIN = 13;
const ZMAX = 18.5;
const PAN_PX_S = 700;

export interface MapInput {
  keys: Set<string>;
  drag: { x: number; y: number } | null;
}

function padAxes(): { px: number; py: number; zoom: number } {
  const pad = [...(navigator.getGamepads?.() ?? [])].find((g) => g?.connected);
  if (!pad) return { px: 0, py: 0, zoom: 0 };
  const dz = (v: number) => (Math.abs(v) < 0.2 ? 0 : v);
  return {
    px: dz(pad.axes[2] ?? 0),
    py: dz(pad.axes[3] ?? 0),
    zoom: (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0),
  };
}

/** 프레임 입력 → 보기 변화(바뀌었으면 true). */
export function stepView(v: MapView, inp: MapInput, dt: number, pad = padAxes()): boolean {
  const k = inp.keys;
  const px = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + pad.px;
  const py = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0) + pad.py;
  const zoom = (k.has('KeyE') || k.has('Equal') ? 1 : 0) - (k.has('KeyQ') || k.has('Minus') ? 1 : 0) + pad.zoom;
  if (!px && !py && !zoom) return false;
  const s = 256 * 2 ** v.zoom;
  v.cx += (px * PAN_PX_S * dt) / s;
  v.cy += (py * PAN_PX_S * dt) / s;
  v.zoom = Math.max(ZMIN, Math.min(ZMAX, v.zoom + zoom * 1.6 * dt));
  return true;
}

export function scaleBar(v: MapView): { px: number; label: string } {
  const mpp = metersPerPx(v);
  const target = mpp * 120;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000].find((n) => n >= target) ?? 2000;
  return { px: nice / mpp, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
}

export class MapController {
  view: MapView | null = null;
  cache: TileCache | null = null;
  inp: MapInput = { keys: new Set(), drag: null };
  dirty = true;
  layers = { places: true, rail: true };
  selected: string | null = null;
  scaleEl: HTMLDivElement | null = null;
  private raf = 0;
  private last = 0;
  private readonly b: UiBridge;
  constructor(b: UiBridge) {
    this.b = b;
  }

  start(c: HTMLCanvasElement): void {
    this.cache = createTileCache(this.b.map, () => {
      this.dirty = true;
    });
    const m = this.b.worldToMap(this.b.hud.peek().posWF);
    this.view = { cx: m.x, cy: m.y, zoom: 16.2, rotation: 0, w: c.clientWidth, h: c.clientHeight };
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      this.frame(c, now);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  private resize(c: HTMLCanvasElement, v: MapView, dpr: number): void {
    if (c.width === Math.round(c.clientWidth * dpr) && c.height === Math.round(c.clientHeight * dpr)) return;
    c.width = Math.round(c.clientWidth * dpr);
    c.height = Math.round(c.clientHeight * dpr);
    v.w = c.clientWidth;
    v.h = c.clientHeight;
    this.dirty = true;
  }

  private frame(c: HTMLCanvasElement, now: number): void {
    const v = this.view as MapView;
    const tc = this.cache as TileCache;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.resize(c, v, dpr);
    if (stepView(v, this.inp, dt)) this.dirty = true;
    const st = uiStats().fullmap;
    const t0 = performance.now();
    if (tc.pump(6)) {
      st.rasters++;
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hud = this.b.hud.peek();
    const pm = this.b.worldToMap(hud.posWF);
    drawMap(ctx, v, tc, {
      minZoom: this.b.map.minZoom,
      maxZoom: this.b.map.maxZoom,
      player: { mx: pm.x, my: pm.y, yawRad: hud.yawRad },
      markers: markersOf(this.b, true).map((mk) => ({ ...mk, selected: mk.id === this.selected })),
      placeLabels: this.layers.places,
      stationLabels: this.layers.rail,
    });
    st.draws++;
    st.ms += performance.now() - t0;
    this.updateScale(v);
  }

  private updateScale(v: MapView): void {
    const sb = scaleBar(v);
    const el = this.scaleEl;
    if (!el?.firstChild || !el.lastChild) return;
    (el.firstChild as HTMLElement).style.width = `${Math.round(sb.px)}px`;
    (el.lastChild as Text).data = sb.label;
  }

  center(mx: number, my: number): void {
    if (!this.view) return;
    this.view.cx = mx;
    this.view.cy = my;
    this.dirty = true;
  }

  wheel(e: WheelEvent): void {
    if (!this.view) return;
    this.view.zoom = Math.max(ZMIN, Math.min(ZMAX, this.view.zoom - e.deltaY / 400));
    this.dirty = true;
  }

  drag(e: PointerEvent, phase: 'down' | 'move' | 'up'): void {
    if (phase === 'up') this.inp.drag = null;
    else if (phase === 'down') {
      this.inp.drag = { x: e.clientX, y: e.clientY };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    } else if (this.inp.drag && this.view) {
      const s = 256 * 2 ** this.view.zoom;
      this.view.cx -= (e.clientX - this.inp.drag.x) / s;
      this.view.cy -= (e.clientY - this.inp.drag.y) / s;
      this.inp.drag = { x: e.clientX, y: e.clientY };
      this.dirty = true;
    }
  }
}
