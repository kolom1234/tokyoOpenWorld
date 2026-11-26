// CLI 원경 지면 분류(M12-T04, cli.ts 400줄 제한으로 분리): `landcover --prep`(osmium 컨테이너 — 간토 PBF + 원경 DEM → data/derived/landcover)·
// `landcover --build-id <id>`(derived → <build>/shared/landcover/ + world.json files.landcover). see ADR-0109
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Logger } from '@sanpo/core';
import type { AreaDef } from './stages/build/manifest.ts';
import { readFarDem } from './stages/hlod/dem-far.ts';
import {
  createLcGrid,
  extractLandcoverOsm,
  type LandcoverMeta,
  paintFeatures,
  paintSea,
  readLandcoverFeatures,
  writeLandcover,
} from './stages/hlod/landcover.ts';
import { ensureLandcoverNote } from './stages/map/odbl.ts';
import { OSM_SOURCE } from './stages/normalize-osm.ts';

export interface LandcoverCtx {
  repoRoot: string;
  log: Logger;
  readArea(id: string): AreaDef;
  lockSources(): readonly { id: string; url: string; sha256?: unknown }[];
}

/** world.json에 넣는 경로(빌드 루트 기준). */
export const LANDCOVER_WORLD_PATH = 'shared/landcover/landcover.json';

async function prep(ctx: LandcoverCtx, area: AreaDef): Promise<void> {
  if (!area.hlodExtentWF) throw new Error(`area ${area.id}: hlodExtentWF missing`);
  const src = ctx.lockSources().find((s) => s.id === OSM_SOURCE);
  if (!src) throw new Error('landcover: osm-kanto missing in sources.lock');
  const pbf = join(ctx.repoRoot, 'data/raw', OSM_SOURCE, src.url.split('/').pop() as string);
  const t0 = performance.now();
  const seq = await extractLandcoverOsm(pbf, area.hlodExtentWF, join(ctx.repoRoot, 'data/derived/.work/landcover'));
  const features = await readLandcoverFeatures(seq);
  const grid = createLcGrid(area.hlodExtentWF);
  paintSea(grid, readFarDem(join(ctx.repoRoot, 'data/derived/terrain-far')));
  paintFeatures(grid, features);
  writeLandcover(join(ctx.repoRoot, 'data/derived/landcover'), grid, [OSM_SOURCE, 'gsi-dem-tiles'], ctx.log);
  ctx.log.info(`landcover prep: ${features.length} features, ${Math.round((performance.now() - t0) / 1000)} s`);
}

/** derived → 빌드 shared/landcover + world.json files.landcover(없으면 추가). */
function install(ctx: LandcoverCtx, buildId: string): void {
  const from = join(ctx.repoRoot, 'data/derived/landcover');
  const build = join(ctx.repoRoot, 'data/build', buildId);
  if (!existsSync(join(build, 'world.json'))) throw new Error(`landcover: build ${buildId} not found`);
  const meta = JSON.parse(readFileSync(join(from, 'landcover.json'), 'utf8')) as LandcoverMeta;
  const to = join(build, 'shared/landcover');
  mkdirSync(to, { recursive: true });
  copyFileSync(join(from, meta.file), join(to, meta.file));
  copyFileSync(join(from, 'landcover.json'), join(to, 'landcover.json'));
  const worldPath = join(build, 'world.json');
  const world = JSON.parse(readFileSync(worldPath, 'utf8')) as { files: Record<string, string> };
  if (world.files.landcover !== LANDCOVER_WORLD_PATH) {
    world.files = { ...world.files, landcover: LANDCOVER_WORLD_PATH };
    writeFileSync(worldPath, `${JSON.stringify(world, null, 2)}\n`);
  }
  ensureLandcoverNote(build);
  ctx.log.info(`landcover → ${buildId}/shared/landcover (${meta.width}×${meta.height} @ ${meta.step} m)`);
}

/** `landcover --prep [--area <id>]` | `landcover --build-id <id>`. */
export async function landcover(ctx: LandcoverCtx, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      prep: { type: 'boolean', default: false },
      'build-id': { type: 'string' },
      area: { type: 'string', default: 'mvp-shibuya-shinjuku' },
    },
  });
  if (values.prep) await prep(ctx, ctx.readArea(values.area));
  if (values['build-id']) install(ctx, values['build-id']);
  if (!values.prep && !values['build-id']) throw new Error('landcover: --prep and/or --build-id <id>');
}
