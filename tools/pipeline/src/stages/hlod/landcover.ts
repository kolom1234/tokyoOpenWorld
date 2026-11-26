// 원경 지면 분류(M12-T04, S2): hlodExtentWF 전체의 토지피복 가중치 텍스처 — HLOD 지형 셰이더가 월드 xz로 샘플링한다(셀·HLOD 메시 변경 없음).
// 원천 = Geofabrik 간토 PBF(osmium extract + tags-filter, 컨테이너) + 원경 DEM(해면 = 자료 없음 0 m). OSM 파생 = ODbL(03 §6).
// 8 m 분류 격자(0 도시 바닥 · 1 도로 · 2 녹지 · 3 물 · 4 선로)를 칠하고 2×2 → 16 m RGBA(물·녹지·도로·선로 비율 0..255) PNG.
// see docs/04-data-pipeline.md §4.5, ADR-0109
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { Logger } from '@sanpo/core';
import { type CellBoundsWF, lonLatBBoxOfWF, lonLatToWF } from '@sanpo/geo';
import { encodePngRgba } from '../../lib/png.ts';
import { rasterizeRings } from '../build/surface-class.ts';
import { type FarDem, farDemHeight } from './dem-far.ts';

const run = promisify(execFile);
/** GeoJSONSeq 레코드 구분자(RFC 8142). */
const RS = String.fromCharCode(0x1e);

/** 분류 값(8 m 격자). 칠하는 순서 = 녹지 → 물 → 선로 → 도로(뒤가 이김), 해면은 맨 처음. */
export const LC = { urban: 0, road: 1, green: 2, water: 3, rail: 4 } as const;
export type LandClass = (typeof LC)[keyof typeof LC];
/** 분류 격자 간격(m)·출력 텍스처 간격(m, = 2 × 2 평균). */
export const LC_STEP_M = 8;
export const LC_OUT_STEP_M = 16;

/** osmium tags-filter 식(원경 토지피복). 터널·지하는 분류에서 뺀다. */
export const LANDCOVER_FILTERS = [
  'nwr/natural=water,wood,scrub,grassland,heath,wetland',
  'nwr/water',
  'nwr/waterway=riverbank',
  'nwr/landuse=grass,forest,park,recreation_ground,meadow,cemetery,village_green,allotments,railway,reservoir,basin',
  'nwr/leisure=park,garden,golf_course,nature_reserve,pitch',
  'w/highway=motorway,trunk,primary,secondary,tertiary,motorway_link,trunk_link,primary_link,secondary_link,residential,unclassified',
  'w/railway=rail,light_rail,narrow_gauge,monorail',
] as const;

/** 도로 반폭(m) — 일본 도로 구조령 차선 3–3.5 m × 차로 수 + 길어깨 근사. 지도 등급별 고정. */
const ROAD_HALF_M: Readonly<Record<string, number>> = {
  motorway: 12,
  trunk: 10,
  primary: 8,
  secondary: 7,
  tertiary: 5,
  motorway_link: 4,
  trunk_link: 4,
  primary_link: 4,
  secondary_link: 4,
  residential: 3,
  unclassified: 3,
};
/** 선로 반폭(m, 복선 + 도상). */
const RAIL_HALF_M = 6;

export interface LcFeature {
  geom: 'line' | 'polygon';
  /** WF xz 쌍 — 선 = 꼭짓점들, 면 = 링들(짝-홀). */
  rings: number[][];
  cls: LandClass;
  /** 선 반폭(m). */
  halfM?: number;
}

const isTrue = (v: string | undefined): boolean => v !== undefined && v !== 'no';

/** OSM 태그 → 분류(해당 없음 = undefined). 터널·지하·지붕 밑(covered)은 빼고, 다리는 그대로(위에서 보인다). */
export function classifyOsm(
  tags: Readonly<Record<string, string>>,
  geom: 'line' | 'polygon',
): LcFeature['cls'] | undefined {
  if (isTrue(tags.tunnel) || tags.location === 'underground' || isTrue(tags.covered)) return undefined;
  if (geom === 'line') {
    if (tags.highway && ROAD_HALF_M[tags.highway]) return LC.road;
    if (tags.railway) return LC.rail;
    return undefined;
  }
  if (tags.natural === 'water' || tags.water || tags.waterway === 'riverbank') return LC.water;
  if (tags.landuse === 'reservoir' || tags.landuse === 'basin') return LC.water;
  if (tags.landuse === 'railway') return LC.rail;
  if (tags.natural || tags.leisure || tags.landuse) return LC.green;
  return undefined;
}

export function halfWidthOf(tags: Readonly<Record<string, string>>): number {
  return tags.highway ? (ROAD_HALF_M[tags.highway] ?? 3) : RAIL_HALF_M;
}

export interface LcGrid {
  x0: number;
  z0: number;
  step: number;
  width: number;
  height: number;
  cls: Uint8Array;
}

export function createLcGrid(extent: CellBoundsWF, step = LC_STEP_M): LcGrid {
  const width = Math.round((extent.maxX - extent.minX) / step);
  const height = Math.round((extent.maxZ - extent.minZ) / step);
  return { x0: extent.minX, z0: extent.minZ, step, width, height, cls: new Uint8Array(width * height) };
}

/** 해면(원경 DEM = 정확히 0 m — 자료 없음 타일만 0으로 채워진다) → 물. */
export function paintSea(g: LcGrid, dem: FarDem): void {
  for (let r = 0; r < g.height; r++) {
    for (let c = 0; c < g.width; c++) {
      const h = farDemHeight(dem, g.x0 + (c + 0.5) * g.step, g.z0 + (r + 0.5) * g.step);
      if (h === 0) g.cls[r * g.width + c] = LC.water;
    }
  }
}

/** 면(짝-홀) 채우기 — 격자 좌표로 바꿔 build/surface-class rasterizeRings(1 단위 격자)를 그대로 쓴다. */
function fillPolygon(g: LcGrid, rings: readonly number[][], cls: number): void {
  const local = rings.map((xz) => {
    const out: number[] = [];
    for (let i = 0; i + 1 < xz.length; i += 2) {
      out.push(((xz[i] as number) - g.x0) / g.step - 0.5, 0, ((xz[i + 1] as number) - g.z0) / g.step - 0.5);
    }
    return out;
  });
  const n = Math.max(g.width, g.height);
  rasterizeRings(local, n, 0, 0, (k) => {
    const x = k % n;
    const z = Math.floor(k / n);
    if (x < g.width && z < g.height) g.cls[z * g.width + x] = cls;
  });
}

/** 두꺼운 선(캡슐 이어 붙이기): 선분마다 반폭 안의 칸 중심을 칠한다. */
function fillLine(g: LcGrid, xz: readonly number[], halfM: number, cls: number): void {
  const r2 = halfM * halfM;
  for (let i = 0; i + 3 < xz.length; i += 2) {
    const [ax, az, bx, bz] = [xz[i] as number, xz[i + 1] as number, xz[i + 2] as number, xz[i + 3] as number];
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - halfM - g.x0) / g.step));
    const c1 = Math.min(g.width - 1, Math.floor((Math.max(ax, bx) + halfM - g.x0) / g.step));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz) - halfM - g.z0) / g.step));
    const r1 = Math.min(g.height - 1, Math.floor((Math.max(az, bz) + halfM - g.z0) / g.step));
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    for (let r = r0; r <= r1; r++) {
      const pz = g.z0 + (r + 0.5) * g.step;
      for (let c = c0; c <= c1; c++) {
        const px = g.x0 + (c + 0.5) * g.step;
        const t = Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / len2, 0), 1);
        const ex = px - (ax + t * dx);
        const ez = pz - (az + t * dz);
        if (ex * ex + ez * ez <= r2) g.cls[r * g.width + c] = cls;
      }
    }
  }
}

/** 칠하기 순서(뒤가 이김): 녹지 → 물 → 선로 → 도로. 같은 분류 안에서는 입력 순서(osmium 출력 = id 순, 결정론). */
const ORDER: readonly LandClass[] = [LC.green, LC.water, LC.rail, LC.road];

export function paintFeatures(g: LcGrid, features: readonly LcFeature[]): void {
  for (const cls of ORDER) {
    for (const f of features) {
      if (f.cls !== cls) continue;
      if (f.geom === 'polygon') fillPolygon(g, f.rings, cls);
      else for (const r of f.rings) fillLine(g, r, f.halfM ?? 3, cls);
    }
  }
}

/** 8 m 분류 → 16 m RGBA 비율(R 물 · G 녹지 · B 도로 · A 선로, 0..255; 나머지 = 도시 바닥). 행 = z(북 → 남). */
export function toWeights(g: LcGrid): { width: number; height: number; rgba: Uint8Array } {
  const width = Math.floor(g.width / 2);
  const height = Math.floor(g.height / 2);
  const rgba = new Uint8Array(width * height * 4);
  const ch: Readonly<Record<number, number>> = { [LC.water]: 0, [LC.green]: 1, [LC.road]: 2, [LC.rail]: 3 };
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const acc = [0, 0, 0, 0];
      for (const [dc, dr] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const k = ch[g.cls[(r * 2 + dr) * g.width + c * 2 + dc] as number];
        if (k !== undefined) acc[k] = (acc[k] as number) + 1;
      }
      const o = (r * width + c) * 4;
      for (let k = 0; k < 4; k++) rgba[o + k] = Math.round(((acc[k] as number) / 4) * 255);
    }
  }
  return { width, height, rgba };
}

/** GeoJSON 기하(경위도) → 분류 기능(멀티폴리곤은 폴리곤마다). */
export function featuresOf(
  geometry: { type: string; coordinates: unknown },
  tags: Record<string, string>,
): LcFeature[] {
  const toXZ = (cs: [number, number][]): number[] =>
    cs.flatMap((c) => {
      const p = lonLatToWF({ lon: c[0], lat: c[1] });
      return [p.x, p.z];
    });
  if (geometry.type === 'LineString') {
    const cls = classifyOsm(tags, 'line');
    return cls === undefined
      ? []
      : [{ geom: 'line', rings: [toXZ(geometry.coordinates as [number, number][])], cls, halfM: halfWidthOf(tags) }];
  }
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as [number, number][][]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as [number, number][][][])
        : [];
  const cls = polys.length > 0 ? classifyOsm(tags, 'polygon') : undefined;
  if (cls === undefined) return [];
  return polys.map((p) => ({ geom: 'polygon', rings: p.map(toXZ), cls }));
}

/** osmium(컨테이너): 원경 범위 extract → tags-filter → GeoJSONSeq. 반환 = seq 경로. */
export async function extractLandcoverOsm(pbf: string, extent: CellBoundsWF, workDir: string): Promise<string> {
  mkdirSync(workDir, { recursive: true });
  const b = lonLatBBoxOfWF(extent);
  const area = join(workDir, 'landcover-area.osm.pbf');
  const filtered = join(workDir, 'landcover-filtered.osm.pbf');
  const seq = join(workDir, 'landcover.geojsonseq');
  const big = { maxBuffer: 1 << 26 };
  const bbox = [b.west, b.south, b.east, b.north].map((v) => v.toFixed(6)).join(',');
  await run('osmium', ['extract', '--bbox', bbox, '--strategy', 'smart', '--overwrite', '-o', area, pbf], big);
  await run('osmium', ['tags-filter', '--overwrite', '-o', filtered, area, ...LANDCOVER_FILTERS], big);
  await run('osmium', ['export', '--overwrite', '-f', 'geojsonseq', '-o', seq, filtered], big);
  return seq;
}

/** GeoJSONSeq 줄 → 분류 기능(id 순 = osmium 출력 순). */
export async function readLandcoverFeatures(seqPath: string): Promise<LcFeature[]> {
  const out: LcFeature[] = [];
  const rl = createInterface({ input: createReadStream(seqPath, 'utf8'), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of rl) {
    const line = (raw.startsWith(RS) ? raw.slice(1) : raw).trim();
    if (!line) continue;
    const f = JSON.parse(line) as {
      geometry: { type: string; coordinates: unknown } | null;
      properties: Record<string, unknown>;
    };
    if (!f.geometry) continue;
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.properties)) if (typeof v === 'string') tags[k] = v;
    out.push(...featuresOf(f.geometry, tags));
  }
  return out;
}

export interface LandcoverMeta {
  schema: 1;
  /** 텍스처 북서 모서리 WF(x, z)·화소 간격(m)·크기. 화소 (c, r) 중심 = (x0 + (c + 0.5)·step, z0 + (r + 0.5)·step). */
  x0: number;
  z0: number;
  step: number;
  width: number;
  height: number;
  channels: { r: 'water'; g: 'green'; b: 'road'; a: 'rail' };
  file: string;
  sha256: string;
  sources: string[];
}

/** 원경 토지피복 → data/derived/landcover/{landcover.png, landcover.json}. */
export function writeLandcover(dir: string, g: LcGrid, sources: string[], log: Logger): LandcoverMeta {
  const w = toWeights(g);
  const png = encodePngRgba(w.width, w.height, w.rgba);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'landcover.png'), png);
  const meta: LandcoverMeta = {
    schema: 1,
    x0: g.x0,
    z0: g.z0,
    step: g.step * 2,
    width: w.width,
    height: w.height,
    channels: { r: 'water', g: 'green', b: 'road', a: 'rail' },
    file: 'landcover.png',
    sha256: createHash('sha256').update(png).digest('hex'),
    sources,
  };
  writeFileSync(join(dir, 'landcover.json'), `${JSON.stringify(meta, null, 2)}\n`);
  log.info(`landcover ${w.width}×${w.height} @ ${meta.step} m → ${(png.length / 1e6).toFixed(2)} MB png`);
  return meta;
}
