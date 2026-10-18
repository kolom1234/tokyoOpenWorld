// 지도 타일 래스터 캐시(M10-T03): MapSource 타일(MVT 디코드) → 512 px 캔버스(레이어 순서·스타일) + 라벨 점(지명·역, 메르카토르). 래스터는 pump(예산 ms — 미니맵 1장·전체 지도 6 ms, 최근 요청 먼저),
// LRU 최대 MAX장. 보기 그리기는 canvas-renderer가 이 캐시의 비트맵만 drawImage한다.
import type { LocalName, MapFeatureData, MapSource, MapTileData } from '../../api.ts';
import { LAYER_ORDER, type LineStyle, MAP_BG, POLY, RAIL, ROAD, widthScale } from './styles.ts';

export const TILE_PX = 512;
const MAX = 96;

export interface MapLabel {
  kind: 'place' | 'station';
  mx: number;
  my: number;
  name: LocalName;
  id?: string;
}

export interface RasterTile {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  labels: MapLabel[];
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(TILE_PX, TILE_PX);
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  return c;
}

function path(ctx: Ctx, parts: readonly number[][], k: number, close: boolean): void {
  ctx.beginPath();
  for (const p of parts) {
    ctx.moveTo((p[0] as number) * k, (p[1] as number) * k);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo((p[i] as number) * k, (p[i + 1] as number) * k);
    if (close) ctx.closePath();
  }
}

function strokeLines(
  ctx: Ctx,
  fs: readonly MapFeatureData[],
  k: number,
  st: LineStyle,
  ws: number,
  casing: boolean,
): void {
  if (fs.length === 0) return;
  ctx.lineCap = st.dash ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(casing ? [] : (st.dash ?? []));
  ctx.strokeStyle = casing ? (st.casing as string) : st.color;
  ctx.lineWidth = (st.width + (casing ? 2 : 0)) * ws;
  for (const f of fs) {
    path(ctx, f.geometry, k, false);
    ctx.stroke();
  }
}

function drawLayer(ctx: Ctx, layer: string, fs: readonly MapFeatureData[], k: number, z: number): void {
  const ws = widthScale(z);
  const poly = POLY[layer];
  if (poly) {
    ctx.fillStyle = poly.fill;
    for (const f of fs) {
      path(ctx, f.geometry, k, true);
      ctx.fill('evenodd');
      if (poly.stroke && z >= 16) {
        ctx.strokeStyle = poly.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    return;
  }
  const table = layer === 'road' ? ROAD : layer === 'rail' ? RAIL : undefined;
  if (!table) return;
  const order = layer === 'road' ? ['path', 'minor', 'medium', 'major'] : ['private', 'metro', 'jr'];
  const byClass = (c: string) => fs.filter((f) => (f.props.class ?? f.props.kind) === c);
  for (const c of order) {
    const st = table[c];
    if (st?.casing) strokeLines(ctx, byClass(c), k, st, ws, true);
  }
  for (const c of order) {
    const st = table[c];
    if (st) strokeLines(ctx, byClass(c), k, st, ws, false);
  }
  ctx.setLineDash([]);
}

const nameOf = (p: MapFeatureData['props']): LocalName => ({
  ja: String(p.name_ja ?? ''),
  en: String(p.name_en ?? p.name_ja ?? ''),
  ko: String(p.name_ko ?? p.name_en ?? ''),
});

/** 타일 → 비트맵 + 라벨. */
export function rasterize(d: MapTileData, z: number, tx: number, ty: number): RasterTile {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.fillStyle = MAP_BG;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  const k = TILE_PX / d.extent;
  for (const layer of LAYER_ORDER)
    drawLayer(
      ctx,
      layer,
      d.features.filter((f) => f.layer === layer),
      k,
      z,
    );
  const n = 2 ** z * d.extent;
  const labels: MapLabel[] = d.features
    .filter((f) => f.type === 1 && (f.layer === 'place' || f.layer === 'station'))
    .map((f) => {
      const [x, y] = f.geometry[0] as [number, number];
      return {
        kind: f.layer as 'place' | 'station',
        mx: (x + tx * d.extent) / n,
        my: (y + ty * d.extent) / n,
        name: nameOf(f.props),
        ...(f.props.id ? { id: String(f.props.id) } : {}),
      };
    });
  return { canvas, labels };
}

export interface TileCache {
  /** 있으면 비트맵, 없으면 요청(보기 줌 타일). */
  get(z: number, x: number, y: number): RasterTile | undefined;
  /** 요청 없이 조회(부모 타일 대체 그리기). */
  peek(z: number, x: number, y: number): RasterTile | undefined;
  /** 대기 타일 래스터 — 최소 1장, budgetMs 안에서 더(있었으면 true — 다시 그리기 필요). 최근 요청 먼저. */
  pump(budgetMs?: number): boolean;
  readonly pending: number;
}

export function createTileCache(src: MapSource, onReady: () => void): TileCache {
  const tiles = new Map<string, RasterTile | 'loading' | 'empty'>();
  const queue: { key: string; z: number; x: number; y: number; d: MapTileData }[] = [];
  const touch = (key: string, v: RasterTile | 'loading' | 'empty') => {
    tiles.delete(key);
    tiles.set(key, v);
    if (tiles.size > MAX) tiles.delete(tiles.keys().next().value as string);
  };
  return {
    get(z, x, y) {
      const key = `${z}/${x}/${y}`;
      const t = tiles.get(key);
      if (t === undefined) {
        touch(key, 'loading');
        void src.tile(z, x, y).then((d) => {
          if (!d) touch(key, 'empty');
          else queue.push({ key, z, x, y, d });
          onReady();
        });
        return undefined;
      }
      if (typeof t === 'string') return undefined;
      touch(key, t);
      return t;
    },
    peek(z, x, y) {
      const t = tiles.get(`${z}/${x}/${y}`);
      return typeof t === 'object' ? t : undefined;
    },
    pump(budgetMs = 0) {
      const t0 = performance.now();
      let did = false;
      for (;;) {
        const job = queue.pop();
        if (!job) return did;
        touch(job.key, rasterize(job.d, job.z, job.x, job.y));
        did = true;
        if (performance.now() - t0 >= budgetMs) return did;
      }
    },
    get pending() {
      return queue.length;
    },
  };
}
