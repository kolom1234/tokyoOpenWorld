// 철도 전역 빌드(M07-T01, ADR-0070): content/sim/rail-lines.json + data/normalized/rail(OSM) + N02(대조) + 지형(dem_1m, 밖은 원경 DEM)
// → 노선별 선로(좌측통행 방향) → 0.5 m 표본·높이·곡률 제한속도·승강장 정차 위치 → data/build/<id>/global/rail.bin(gzip). 컨테이너 전용(GDAL).
// see docs/04-data-pipeline.md §4.3, docs/05-tile-format.md §9, docs/10-simulation.md §6.1
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { lonLatToWF, prjToWF } from '@sanpo/geo';
import {
  gzip,
  RAIL_FLAG,
  type RailLineMeta,
  type RailNetwork,
  type RailPlatformMeta,
  type RailStationMeta,
  type RailTrackMeta,
  writeRail,
} from '@sanpo/tile-format';
import { readNdjsonGz } from '../../lib/ndjson-gz.ts';
import type { PrjGrid } from '../../lib/raster.ts';
import { stationPoints, trackStops } from '../derive/rail/platforms.ts';
import { speedLimits } from '../derive/rail/speed-limits.ts';
import { RAIL_STEP_M, trackSamples } from '../derive/rail/splines.ts';
import { buildTracks, type RawTrack, type V2 } from '../derive/rail/tracks.ts';
import { farDemHeight, readFarDem } from '../hlod/dem-far.ts';
import type { OsmRecord } from '../normalize-osm.ts';
import { RAIL_FILE } from '../rail/normalize.ts';
import type { GtfsLineMap } from '../timetables/gtfs.ts';
import { readDemWindow } from './dem-window.ts';

interface LineDef extends RailLineMeta {
  osmNames: string[];
  n02: { line: string; operator: string };
  headings: { north: string; south: string };
  stations: string[];
  /** 시간표 원천이 GTFS인 노선(M07-T02 — timetables/gtfs.ts). */
  gtfs?: GtfsLineMap;
}
interface StationDef {
  id: string;
  name: { ja: string; en: string };
  osmNames: string[];
  mvpEdge?: boolean;
}
export interface RailCatalog {
  lines: LineDef[];
  stations: StationDef[];
}

export function readRailCatalog(repoRoot: string): RailCatalog {
  return JSON.parse(readFileSync(join(repoRoot, 'content/sim/rail-lines.json'), 'utf8')) as RailCatalog;
}

export interface RailTrackReport {
  id: string;
  lengthM: number;
  samples: number;
  tunnelM: number;
  bridgeM: number;
  stops: { station: string; s: number; side: string; platformLengthM: number; centroidDiffM: number }[];
  /** N02 노선 중심선까지 평균 거리(m, 10 m 간격 — N02는 1/25,000 도엽 기반 수십 m 정밀도). */
  n02MeanM: number | null;
}

/** N02 선로 구간(GeoJSON) → (노선|사업자)별 WF 꺾은선들. */
function readN02(rawDir: string): Map<string, V2[][]> {
  const out = new Map<string, V2[][]>();
  const f = join(rawDir, 'extracted', 'RailroadSection.geojson');
  if (!existsSync(f)) return out;
  const g = JSON.parse(readFileSync(f, 'utf8')) as {
    features: { properties: Record<string, string>; geometry: { type: string; coordinates: unknown } }[];
  };
  for (const ft of g.features) {
    const key = `${ft.properties.N02_003}|${ft.properties.N02_004}`;
    const parts = (ft.geometry.type === 'LineString' ? [ft.geometry.coordinates] : ft.geometry.coordinates) as [
      number,
      number,
    ][][];
    const list = out.get(key) ?? [];
    for (const c of parts)
      list.push(
        c.map(([lon, lat]) => {
          const p = lonLatToWF({ lon, lat });
          return [p.x, p.z] as V2;
        }),
      );
    out.set(key, list);
  }
  return out;
}

function distToLines(p: V2, lines: readonly V2[][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const l of lines)
    for (let i = 1; i < l.length; i++) {
      const a = l[i - 1] as V2;
      const b = l[i] as V2;
      const ux = b[0] - a[0];
      const uz = b[1] - a[1];
      const t = Math.min(Math.max(((p[0] - a[0]) * ux + (p[1] - a[1]) * uz) / (ux * ux + uz * uz || 1), 0), 1);
      best = Math.min(best, Math.hypot(p[0] - a[0] - ux * t, p[1] - a[1] - uz * t));
    }
  return best;
}

/** 지형 높이: dem_1m 범위 안 = 1 m 창 쌍선형, 밖 = 원경 DEM(8 m). */
async function groundSampler(normalizedDir: string, derivedDir: string, tracks: readonly RawTrack[], workDir: string) {
  const terrainDir = join(normalizedDir, 'terrain');
  const grid = (JSON.parse(readFileSync(join(terrainDir, 'dem_1m.json'), 'utf8')) as { grid: PrjGrid }).grid;
  const a = prjToWF(grid.nMax, grid.eMin, 0);
  const b = prjToWF(grid.nMax - grid.height + 1, grid.eMin + grid.width - 1, 0);
  const cov = {
    minX: Math.ceil(Math.min(a.x, b.x)),
    maxX: Math.floor(Math.max(a.x, b.x)),
    minZ: Math.ceil(Math.min(a.z, b.z)),
    maxZ: Math.floor(Math.max(a.z, b.z)),
  };
  let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
  for (const t of tracks)
    for (const [x, z] of t.pts) [x0, z0, x1, z1] = [Math.min(x0, x), Math.min(z0, z), Math.max(x1, x), Math.max(z1, z)];
  const bounds = {
    minX: Math.max(cov.minX, Math.floor(x0) - 2),
    maxX: Math.min(cov.maxX, Math.ceil(x1) + 2),
    minZ: Math.max(cov.minZ, Math.floor(z0) - 2),
    maxZ: Math.min(cov.maxZ, Math.ceil(z1) + 2),
  };
  const dem = await readDemWindow(terrainDir, bounds, 0, workDir);
  const far = readFarDem(join(derivedDir, 'terrain-far'));
  return (x: number, z: number): number | undefined => {
    if (x < bounds.minX || x > bounds.maxX - 1 || z < bounds.minZ || z > bounds.maxZ - 1)
      return farDemHeight(far, x, z);
    const fx = x - dem.x0;
    const fz = z - dem.z0;
    const c = Math.floor(fx);
    const r = Math.floor(fz);
    const tx = fx - c;
    const tz = fz - r;
    const v = (cc: number, rr: number) => dem.values[rr * dem.width + cc] as number;
    return (
      v(c, r) * (1 - tx) * (1 - tz) +
      v(c + 1, r) * tx * (1 - tz) +
      v(c, r + 1) * (1 - tx) * tz +
      v(c + 1, r + 1) * tx * tz
    );
  };
}

export interface RailBuildInput {
  repoRoot: string;
  buildDir: string;
  normalizedDir: string;
  derivedDir: string;
  log: Logger;
}

interface TrackCtx {
  recs: readonly OsmRecord[];
  stations: ReturnType<typeof stationPoints>;
  n02: Map<string, V2[][]>;
  groundAt: (x: number, z: number) => number | undefined;
}

/** 선로 하나: 표본(플래그 + 승강장)·제한속도·정차·보고. */
function deriveTrack(c: TrackCtx, l: LineDef, t: RawTrack, id: string) {
  const smp = trackSamples(t.pts, t.flags, c.groundAt);
  const lim = speedLimits(smp.xyz, RAIL_STEP_M, l.maxSpeedKmh / 3.6);
  const stops = trackStops(smp.xyz, RAIL_STEP_M, c.recs, c.stations, l.stations);
  const f = Array.from(smp.flags);
  for (const s of stops) {
    const a = Math.max(0, Math.floor((s.s - s.platformLengthM / 2) / RAIL_STEP_M));
    const b = Math.min(f.length - 1, Math.ceil((s.s + s.platformLengthM / 2) / RAIL_STEP_M));
    for (let q = a; q <= b; q++) f[q] = (f[q] as number) | RAIL_FLAG.platform;
  }
  const n = smp.xyz.length / 3;
  const nl = c.n02.get(`${l.n02.line}|${l.n02.operator}`) ?? [];
  let dsum = 0;
  let dn = 0;
  for (let q = 0; q < n && nl.length > 0; q += 20) {
    dsum += distToLines([smp.xyz[q * 3] as number, smp.xyz[q * 3 + 2] as number], nl);
    dn++;
  }
  const run = (bit: number) => f.filter((v) => (v & bit) !== 0).length * RAIL_STEP_M;
  const report: RailTrackReport = {
    id,
    lengthM: Math.round(smp.lengthM),
    samples: n,
    tunnelM: run(RAIL_FLAG.tunnel),
    bridgeM: run(RAIL_FLAG.bridge),
    stops: stops.map((s) => ({
      station: s.station,
      s: Math.round(s.s * 10) / 10,
      side: s.side,
      platformLengthM: Math.round(s.platformLengthM),
      centroidDiffM: Math.round(Math.abs(s.s - s.centroidS) * 100) / 100,
    })),
    n02MeanM: dn > 0 ? Math.round((dsum / dn) * 10) / 10 : null,
  };
  return { smp, flags: f, lim, stops: stops.map(({ centroidS: _c, ...s }) => s), report };
}

/** 노선별 선로 → 표본·제한속도·플래그 이어 붙이기 + 선로 메타(정차 → 승강장 번호) + 보고. */
function collectTracks(ctx: TrackCtx, raw: readonly { l: LineDef; tracks: RawTrack[] }[]) {
  const pts: number[] = [];
  const speed: number[] = [];
  const flags: number[] = [];
  const tracks: RailTrackMeta[] = [];
  const report: RailTrackReport[] = [];
  const platforms: RailPlatformMeta[] = [];
  for (const { l, tracks: raws } of raw) {
    const seen = new Map<string, number>();
    for (const t of raws) {
      const heading = l.headings[t.heading];
      const k = (seen.get(heading) ?? 0) + 1;
      seen.set(heading, k);
      const id = k === 1 ? `${l.id}-${heading}` : `${l.id}-${heading}-${k}`;
      const d = deriveTrack(ctx, l, t, id);
      tracks.push({
        id,
        line: l.id,
        heading,
        ptOffset: pts.length / 3,
        ptCount: d.smp.xyz.length / 3,
        lengthM: d.smp.lengthM,
        stepM: RAIL_STEP_M,
        stops: d.stops.map(({ platform, ...s }) => ({
          ...s,
          platform: platformIndex(platforms, platform, railTopAt(d.smp.xyz, s.s) + PLATFORM_TOP_M),
        })),
      });
      pts.push(...d.smp.xyz);
      speed.push(...d.lim);
      flags.push(...d.flags);
      report.push(d.report);
    }
  }
  return { pts, speed, flags, tracks, report, platforms };
}

/** global/rail.bin 쓰기 + 선로별 보고(정차·N02 대조). */
export async function buildRailGlobal(i: RailBuildInput): Promise<{ network: RailNetwork; report: RailTrackReport[] }> {
  const cat = readRailCatalog(i.repoRoot);
  const recs = readNdjsonGz<OsmRecord>(join(i.normalizedDir, 'rail', RAIL_FILE));
  const raw = cat.lines.map((l) => ({ l, tracks: buildTracks(recs, l.id, l.osmNames) }));
  const ctx: TrackCtx = {
    recs,
    stations: stationPoints(recs, cat.stations),
    n02: readN02(join(i.repoRoot, 'data/raw/ksj-n02')),
    groundAt: await groundSampler(
      i.normalizedDir,
      i.derivedDir,
      raw.flatMap((r) => r.tracks),
      join(i.derivedDir, 'rail', 'dem'),
    ),
  };
  const { pts, speed, flags, tracks, report, platforms } = collectTracks(ctx, raw);
  const network: RailNetwork = {
    lines: cat.lines.map(({ osmNames: _o, n02: _n, headings: _h, stations: _s, gtfs: _g, ...m }) => m),
    tracks,
    stations: stationMetas(cat.stations, tracks, pts),
    platforms,
    points: Float32Array.from(pts),
    speed: Float32Array.from(speed),
    flags: Uint8Array.from(flags),
  };
  const dir = join(i.buildDir, 'global');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'rail.bin'), await gzip(writeRail(network)));
  i.log.info(`rail: ${tracks.length} tracks, ${network.points.length / 3} samples → global/rail.bin`);
  return { network, report };
}

/** 승강장 윗면 = 레일 윗면 + 1.1 m(JR 통근형 승강장 높이 — 차 바닥 1.15 m와 한 단 차). */
export const PLATFORM_TOP_M = 1.1;

/** 표본 s의 레일 윗면 높이. */
function railTopAt(xyz: Float32Array, s: number): number {
  const k = Math.min(xyz.length / 3 - 1, Math.max(0, Math.round(s / RAIL_STEP_M)));
  return xyz[k * 3 + 1] as number;
}

/** 같은 OSM 승강장(섬식 = 두 선로 공유)은 하나 — 번호. */
function platformIndex(list: RailPlatformMeta[], p: { id: string; ringXZ: number[] }, topY: number): number {
  const i = list.findIndex((q) => q.id === p.id);
  if (i >= 0) return i;
  list.push({ id: p.id, ringXZ: p.ringXZ.map((v) => Math.round(v * 100) / 100), topY: Math.round(topY * 100) / 100 });
  return list.length - 1;
}

/** 역 대표 위치 = 그 역 정차 위치(선로 표본) 평균. 정차가 없는 역은 뺀다. */
function stationMetas(
  defs: readonly StationDef[],
  tracks: readonly RailTrackMeta[],
  pts: readonly number[],
): RailStationMeta[] {
  const out: RailStationMeta[] = [];
  for (const d of defs) {
    const at: [number, number, number][] = [];
    for (const t of tracks)
      for (const s of t.stops) {
        if (s.station !== d.id) continue;
        const k = t.ptOffset + Math.min(t.ptCount - 1, Math.round(s.s / t.stepM));
        at.push([pts[k * 3] as number, pts[k * 3 + 1] as number, pts[k * 3 + 2] as number]);
      }
    if (at.length === 0) continue;
    const avg = [0, 1, 2].map((c) => at.reduce((a, p) => a + (p[c] as number), 0) / at.length) as [
      number,
      number,
      number,
    ];
    out.push({ id: d.id, name: d.name, posWF: avg, mvpEdge: d.mvpEdge === true });
  }
  return out;
}
