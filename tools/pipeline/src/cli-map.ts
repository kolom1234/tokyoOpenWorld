// CLI 지도·지명 단계(cli.ts 400줄 제한으로 분리, M10): normalize --layer areas(e-Stat + KEN_ALL → places.json), map --build-id(→ global/map.pmtiles). Node만(GDAL·osmium 불필요).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type CellKey, type Logger, packCellKey } from '@sanpo/core';
import { normalizeAreas, writeAreas } from './stages/areas/normalize.ts';
import { unionBounds } from './stages/build/assemble-util.ts';
import type { AreaDef } from './stages/build/manifest.ts';
import { runMap } from './stages/map/index.ts';

export interface MapCtx {
  repoRoot: string;
  log: Logger;
  readArea(id: string): AreaDef;
}

export function areaCellKeys(area: AreaDef): CellKey[] {
  const out: CellKey[] = [];
  for (let ix = area.l0.minIx; ix <= area.l0.maxIx; ix++)
    for (let iz = area.l0.minIz; iz <= area.l0.maxIz; iz++) out.push(packCellKey(0, ix, iz));
  return out;
}

/** e-Stat 소지역 + KEN_ALL 가나 → data/normalized/areas/places.json(M10-T02). */
export function normalizeAreasLayer(ctx: MapCtx, cells: readonly CellKey[]): void {
  const csv = new TextDecoder('shift_jis').decode(
    readFileSync(join(ctx.repoRoot, 'data/raw/japanpost-kenall/extracted/13TOKYO.CSV')),
  );
  const r = normalizeAreas(join(ctx.repoRoot, 'data/raw/estat-small-area/extracted'), csv, unionBounds(cells));
  writeAreas(join(ctx.repoRoot, 'data/normalized/areas'), r, ctx.log.child('areas'));
}

/** `map --build-id <id> [--area <id>]` — 빌드 뒤(global/rail.bin 사용). */
export async function map(ctx: MapCtx, args: string[], buildIdOf: () => string): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { 'build-id': { type: 'string' }, area: { type: 'string', default: 'mvp-shibuya-shinjuku' } },
  });
  const buildId = values['build-id'] ?? buildIdOf();
  await runMap({
    normalizedDir: join(ctx.repoRoot, 'data/normalized'),
    buildDir: join(ctx.repoRoot, 'data/build', buildId),
    cells: areaCellKeys(ctx.readArea(values.area)),
    log: ctx.log.child('map'),
  });
}
