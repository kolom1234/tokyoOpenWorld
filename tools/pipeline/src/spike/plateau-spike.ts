// M01-T02 스파이크 CLI: A안(nusamai)·B안(citygml-sax)을 같은 3×3 셀로 돌려 비교한다. 결과 요약은 docs/adr/0007-plateau-reader.md
// 사용(컨테이너): node tools/pipeline/src/spike/plateau-spike.ts run[-discard] <nusamai|citygml-sax> <outDir> <gml…>
//                node tools/pipeline/src/spike/plateau-spike.ts compare <outDir> <Building_usage.xml>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { packCellKey, unpackCellKey } from '@sanpo/core';
import { cellBoundsWF, cellOf } from '@sanpo/geo';
import { centroidXZ } from '../readers/plateau/geometry.ts';
import { createPlateauReader, type NormalizedFeature, type PlateauReader } from '../readers/plateau/index.ts';
import { compareOutputs, type RunStats } from './spike-metrics.ts';

/** 스크램블 교차로(WF ≈ −22.3, 8.6)가 속한 L0 셀(L0_-1_0) 중심 3×3. */
export const SPIKE_CELLS = { minIx: -2, maxIx: 0, minIz: -1, maxIz: 1 } as const;
const LO = cellBoundsWF(packCellKey(0, SPIKE_CELLS.minIx, SPIKE_CELLS.minIz));
const HI = cellBoundsWF(packCellKey(0, SPIKE_CELLS.maxIx, SPIKE_CELLS.maxIz));
const REGION = { minX: LO.minX, minZ: LO.minZ, maxX: HI.maxX, maxZ: HI.maxZ };

function inRegion(f: NormalizedFeature): boolean {
  if (f.layer === 'buildings' || f.layer === 'bridges') {
    const c = centroidXZ(f.surfaces.map((s) => s.ringsWF));
    if (!c) return false;
    const { ix, iz } = unpackCellKey(cellOf(0, c.x, c.z));
    return ix >= SPIKE_CELLS.minIx && ix <= SPIKE_CELLS.maxIx && iz >= SPIKE_CELLS.minIz && iz <= SPIKE_CELLS.maxIz;
  }
  const outer = f.polygonWF[0] ?? [];
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i + 2 < outer.length; i += 3) {
    const x = outer[i] as number;
    const z = outer[i + 2] as number;
    [minX, maxX, minZ, maxZ] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minZ, z), Math.max(maxZ, z)];
  }
  return maxX > REGION.minX && minX < REGION.maxX && maxZ > REGION.minZ && minZ < REGION.maxZ;
}

/** `discard` = 레코드를 모으지 않고 세기만(리더 자체의 메모리 측정용, `run-discard`). */
async function runReader(reader: PlateauReader, outDir: string, files: string[], discard: boolean): Promise<void> {
  const t0 = performance.now();
  const kept: NormalizedFeature[] = [];
  let total = 0;
  let inside = 0;
  for (const file of files) {
    for await (const f of reader.read(file, { sourceId: 'plateau-shibuya' })) {
      total++;
      if (!inRegion(f)) continue;
      inside++;
      if (!discard) kept.push(f);
    }
  }
  const stats: RunStats = {
    reader: reader.name,
    files: files.length,
    featuresTotal: total,
    featuresInRegion: inside,
    wallMs: Math.round(performance.now() - t0),
    nodeMaxRssMB: Math.round(process.resourceUsage().maxRSS / 1024),
    region: REGION,
  };
  mkdirSync(outDir, { recursive: true });
  const suffix = discard ? '.discard' : '';
  if (!discard) writeFileSync(join(outDir, `${reader.name}.ndjson`), kept.map((f) => JSON.stringify(f)).join('\n'));
  writeFileSync(join(outDir, `${reader.name}${suffix}.stats.json`), JSON.stringify(stats, null, 2));
  process.stdout.write(`${JSON.stringify(stats)}\n`);
}

function readNdjson(path: string): NormalizedFeature[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as NormalizedFeature);
}

/** Building_usage.xml → 코드 → 명칭. */
function usageNames(codelistPath: string): Map<string, string> {
  const xml = readFileSync(codelistPath, 'utf8');
  const map = new Map<string, string>();
  const re = /<gml:description>([^<]*)<\/gml:description>\s*<gml:name>([^<]*)<\/gml:name>/g;
  for (const m of xml.matchAll(re)) map.set(m[2] as string, m[1] as string);
  return map;
}

async function main(argv: string[]): Promise<void> {
  const [cmd, a, b, ...rest] = argv;
  if ((cmd === 'run' || cmd === 'run-discard') && (a === 'nusamai' || a === 'citygml-sax') && b) {
    await runReader(createPlateauReader(a), b, rest, cmd === 'run-discard');
  } else if (cmd === 'compare' && a && b) {
    const load = (name: string): { features: NormalizedFeature[]; stats: RunStats } => ({
      features: readNdjson(join(a, `${name}.ndjson`)),
      stats: JSON.parse(readFileSync(join(a, `${name}.stats.json`), 'utf8')) as RunStats,
    });
    const report = compareOutputs(load('nusamai'), load('citygml-sax'), usageNames(b));
    writeFileSync(join(a, 'report.json'), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stderr.write(
      'usage: plateau-spike.ts run <nusamai|citygml-sax> <outDir> <gml…> | compare <outDir> <usage.xml>\n',
    );
    process.exitCode = 2;
  }
}

await main(process.argv.slice(2));
