// normalize --layer rail(M07-T01): 간토 PBF(lock sha256) → osmium extract(MVP 영역 + 1.5 km — 터널·영역 밖까지 노선이 이어지게) → tags-filter(railway·
// 승강장·역) → GeoJSONSeq → WF → data/normalized/rail/osm-rail.ndjson.gz(한 파일, id 순). 컨테이너 전용(osmium). 레코드 = OsmRecord(source osm-kanto, ODbL).
// see docs/04-data-pipeline.md §4.3(철도)
import { execFile } from 'node:child_process';
import { createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type { CellKey, Logger } from '@sanpo/core';
import { cellBoundsWF, wfToLonLat } from '@sanpo/geo';
import { writeNdjsonGz } from '../../lib/ndjson-gz.ts';
import { OSM_SOURCE, type OsmRecord, ringsOf, sha256File } from '../normalize-osm.ts';

const run = promisify(execFile);
/** 영역 밖 여유(m) — 경계역 너머 선로(빨리감기·회송 구간)까지. */
export const RAIL_MARGIN_M = 1500;
export const RAIL_FILTERS = ['nwr/railway', 'nwr/public_transport=platform,station,stop_position'] as const;
export const RAIL_FILE = 'osm-rail.ndjson.gz';

/** 남기는 태그(선로·승강장·역 판정에 쓰는 것만). */
const KEEP = new Set([
  'railway',
  'service',
  'usage',
  'name',
  'name:en',
  'ref',
  'operator',
  'electrified',
  'gauge',
  'layer',
  'level',
  'bridge',
  'tunnel',
  'covered',
  'embankment',
  'cutting',
  'maxspeed',
  'railway:track_ref',
  'public_transport',
  'train',
  'subway',
  'station',
  'width',
  'area',
]);

type Feature = { id?: string; geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> };
const RS = String.fromCharCode(0x1e);

function bboxOf(cells: readonly CellKey[]): string {
  const bs = cells.map(cellBoundsWF);
  const [minX, maxX] = [
    Math.min(...bs.map((b) => b.minX)) - RAIL_MARGIN_M,
    Math.max(...bs.map((b) => b.maxX)) + RAIL_MARGIN_M,
  ];
  const [minZ, maxZ] = [
    Math.min(...bs.map((b) => b.minZ)) - RAIL_MARGIN_M,
    Math.max(...bs.map((b) => b.maxZ)) + RAIL_MARGIN_M,
  ];
  const sw = wfToLonLat({ x: minX, y: 0, z: maxZ });
  const ne = wfToLonLat({ x: maxX, y: 0, z: minZ });
  return [sw.lon, sw.lat, ne.lon, ne.lat].map((v) => v.toFixed(6)).join(',');
}

function recordOf(f: Feature): OsmRecord | null {
  const g = ringsOf(f.geometry as Parameters<typeof ringsOf>[0]);
  if (!g || !f.id) return null;
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.properties)) if (KEEP.has(k) && typeof v === 'string') tags[k] = v;
  if (!tags.railway && !tags.public_transport) return null;
  return { layer: 'osm', id: String(f.id), geom: g.geom, rings: g.rings, tags, source: OSM_SOURCE };
}

/** lock osm-kanto PBF → 철도 레코드 한 파일. 반환 = 레코드 수. */
export async function normalizeRail(
  repoRoot: string,
  lock: readonly { id: string; url: string; sha256?: unknown }[],
  cells: readonly CellKey[],
  log: Logger,
): Promise<number> {
  const src = lock.find((s) => s.id === OSM_SOURCE);
  if (typeof src?.sha256 !== 'string' || src.sha256.startsWith('TBD'))
    throw new Error('normalize rail: lock sha256 missing');
  const pbf = join(repoRoot, 'data/raw', OSM_SOURCE, src.url.split('/').pop() as string);
  const sha = await sha256File(pbf);
  if (sha !== src.sha256) throw new Error(`normalize rail: ${pbf} sha256 ${sha} ≠ lock ${src.sha256}`);
  const work = join(repoRoot, 'data/derived/rail');
  mkdirSync(work, { recursive: true });
  const [area, filtered, seq] = ['area.osm.pbf', 'filtered.osm.pbf', 'filtered.geojsonseq'].map((f) =>
    join(work, f),
  ) as [string, string, string];
  const big = { maxBuffer: 64 * 1024 * 1024 };
  await run('osmium', ['extract', '--bbox', bboxOf(cells), '--strategy', 'smart', '--overwrite', '-o', area, pbf], big);
  await run('osmium', ['tags-filter', '--overwrite', '-o', filtered, area, ...RAIL_FILTERS], big);
  await run(
    'osmium',
    ['export', '--overwrite', '-f', 'geojsonseq', '--add-unique-id', 'type_id', '-o', seq, filtered],
    big,
  );
  const out: OsmRecord[] = [];
  const lines = createInterface({ input: createReadStream(seq, 'utf8'), crlfDelay: Number.POSITIVE_INFINITY });
  for await (const raw of lines) {
    const line = (raw.startsWith(RS) ? raw.slice(1) : raw).trim();
    if (!line) continue;
    const rec = recordOf(JSON.parse(line) as Feature);
    if (rec) out.push(rec);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const dir = join(repoRoot, 'data/normalized/rail');
  mkdirSync(dir, { recursive: true });
  writeNdjsonGz(
    join(dir, RAIL_FILE),
    out.map((r) => JSON.stringify(r)),
  );
  log.info(`rail: ${out.length} records → data/normalized/rail/${RAIL_FILE}`);
  return out.length;
}
