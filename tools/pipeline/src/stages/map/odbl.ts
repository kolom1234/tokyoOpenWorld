// ODbL 4.6 파생 DB 공개(M11-T05, 03 §6 — ADR-0097): 빌드에 쓰인 OSM 정규화 데이터(셀별 GeoJSONSeq + 철도) + 우리 보정(content/markings)을
// global/odbl/에 그대로 묶는다 → R2 `world/<buildId>/global/odbl/*`(크레딧 화면 링크). map.pmtiles·셀의 OSM 유래 섹션도 같은 ODbL 파생 DB.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const ODBL_FILES = ['osm-derived.geojsonseq.gz', 'osm-crossing-corrections.json', 'README.txt'] as const;

/** OSM 정규화 GeoJSONSeq(셀별 gz + 철도) → 한 파일(줄 = 피처, 셀 경계에 걸친 길은 셀마다 반복될 수 있음). */
export function collectOsmDerived(normalizedDir: string): { text: string; features: number; files: number } {
  const srcs: string[] = [];
  const osmDir = join(normalizedDir, 'osm');
  if (existsSync(osmDir))
    for (const n of readdirSync(osmDir).sort()) if (n.endsWith('.ndjson.gz')) srcs.push(join(osmDir, n));
  const rail = join(normalizedDir, 'rail', 'osm-rail.ndjson.gz');
  if (existsSync(rail)) srcs.push(rail);
  const parts: string[] = [];
  let features = 0;
  for (const p of srcs) {
    const t = gunzipSync(readFileSync(p)).toString('utf8').trim();
    if (!t) continue;
    features += t.split('\n').length;
    parts.push(t);
  }
  return { text: parts.length ? `${parts.join('\n')}\n` : '', features, files: srcs.length };
}

export function odblReadme(o: { buildId: string; features: number; osmExtract: string }): string {
  return [
    'TOKYO SANPO — OpenStreetMap derived database (ODbL 1.0)',
    '',
    `Build: ${o.buildId}`,
    `Source: OpenStreetMap (${o.osmExtract}), © OpenStreetMap contributors — https://www.openstreetmap.org/copyright`,
    '',
    'This directory offers the OpenStreetMap-derived data used to build this world, under the Open Database License 1.0',
    '(https://opendatacommons.org/licenses/odbl/1-0/), per ODbL section 4.6:',
    `  osm-derived.geojsonseq.gz      ${o.features} GeoJSON features (one per line) filtered from the OSM extract for the build area`,
    '  osm-crossing-corrections.json  our corrections to OSM crossing positions (added contents)',
    '',
    'The same derived database is also contained in global/map.pmtiles (map tiles) and in the OSM-derived sections of the',
    'world cells (road markings, lanes, trees, street furniture placement, rail). Those are offered under ODbL 1.0 as well.',
    'Method (algorithm) for all alterations: the open-source pipeline at https://github.com/kolom1234/tokyoOpenWorld',
    '(tools/pipeline, pinned inputs in data/sources.lock.json).',
    '',
  ].join('\n');
}

export function writeOdblPackage(o: {
  repoRoot: string;
  normalizedDir: string;
  buildDir: string;
  buildId: string;
  osmExtract: string;
}): { features: number; bytes: number } {
  const { text, features } = collectOsmDerived(o.normalizedDir);
  const dir = join(o.buildDir, 'global', 'odbl');
  mkdirSync(dir, { recursive: true });
  const gz = gzipSync(Buffer.from(text, 'utf8'), { level: 9 });
  writeFileSync(join(dir, ODBL_FILES[0]), gz);
  const corr = join(o.repoRoot, 'content', 'markings', 'osm-crossing-corrections.json');
  writeFileSync(join(dir, ODBL_FILES[1]), existsSync(corr) ? readFileSync(corr) : '[]\n');
  writeFileSync(join(dir, ODBL_FILES[2]), odblReadme({ buildId: o.buildId, features, osmExtract: o.osmExtract }));
  return { features, bytes: gz.length };
}
