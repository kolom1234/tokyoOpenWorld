// M11-T05 ODbL 4.6: OSM 정규화 GeoJSONSeq(셀별 gz + 철도) → global/odbl/ 묶음(피처 수·README·보정 파일).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ODBL_FILES, writeOdblPackage } from '../src/stages/map/odbl.ts';

const feat = (id: number) => JSON.stringify({ type: 'Feature', id, properties: {}, geometry: null });

describe('odbl package', () => {
  it('concatenates OSM-derived cells and rail into one GeoJSONSeq with a notice', () => {
    const root = mkdtempSync(join(tmpdir(), 'sanpo-odbl-'));
    try {
      const norm = join(root, 'normalized');
      mkdirSync(join(norm, 'osm'), { recursive: true });
      mkdirSync(join(norm, 'rail'), { recursive: true });
      writeFileSync(join(norm, 'osm', 'L0_0_0.ndjson.gz'), gzipSync(`${feat(1)}\n${feat(2)}\n`));
      writeFileSync(join(norm, 'osm', 'L0_0_1.ndjson.gz'), gzipSync(`${feat(3)}\n`));
      writeFileSync(join(norm, 'rail', 'osm-rail.ndjson.gz'), gzipSync(`${feat(4)}\n`));
      const build = join(root, 'build');
      const r = writeOdblPackage({
        repoRoot: root,
        normalizedDir: norm,
        buildDir: build,
        buildId: 'b1',
        osmExtract: 'x.pbf',
      });
      expect(r.features).toBe(4);
      const dir = join(build, 'global', 'odbl');
      const lines = gunzipSync(readFileSync(join(dir, ODBL_FILES[0])))
        .toString('utf8')
        .trim()
        .split('\n');
      expect(lines.map((l) => (JSON.parse(l) as { id: number }).id)).toEqual([1, 2, 3, 4]);
      const readme = readFileSync(join(dir, 'README.txt'), 'utf8');
      expect(readme).toContain('Open Database License 1.0');
      expect(readme).toContain('© OpenStreetMap contributors');
      expect(readme).toContain('Build: b1');
      expect(readFileSync(join(dir, ODBL_FILES[1]), 'utf8')).toBe('[]\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
