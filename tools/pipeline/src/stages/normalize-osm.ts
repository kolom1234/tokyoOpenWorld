// normalize --layer osm(M05-T02, 04 §4.1–4.2): Geofabrik 간토 PBF(sources.lock sha256) → osmium extract(영역 + 500 m, smart) → tags-filter(M05 쓰임 태그)
// → export GeoJSONSeq → WF(@sanpo/geo, WGS84 ≈ JGD2011) → L0 셀 버킷 data/normalized/osm/<cellId>.ndjson.gz(점 = 소속 셀, 선·면 = bbox가 닿는 모든 셀, id 순).
// 컨테이너 전용(osmium). OSM 파생 = ODbL — 레코드 source = 'osm-kanto'(03 §6). see docs/04-data-pipeline.md §4.2
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { type CellKey, cellIdString, type Logger } from '@sanpo/core';
import { cellBoundsWF, cellOf, lonLatToWF, wfToLonLat } from '@sanpo/geo';
import { writeNdjsonGz } from '../lib/ndjson-gz.ts';

const run = promisify(execFile);
export const OSM_SOURCE = 'osm-kanto';
/** 영역 밖 여유(m) — 04 §4.1. */
const MARGIN_M = 500;

/** 추출할 태그(osmium tags-filter 식): 도로·횡단·정지·신호·계단(T02·T08), 방호·소품(T03), 나무·공원(T04), 교량. */
export const OSM_FILTERS = [
  'nwr/highway',
  'nwr/crossing',
  'nwr/footway',
  'nwr/barrier',
  'nwr/natural=tree,tree_row,wood,scrub',
  'nwr/leisure=park,garden,playground',
  'nwr/landuse=grass,forest,park,recreation_ground',
  'nwr/amenity=post_box,vending_machine,bicycle_parking,bench,waste_basket,telephone',
  'nwr/man_made=street_cabinet',
  'nwr/power=pole,tower',
  'nwr/bridge',
] as const;

/** 레코드에 남기는 태그 키(나머지는 버림 — 크기·ODbL 파생 DB 최소화). */
const KEEP_KEYS = new Set([
  'highway',
  'lanes',
  'lanes:forward',
  'lanes:backward',
  'oneway',
  'turn:lanes',
  'width',
  'maxspeed',
  'layer',
  'bridge',
  'tunnel',
  'crossing',
  'crossing:markings',
  'footway',
  'sidewalk',
  'barrier',
  'natural',
  'leaf_type',
  'leaf_cycle',
  'genus',
  'species',
  'height',
  'leisure',
  'landuse',
  'amenity',
  'man_made',
  'power',
  'name',
  'surface',
  'incline',
  'step_count',
  'direction',
  'traffic_signals',
]);

export type OsmGeom = 'point' | 'line' | 'polygon';

export interface OsmRecord {
  layer: 'osm';
  /** osmium type_id: n123 / w456 / a789(면). */
  id: string;
  geom: OsmGeom;
  /** WF xz 쌍(점 = 1쌍, 선 = 꼭짓점, 면 = 링들 — rings[0] 외곽). */
  rings: number[][];
  tags: Record<string, string>;
  source: typeof OSM_SOURCE;
}

type GeoJson = {
  type: 'Feature';
  id?: string;
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

const r3 = (v: number): number => Math.round(v * 1000) / 1000;
/** GeoJSONSeq 레코드 구분자(RFC 8142). */
const RS = String.fromCharCode(0x1e);

function toWF(c: [number, number]): [number, number] {
  const p = lonLatToWF({ lon: c[0], lat: c[1] });
  return [r3(p.x), r3(p.z)];
}

/** GeoJSON 기하 → 링들(WF). 지원 안 하는 기하 = null. 멀티폴리곤은 폴리곤마다 따로(첫 폴리곤만 — 공원 등 면적용). */
export function ringsOf(g: GeoJson['geometry']): { geom: OsmGeom; rings: number[][] } | null {
  const flat = (cs: [number, number][]): number[] => cs.flatMap((c) => toWF(c));
  if (g.type === 'Point') return { geom: 'point', rings: [toWF(g.coordinates as [number, number])] };
  if (g.type === 'LineString') return { geom: 'line', rings: [flat(g.coordinates as [number, number][])] };
  if (g.type === 'Polygon') return { geom: 'polygon', rings: (g.coordinates as [number, number][][]).map(flat) };
  if (g.type === 'MultiPolygon') {
    const first = (g.coordinates as [number, number][][][])[0];
    return first ? { geom: 'polygon', rings: first.map(flat) } : null;
  }
  return null;
}

/** 레코드가 닿는 L0 셀들(bbox). */
export function cellsOf(rec: OsmRecord): CellKey[] {
  let [x0, z0, x1, z1] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, -1e18, -1e18];
  for (const r of rec.rings) {
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i] as number);
      x1 = Math.max(x1, r[i] as number);
      z0 = Math.min(z0, r[i + 1] as number);
      z1 = Math.max(z1, r[i + 1] as number);
    }
  }
  const out: CellKey[] = [];
  for (let z = Math.floor(z0 / 256); z <= Math.floor(z1 / 256); z++) {
    for (let x = Math.floor(x0 / 256); x <= Math.floor(x1 / 256); x++) out.push(cellOf(0, x * 256, z * 256));
  }
  return out;
}

function recordOf(f: GeoJson): OsmRecord | null {
  const g = ringsOf(f.geometry);
  if (!g || !f.id) return null;
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.properties)) if (KEEP_KEYS.has(k) && typeof v === 'string') tags[k] = v;
  if (Object.keys(tags).length === 0) return null;
  return { layer: 'osm', id: String(f.id), geom: g.geom, rings: g.rings, tags, source: OSM_SOURCE };
}

/** 셀 목록 합집합 + 여유 → 경위도 bbox(W,S,E,N). */
function bboxOf(cells: readonly CellKey[]): string {
  const bs = cells.map(cellBoundsWF);
  const minX = Math.min(...bs.map((b) => b.minX)) - MARGIN_M;
  const maxX = Math.max(...bs.map((b) => b.maxX)) + MARGIN_M;
  const minZ = Math.min(...bs.map((b) => b.minZ)) - MARGIN_M;
  const maxZ = Math.max(...bs.map((b) => b.maxZ)) + MARGIN_M;
  const sw = wfToLonLat({ x: minX, y: 0, z: maxZ });
  const ne = wfToLonLat({ x: maxX, y: 0, z: minZ });
  return [sw.lon, sw.lat, ne.lon, ne.lat].map((v) => v.toFixed(6)).join(',');
}

export interface OsmNormalizeInput {
  pbf: string;
  cells: readonly CellKey[];
  workDir: string;
  outDir: string;
  log: Logger;
}

/** 반환 = 셀별 레코드 수 합, 원천 피처 수. */
export async function normalizeOsm(
  o: OsmNormalizeInput,
): Promise<{ features: number; records: number; cells: number }> {
  mkdirSync(o.workDir, { recursive: true });
  const area = join(o.workDir, 'area.osm.pbf');
  const filtered = join(o.workDir, 'filtered.osm.pbf');
  const seq = join(o.workDir, 'filtered.geojsonseq');
  const big = { maxBuffer: 64 * 1024 * 1024 };
  await run(
    'osmium',
    ['extract', '--bbox', bboxOf(o.cells), '--strategy', 'smart', '--overwrite', '-o', area, o.pbf],
    big,
  );
  await run('osmium', ['tags-filter', '--overwrite', '-o', filtered, area, ...OSM_FILTERS], big);
  await run(
    'osmium',
    ['export', '--overwrite', '-f', 'geojsonseq', '--add-unique-id', 'type_id', '-o', seq, filtered],
    big,
  );
  const want = new Set(o.cells);
  const buckets = new Map<CellKey, OsmRecord[]>();
  let features = 0;
  const lines = createInterface({ input: createReadStream(seq, 'utf8'), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of lines) {
    const line = (raw.startsWith(RS) ? raw.slice(1) : raw).trim();
    if (!line) continue;
    features++;
    const rec = recordOf(JSON.parse(line) as GeoJson);
    if (!rec) continue;
    for (const k of cellsOf(rec)) {
      if (!want.has(k)) continue;
      const list = buckets.get(k);
      if (list) list.push(rec);
      else buckets.set(k, [rec]);
    }
  }
  rmSync(o.outDir, { recursive: true, force: true });
  let records = 0;
  for (const [k, list] of [...buckets].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    records += list.length;
    writeNdjsonGz(
      join(o.outDir, `${cellIdString(k)}.ndjson.gz`),
      list.map((r) => JSON.stringify(r)),
    );
  }
  o.log.info(`osm: ${features} features → ${records} cell records in ${buckets.size} cells`);
  return { features, records, cells: buckets.size };
}

export function sha256File(path: string): Promise<string> {
  return new Promise((done, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => done(h.digest('hex')))
      .on('error', reject);
  });
}

/** lock `osm-kanto`(url 파일명·sha256 스트림 검사) → normalizeOsm(data/derived/osm 작업, data/normalized/osm 출력). */
export async function normalizeOsmFromLock(
  repoRoot: string,
  lock: readonly { id: string; url: string; sha256?: unknown }[],
  cells: readonly CellKey[],
  log: Logger,
) {
  const src = lock.find((s) => s.id === OSM_SOURCE);
  if (typeof src?.sha256 !== 'string' || src.sha256.startsWith('TBD'))
    throw new Error('normalize osm: lock sha256 missing');
  const pbf = join(repoRoot, 'data/raw', OSM_SOURCE, src.url.split('/').pop() as string);
  const sha = await sha256File(pbf);
  if (sha !== src.sha256) throw new Error(`normalize osm: ${pbf} sha256 ${sha} ≠ lock ${src.sha256}`);
  return normalizeOsm({
    pbf,
    cells,
    workDir: join(repoRoot, 'data/derived/osm'),
    outDir: join(repoRoot, 'data/normalized/osm'),
    log,
  });
}
