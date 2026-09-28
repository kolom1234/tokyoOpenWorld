// 원경 지형(L2/L3·영역 밖 L1): 地理院 標高タイル(dem_png, z14 ≈ DEM10B/5A) 받기 → WF 8 m 격자로 재표본 → 이중선형 조회.
// 원천 = data/raw/gsi-dem-tiles/dem_png/14/<x>/<y>.png + manifest.json(타일별 sha256, 404 = 자료 없음 = 해면). see docs/04-data-pipeline.md §4.5, docs/03 (gsi-dem-tiles)
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { type CellBoundsWF, lonLatBBoxOfWF, wfToLonLat } from '@sanpo/geo';
import { decodePng } from '../../lib/png.ts';

export const DEM_TILE_Z = 14;
export const DEM_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png';
/** 원경 격자 간격(m). L2 16 m·L3 64 m는 부분 표본, 영역 밖 L1 4 m는 보간. */
export const FAR_DEM_STEP_M = 8;
const TILE_PX = 256;
/** 투영 보간용 거친 격자(m): 이 간격으로만 wfToLonLat을 부르고 사이는 선형 보간(오차 ≪ 1 mm). */
const COARSE_M = 256;

export interface FarDem {
  x0: number;
  z0: number;
  step: number;
  width: number;
  height: number;
  values: Float32Array;
}

interface TileEntry {
  x: number;
  y: number;
  /** null = 404(자료 없음). */
  sha256: string | null;
}

export function tileRange(extent: CellBoundsWF, z = DEM_TILE_Z): { x0: number; x1: number; y0: number; y1: number } {
  const b = lonLatBBoxOfWF(extent);
  const n = 2 ** z;
  const tx = (lon: number): number => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number): number => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  return { x0: tx(b.west), x1: tx(b.east), y0: ty(b.north), y1: ty(b.south) };
}

/** dem_png 화소 → 높이(m). x = R·2¹⁶ + G·2⁸ + B, 2²³ = 무효(→ NaN), 2²³ 이상은 음수. */
export function demPngHeight(r: number, g: number, b: number): number {
  const x = r * 65536 + g * 256 + b;
  if (x === 8388608) return Number.NaN;
  return (x < 8388608 ? x : x - 16777216) * 0.01;
}

/** 타일 내려받기(이미 있으면 건너뜀) + manifest. 반환 = manifest sha256(lock용). */
export async function fetchDemTiles(
  rawDir: string,
  extent: CellBoundsWF,
  log: Logger,
  concurrency = 6,
): Promise<string> {
  const r = tileRange(extent);
  const jobs: { x: number; y: number }[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) jobs.push({ x, y });
  const entries: TileEntry[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const { x, y } = jobs[next++] as { x: number; y: number };
      const file = join(rawDir, `dem_png/${DEM_TILE_Z}/${x}/${y}.png`);
      const missing = `${file}.404`;
      if (!existsSync(file) && !existsSync(missing)) {
        const url = DEM_TILE_URL.replace('{z}', String(DEM_TILE_Z)).replace('{x}', String(x)).replace('{y}', String(y));
        const res = await fetch(url);
        mkdirSync(dirname(file), { recursive: true });
        if (res.status === 404) writeFileSync(missing, '');
        else if (res.ok) writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
        else throw new Error(`${url}: HTTP ${res.status}`);
      }
      const sha = existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
      entries.push({ x, y, sha256: sha });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  entries.sort((a, b) => a.y - b.y || a.x - b.x);
  const manifest = `${JSON.stringify({ url: DEM_TILE_URL, z: DEM_TILE_Z, range: r, tiles: entries })}\n`;
  writeFileSync(join(rawDir, 'manifest.json'), manifest);
  log.info(`dem tiles: ${entries.length} (${entries.filter((e) => e.sha256 === null).length} × 404) z${DEM_TILE_Z}`);
  return createHash('sha256').update(manifest).digest('hex');
}

/** 타일 캐시(디코드된 높이 256², 없는 타일 = null → 0 m). */
function tileReader(rawDir: string): (tx: number, ty: number) => Float32Array | null {
  const cache = new Map<string, Float32Array | null>();
  return (tx, ty) => {
    const k = `${tx}/${ty}`;
    if (cache.has(k)) return cache.get(k) ?? null;
    const file = join(rawDir, `dem_png/${DEM_TILE_Z}/${tx}/${ty}.png`);
    let out: Float32Array | null = null;
    if (existsSync(file)) {
      const png = decodePng(readFileSync(file));
      out = new Float32Array(TILE_PX * TILE_PX);
      for (let i = 0; i < out.length; i++) {
        const o = i * png.channels;
        out[i] = demPngHeight(png.data[o] as number, png.data[o + 1] as number, png.data[o + 2] as number);
      }
    }
    cache.set(k, out);
    return out;
  };
}

/** 전역 화소 좌표(z14, 화소 중심 = +0.5)에서 높이. 무효·해면 = 0 m. */
function pixelHeight(read: ReturnType<typeof tileReader>, px: number, py: number): number {
  const tx = Math.floor(px / TILE_PX);
  const ty = Math.floor(py / TILE_PX);
  const t = read(tx, ty);
  const v = t ? (t[(py - ty * TILE_PX) * TILE_PX + (px - tx * TILE_PX)] as number) : Number.NaN;
  return Number.isFinite(v) ? v : 0;
}

function mercatorPx(lon: number, lat: number): [number, number] {
  const n = 2 ** DEM_TILE_Z * TILE_PX;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n - 0.5, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n - 0.5];
}

/** 원경 격자(WF, 간격 step, 양끝 포함) 재표본. 화소 이중선형, 투영은 거친 격자 보간. */
export function resampleFarDem(rawDir: string, extent: CellBoundsWF, step = FAR_DEM_STEP_M): FarDem {
  const width = Math.round((extent.maxX - extent.minX) / step) + 1;
  const height = Math.round((extent.maxZ - extent.minZ) / step) + 1;
  const read = tileReader(rawDir);
  const per = COARSE_M / step;
  const cw = Math.ceil((width - 1) / per) + 1;
  const ch = Math.ceil((height - 1) / per) + 1;
  const coarse = new Float64Array(cw * ch * 2);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const ll = wfToLonLat({ x: extent.minX + i * COARSE_M, y: 0, z: extent.minZ + j * COARSE_M });
      coarse.set(mercatorPx(ll.lon, ll.lat), (j * cw + i) * 2);
    }
  }
  const values = new Float32Array(width * height);
  for (let r = 0; r < height; r++) {
    const cj = Math.min(Math.floor(r / per), ch - 2);
    const tj = r / per - cj;
    for (let c = 0; c < width; c++) {
      const ci = Math.min(Math.floor(c / per), cw - 2);
      const ti = c / per - ci;
      const at = (i: number, j: number, k: number): number => coarse[(j * cw + i) * 2 + k] as number;
      const lerp = (k: number): number =>
        (at(ci, cj, k) * (1 - ti) + at(ci + 1, cj, k) * ti) * (1 - tj) +
        (at(ci, cj + 1, k) * (1 - ti) + at(ci + 1, cj + 1, k) * ti) * tj;
      const px = lerp(0);
      const py = lerp(1);
      const x0 = Math.floor(px);
      const y0 = Math.floor(py);
      const fx = px - x0;
      const fy = py - y0;
      const top = pixelHeight(read, x0, y0) * (1 - fx) + pixelHeight(read, x0 + 1, y0) * fx;
      const bot = pixelHeight(read, x0, y0 + 1) * (1 - fx) + pixelHeight(read, x0 + 1, y0 + 1) * fx;
      values[r * width + c] = top * (1 - fy) + bot * fy;
    }
  }
  return { x0: extent.minX, z0: extent.minZ, step, width, height, values };
}

/** 이중선형 조회(격자 밖은 가장자리 클램프). */
export function farDemHeight(d: FarDem, x: number, z: number): number {
  const fx = Math.min(Math.max((x - d.x0) / d.step, 0), d.width - 1);
  const fz = Math.min(Math.max((z - d.z0) / d.step, 0), d.height - 1);
  const c0 = Math.min(Math.floor(fx), d.width - 2);
  const r0 = Math.min(Math.floor(fz), d.height - 2);
  const tx = fx - c0;
  const tz = fz - r0;
  const v = (c: number, r: number): number => d.values[r * d.width + c] as number;
  return (
    (v(c0, r0) * (1 - tx) + v(c0 + 1, r0) * tx) * (1 - tz) + (v(c0, r0 + 1) * (1 - tx) + v(c0 + 1, r0 + 1) * tx) * tz
  );
}

export function writeFarDem(dir: string, d: FarDem): void {
  mkdirSync(dir, { recursive: true });
  const { values, ...meta } = d;
  writeFileSync(join(dir, 'dem_far.json'), `${JSON.stringify(meta)}\n`);
  writeFileSync(join(dir, 'dem_far.f32'), new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
}

export function readFarDem(dir: string): FarDem {
  const meta = JSON.parse(readFileSync(join(dir, 'dem_far.json'), 'utf8')) as Omit<FarDem, 'values'>;
  const b = readFileSync(join(dir, 'dem_far.f32'));
  const values = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { ...meta, values };
}
