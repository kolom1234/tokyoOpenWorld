// CLI 파사드 실측(M12-T06, S1 — ADR-0111, cli.ts 400줄 제한으로 분리): `facades --prep`(컨테이너 — unzip·ImageMagick):
// 영역 L0 건물(정규화)의 텍스처 벽 → PLATEAU zip에서 그 appearance 폴더만 풀기 → 256 px PPM으로 병렬 변환 → 건물별 벽 색·유리 비율
// → data/derived/facades/measures.json. build·hlod는 facade-tint `loadFacadeMeasures`로 읽는다.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { type CellKey, type Logger, packCellKey } from '@sanpo/core';
import type { BuildingRecord } from './readers/plateau/types.ts';
import { readLayer } from './stages/build/area-reader.ts';
import type { AreaDef } from './stages/build/manifest.ts';
import { type FacadeMeasure, measureBuilding, type RgbImage } from './stages/derive/facade-measure.ts';

const run = promisify(execFile);
const BIG = { maxBuffer: 1 << 26 };
/** 변환 해상도(긴 변 px) — 면당 20×20 표본이면 충분. */
const PPM_MAX = 256;
const CACHE = 256;

export interface FacadesCtx {
  repoRoot: string;
  log: Logger;
  readArea(id: string): AreaDef;
  lockSources(): readonly { id: string; url: string }[];
}

/** P6 PPM(8-bit) → RGB. */
export function parsePpm(buf: Uint8Array): RgbImage {
  const head: string[] = [];
  let i = 0;
  let tok = '';
  while (head.length < 4 && i < buf.length) {
    const c = buf[i++] as number;
    if (c === 35)
      while (i < buf.length && buf[i] !== 10) i++; // # 주석
    else if (c === 32 || c === 10 || c === 13 || c === 9) {
      if (tok) head.push(tok);
      tok = '';
    } else tok += String.fromCharCode(c);
  }
  if (head[0] !== 'P6' || head[3] !== '255') throw new Error('ppm: only 8-bit P6');
  const width = Number(head[1]);
  const height = Number(head[2]);
  return { width, height, data: buf.subarray(i, i + width * height * 3) };
}

function areaBuildings(ctx: FacadesCtx, area: AreaDef): BuildingRecord[] {
  const keys: CellKey[] = [];
  for (let ix = area.l0.minIx; ix <= area.l0.maxIx; ix++)
    for (let iz = area.l0.minIz; iz <= area.l0.maxIz; iz++) keys.push(packCellKey(0, ix, iz));
  const dir = join(ctx.repoRoot, 'data/normalized');
  return keys.flatMap((k) => readLayer<BuildingRecord>(dir, 'buildings', k));
}

/** 원천별로 필요한 appearance 폴더만 풀고 256 px PPM으로 변환(병렬). 반환 = 원천 → 작업 폴더. */
async function extract(ctx: FacadesCtx, buildings: readonly BuildingRecord[]): Promise<Map<string, string>> {
  const dirs = new Map<string, Set<string>>();
  for (const b of buildings)
    for (const s of b.surfaces)
      if (s.tex)
        (dirs.get(b.source) ?? dirs.set(b.source, new Set()).get(b.source))?.add(s.tex.split('/')[0] as string);
  const out = new Map<string, string>();
  for (const [source, set] of dirs) {
    const lock = ctx.lockSources().find((s) => s.id === source);
    if (!lock) continue;
    const zip = join(ctx.repoRoot, 'data/raw', source, lock.url.split('/').pop() as string);
    // 컨테이너 안 임시 폴더(호스트 바인드 마운트에 수천 개를 풀면 입출력이 매우 느리다 — Windows Docker 실측).
    const work = join(tmpdir(), 'sanpo-facades', source);
    mkdirSync(work, { recursive: true });
    const t0 = performance.now();
    await run('unzip', ['-q', '-o', zip, ...[...set].map((d) => `udx/bldg/${d}/*`), '-d', work], BIG);
    await run(
      'sh',
      [
        '-c',
        `find '${work}' -iname '*.jpg' -print0 | xargs -0 -P 16 -n 64 magick mogrify -resize '${PPM_MAX}x${PPM_MAX}>' -format ppm`,
      ],
      BIG,
    );
    ctx.log.info(`${source}: ${set.size} appearance dirs → ppm in ${Math.round((performance.now() - t0) / 1000)} s`);
    out.set(source, work);
  }
  return out;
}

/** 텍스처 경로 → PPM(작은 LRU). */
function imageLoader(work: string): (tex: string) => RgbImage | null {
  const cache = new Map<string, RgbImage | null>();
  return (tex) => {
    if (cache.has(tex)) return cache.get(tex) ?? null;
    const p = join(work, 'udx/bldg', tex.replace(/\.[^.]+$/, '.ppm'));
    const img = existsSync(p) ? parsePpm(new Uint8Array(readFileSync(p))) : null;
    if (cache.size >= CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(tex, img);
    return img;
  };
}

/** `facades --prep [--area <id>]`. */
export async function facades(ctx: FacadesCtx, args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { prep: { type: 'boolean', default: false }, area: { type: 'string', default: 'mvp-shibuya-shinjuku' } },
  });
  if (!values.prep) throw new Error('facades: --prep');
  const buildings = areaBuildings(ctx, ctx.readArea(values.area));
  const works = await extract(ctx, buildings);
  const loaders = new Map([...works].map(([s, w]) => [s, imageLoader(w)]));
  const out: Record<string, [number, number, number, number]> = {};
  let samples = 0;
  // 같은 텍스처를 쓰는 건물끼리 이어서(캐시 적중).
  const sorted = [...buildings].sort((a, b) => (firstTex(a) < firstTex(b) ? -1 : firstTex(a) > firstTex(b) ? 1 : 0));
  for (const b of sorted) {
    const load = loaders.get(b.source);
    const m: FacadeMeasure | null = load ? measureBuilding(b, load) : null;
    if (!m) continue;
    out[b.gmlId] = [...m.wall.map((v) => Math.round(v * 1e4) / 1e4), Math.round(m.glass * 1e3) / 1e3] as [
      number,
      number,
      number,
      number,
    ];
    samples += m.samples;
  }
  const dir = join(ctx.repoRoot, 'data/derived/facades');
  mkdirSync(dir, { recursive: true });
  const ids = Object.keys(out).sort();
  const json = { schema: 1, buildings: Object.fromEntries(ids.map((k) => [k, out[k]])) };
  writeFileSync(join(dir, 'measures.json'), `${JSON.stringify(json)}\n`);
  ctx.log.info(`facades: ${ids.length}/${buildings.length} buildings measured, ${samples} samples`);
}

const firstTex = (b: BuildingRecord): string => b.surfaces.find((s) => s.tex)?.tex ?? '';
