// `pnpm pipeline map --build-id <id>`(M10-T03): 정규화 데이터 + 빌드 rail.bin → global/map.pmtiles(MVT z13–16) + map-report.json. 외부 지도 타일 서비스 없음 — 출처 = OSM(ODbL)·PLATEAU·GSI·e-Stat.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CellKey, Logger } from '@sanpo/core';
import { writePmtiles } from '@sanpo/tile-format';
import { collectMapFeatures } from './collect.ts';
import { buildTiles, MAP_LAYERS, MAP_MAX_ZOOM, MAP_MIN_ZOOM } from './tiles.ts';

/** 지도 화면 상시 표기(12 §3) — 메타데이터 attribution과 같은 글. */
export const MAP_ATTRIBUTION =
  '© OpenStreetMap contributors (ODbL), 3D都市モデル: 国土交通省 PLATEAU, 国土地理院, 地名: e-Stat';
export const MAP_SOURCES = [
  'osm-kanto',
  'plateau-shibuya',
  'plateau-shinjuku',
  'plateau-meguro',
  'gsi-dem',
  'estat-small-area',
  'japanpost-kenall',
  'ksj-n02',
];

const mercToLon = (x: number) => x * 360 - 180;
const mercToLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export async function runMap(o: { normalizedDir: string; buildDir: string; cells: readonly CellKey[]; log: Logger }) {
  const t0 = performance.now();
  const features = await collectMapFeatures(o.normalizedDir, o.buildDir, o.cells);
  const counts: Record<string, number> = {};
  for (const f of features) counts[f.layer] = (counts[f.layer] ?? 0) + 1;
  const { tiles, stats, bounds } = buildTiles(features);
  const [minX, minY, maxX, maxY] = bounds;
  const header = {
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    bounds: { west: mercToLon(minX), south: mercToLat(maxY), east: mercToLon(maxX), north: mercToLat(minY) },
    center: { lon: mercToLon((minX + maxX) / 2), lat: mercToLat((minY + maxY) / 2), zoom: 15 },
  };
  const metadata = {
    name: 'tokyo-sanpo map',
    attribution: MAP_ATTRIBUTION,
    sources: MAP_SOURCES,
    vector_layers: MAP_LAYERS.map((id) => ({ id, minzoom: MAP_MIN_ZOOM, maxzoom: MAP_MAX_ZOOM })),
  };
  const bytes = await writePmtiles(tiles, { header, metadata });
  mkdirSync(join(o.buildDir, 'global'), { recursive: true });
  writeFileSync(join(o.buildDir, 'global', 'map.pmtiles'), bytes);
  const report = {
    features: counts,
    ...stats,
    fileBytes: bytes.length,
    seconds: Math.round((performance.now() - t0) / 100) / 10,
  };
  writeFileSync(join(o.buildDir, 'map-report.json'), `${JSON.stringify(report, null, 1)}\n`);
  o.log.info(`map: ${JSON.stringify(report)}`);
  return report;
}
