// dem_1m.tif에서 셀 빌드용 높이 창 읽기(GDAL) + 셀별 (257+2m)² 부분 창 추출. see docs/04-data-pipeline.md §4.4, §6
import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { type CellBoundsWF, wfToPrj } from '@sanpo/geo';
import { HEIGHTFIELD_SIZE } from '@sanpo/tile-format';
import { type PrjGrid, readFloat32 } from '../../lib/raster.ts';

const run = promisify(execFile);

/** 셀 크기(m) = 257 격자 − 1. */
export const CELL_SIZE_M = HEIGHTFIELD_SIZE - 1;
/** 법선 중앙 차분용 여유 샘플(셀 바깥 1 m). 이웃 셀도 같은 샘플을 보므로 경계 법선이 일치한다. */
export const DEM_MARGIN = 1;

/** 정수 WF 격자 창: values[(z − z0)·width + (x − x0)] = (x, z) 지점 높이(m). */
export interface DemWindow {
  x0: number;
  z0: number;
  width: number;
  height: number;
  values: Float32Array;
}

/** 셀 1개 창: (size + 2·margin)², 로컬 (x, z) ∈ [−margin, size − 1 + margin]. */
export interface CellWindow {
  size: number;
  margin: number;
  stride: number;
  values: Float32Array;
}

function toInt(v: number, what: string): number {
  const r = Math.round(v);
  if (Math.abs(v - r) > 1e-6) throw new Error(`dem-window: ${what} ${v} is not on the integer grid`);
  return r;
}

/** WF 정수 좌표 → dem_1m 픽셀(col,row). 픽셀 중심 = 정수 PRJ = 정수 WF(normalize-terrain). */
function pixelOf(grid: PrjGrid, x: number, z: number): { col: number; row: number } {
  const p = wfToPrj({ x, y: 0, z });
  return { col: toInt(p.easting, 'easting') - grid.eMin, row: grid.nMax - toInt(p.northing, 'northing') };
}

/** 창 밖(래스터 범위 밖) 샘플은 가장 가까운 가장자리 값으로 채운다(영역 외곽 셀의 여유 샘플만 해당). */
function padFromClip(clip: Float32Array, cw: number, ch: number, off: { c: number; r: number }, w: number, h: number) {
  const out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    const rr = Math.min(Math.max(r - off.r, 0), ch - 1);
    for (let c = 0; c < w; c++) {
      const cc = Math.min(Math.max(c - off.c, 0), cw - 1);
      out[r * w + c] = clip[rr * cw + cc] as number;
    }
  }
  return out;
}

/**
 * `dem_1m.tif`(+ `dem_1m.json`의 grid)에서 WF 경계(양끝 포함) ± margin 창을 읽는다. GDAL 필요 → 컨테이너 전용.
 * `workDir`에 임시 ENVI 파일을 만들고 지운다.
 */
export async function readDemWindow(
  terrainDir: string,
  bounds: CellBoundsWF,
  margin: number,
  workDir: string,
): Promise<DemWindow> {
  const grid = (JSON.parse(readFileSync(join(terrainDir, 'dem_1m.json'), 'utf8')) as { grid: PrjGrid }).grid;
  const x0 = bounds.minX - margin;
  const z0 = bounds.minZ - margin;
  const width = bounds.maxX + margin - x0 + 1;
  const height = bounds.maxZ + margin - z0 + 1;
  const tl = pixelOf(grid, x0, z0);
  const c0 = Math.max(tl.col, 0);
  const r0 = Math.max(tl.row, 0);
  const cw = Math.min(tl.col + width, grid.width) - c0;
  const ch = Math.min(tl.row + height, grid.height) - r0;
  if (cw <= 0 || ch <= 0) throw new Error('readDemWindow: bounds outside dem_1m.tif');
  mkdirSync(workDir, { recursive: true });
  const bin = join(workDir, 'dem-window.bin');
  await run(
    'gdal_translate',
    ['-q', '-of', 'ENVI', '-ot', 'Float32', '-srcwin', `${c0}`, `${r0}`, `${cw}`, `${ch}`].concat([
      join(terrainDir, 'dem_1m.tif'),
      bin,
    ]),
  );
  const clip = readFloat32(bin, cw * ch);
  rmSync(workDir, { recursive: true, force: true });
  const values = padFromClip(clip, cw, ch, { c: c0 - tl.col, r: r0 - tl.row }, width, height);
  return { x0, z0, width, height, values };
}

/** 셀 (ix, iz)의 (257 + 2·margin)² 부분 창. 창이 셀 + margin을 덮지 않으면 throw. */
export function cellWindow(dem: DemWindow, ix: number, iz: number, margin = DEM_MARGIN): CellWindow {
  const size = HEIGHTFIELD_SIZE;
  const stride = size + 2 * margin;
  const cx = ix * CELL_SIZE_M - margin - dem.x0;
  const cz = iz * CELL_SIZE_M - margin - dem.z0;
  if (cx < 0 || cz < 0 || cx + stride > dem.width || cz + stride > dem.height) {
    throw new Error(`cellWindow: L0_${ix}_${iz} (+${margin}) outside DEM window`);
  }
  const values = new Float32Array(stride * stride);
  for (let r = 0; r < stride; r++) {
    const src = (cz + r) * dem.width + cx;
    values.set(dem.values.subarray(src, src + stride), r * stride);
  }
  return { size, margin, stride, values };
}

/**
 * 셀 창(여유 margin)을 DEM 창 밖이면 가장 가까운 가장자리 값으로 채워 만든다(성형 여유 SHAPE_PAD — 영역 외곽·픽스처 1셀 창).
 * 창 안이면 cellWindow와 같은 값.
 */
export function paddedCellWindow(dem: DemWindow, ix: number, iz: number, margin: number): CellWindow {
  const size = HEIGHTFIELD_SIZE;
  const stride = size + 2 * margin;
  const cx = ix * CELL_SIZE_M - margin - dem.x0;
  const cz = iz * CELL_SIZE_M - margin - dem.z0;
  const values = new Float32Array(stride * stride);
  for (let r = 0; r < stride; r++) {
    const zz = Math.min(Math.max(cz + r, 0), dem.height - 1);
    for (let c = 0; c < stride; c++) {
      const xx = Math.min(Math.max(cx + c, 0), dem.width - 1);
      values[r * stride + c] = dem.values[zz * dem.width + xx] as number;
    }
  }
  return { size, margin, stride, values };
}

/** 넓은 창 값(같은 셀, 여유 w.margin) → 여유 margin 창(값 복사). */
export function cropWindow(w: CellWindow, values: Float32Array, margin: number): CellWindow {
  const stride = w.size + 2 * margin;
  const off = w.margin - margin;
  if (off < 0) throw new RangeError('cropWindow: target margin larger than source');
  const out = new Float32Array(stride * stride);
  for (let r = 0; r < stride; r++) {
    const src = (r + off) * w.stride + off;
    out.set(values.subarray(src, src + stride), r * stride);
  }
  return { size: w.size, margin, stride, values: out };
}

/** WF (x, z)에 가장 가까운 DEM 값(창 밖 undefined) — 셀 밖 지면이 필요한 곳(교량 계단 통로). */
export function demHeightAt(dem: DemWindow, x: number, z: number): number | undefined {
  const [c, r] = [Math.round(x - dem.x0), Math.round(z - dem.z0)];
  if (c < 0 || r < 0 || c >= dem.width || r >= dem.height) return undefined;
  return dem.values[r * dem.width + c];
}

/** 로컬 격자 (x, z) 높이(margin 안쪽 음수·size 이상 허용). */
export function sampleAt(w: CellWindow, x: number, z: number): number {
  return w.values[(z + w.margin) * w.stride + x + w.margin] as number;
}

/** DEM 창 파일 메타(`<name>.json`, 값은 같은 이름 `.f32.gz` = Float32 LE gzip). 픽스처(plateau-mini)용. */
export interface DemWindowMeta {
  crs: 'WF';
  x0: number;
  z0: number;
  width: number;
  height: number;
  source: string;
  note: string;
}

/** DEM 창 → `<base>.json` + `<base>.f32.gz`(gzip 헤더 mtime 0·OS 255 고정). */
export function writeDemWindowFiles(base: string, dem: DemWindow, source: string, note: string): void {
  const meta: DemWindowMeta = { crs: 'WF', x0: dem.x0, z0: dem.z0, width: dem.width, height: dem.height, source, note };
  writeFileSync(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`);
  const gz = gzipSync(Buffer.from(dem.values.buffer, dem.values.byteOffset, dem.values.byteLength), { level: 9 });
  gz[9] = 0xff; // RFC 1952 OS 바이트 → unknown(플랫폼 무관)
  writeFileSync(`${base}.f32.gz`, gz);
}

export function readDemWindowFiles(base: string): DemWindow {
  const meta = JSON.parse(readFileSync(`${base}.json`, 'utf8')) as DemWindowMeta;
  const raw = gunzipSync(readFileSync(`${base}.f32.gz`));
  if (raw.byteLength !== meta.width * meta.height * 4) throw new Error(`readDemWindowFiles: ${base} size mismatch`);
  const values = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  return { x0: meta.x0, z0: meta.z0, width: meta.width, height: meta.height, values };
}
