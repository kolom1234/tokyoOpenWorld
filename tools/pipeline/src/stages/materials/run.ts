// materials 단계: library.json → ambientCG zip(sha256 고정) → 레이어 PNG → KTX2 배열 3장 + 실내 큐브맵 배열(자체 생성, M03-T05) + manifest.json
// 캐시 = data/derived/materials/<hash>/ (library·인코더 설정·toktx 버전 해시), --build-id면 data/build/<id>/shared/materials/로 복사.
// see docs/07-rendering.md §4, docs/05-tile-format.md §1, docs/modules/pipeline.md
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Logger } from '@sanpo/core';
import { ENCODE_ARGS, encodeArray, type LayerImages, prepareLayer } from './encode.ts';
import { type AmbientLock, fetchAssets, sha256Of } from './fetch.ts';
import { INTERIOR_FACE_SIZE, INTERIOR_VERSION, writeInteriorFaces } from './interiors.ts';
import { groupsOf, type Library, type MaterialsManifest } from './library.ts';

const run = promisify(execFile);
/** 동시 ImageMagick 작업 수. */
const PREP_JOBS = 8;
export const MANIFEST_FILE = 'manifest.json';
const TEXTURE_FILES = { albedo: 'albedo.ktx2', normal: 'normal.ktx2', orm: 'orm.ktx2' } as const;
const INTERIORS_FILE = 'interiors.ktx2';

export interface MaterialsInput {
  library: Library;
  lock: AmbientLock;
  updateLock: boolean;
  rawDir: string;
  derivedDir: string;
  log: Logger;
  force?: boolean;
}

export interface MaterialsResult {
  dir: string;
  manifest: MaterialsManifest;
  cached: boolean;
}

async function toolVersion(): Promise<string> {
  const { stdout } = await run('toktx', ['--version']);
  return stdout.trim();
}

export function materialsHash(library: Library, toktx: string): string {
  const interiors = { v: INTERIOR_VERSION, size: INTERIOR_FACE_SIZE };
  return sha256Of(new TextEncoder().encode(JSON.stringify({ library, ENCODE_ARGS, toktx, interiors }))).slice(0, 16);
}

async function prepareAll(
  zips: Map<string, string>,
  library: Library,
  work: string,
): Promise<Map<string, LayerImages>> {
  const assets = [...new Set(library.layers.map((l) => l.asset))];
  const out = new Map<string, LayerImages>();
  for (let i = 0; i < assets.length; i += PREP_JOBS) {
    const batch = assets.slice(i, i + PREP_JOBS);
    const done = await Promise.all(
      batch.map((a) => prepareLayer(zips.get(a) as string, a, work, library.size, library.detailSize)),
    );
    for (const [k, a] of batch.entries()) out.set(a, done[k] as LayerImages);
  }
  return out;
}

export async function buildMaterials(o: MaterialsInput): Promise<MaterialsResult> {
  const hash = materialsHash(o.library, await toolVersion());
  const dir = join(o.derivedDir, 'materials', hash);
  const manifestPath = join(dir, MANIFEST_FILE);
  if (!o.force && existsSync(manifestPath)) {
    return { dir, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as MaterialsManifest, cached: true };
  }
  const assets = [...new Set(o.library.layers.map((l) => l.asset))];
  const zips = await fetchAssets({ assets, rawDir: o.rawDir, lock: o.lock, updateLock: o.updateLock, log: o.log });
  const work = join(dir, 'work');
  mkdirSync(work, { recursive: true });
  const t0 = performance.now();
  const images = await prepareAll(zips, o.library, work);
  o.log.info(`prepared ${images.size} assets in ${Math.round(performance.now() - t0)} ms`);
  const layerImages = o.library.layers.map((l) => images.get(l.asset) as LayerImages);
  const textures = {} as MaterialsManifest['textures'];
  for (const kind of ['albedo', 'normal', 'orm'] as const) {
    const t1 = performance.now();
    const file = TEXTURE_FILES[kind];
    const bytes = await encodeArray(
      kind,
      layerImages.map((im) => im[kind]),
      join(dir, file),
    );
    const encode = kind === 'albedo' ? 'etc1s' : 'uastc';
    const size = kind === 'albedo' ? o.library.size : o.library.detailSize;
    textures[kind] = { file, bytes, size, encode, colorSpace: kind === 'albedo' ? 'srgb' : 'linear' };
    o.log.info(`${file}: ${(bytes / 1e6).toFixed(2)} MB in ${Math.round(performance.now() - t1)} ms`);
  }
  const interiors = await buildInteriors(dir, work, o.log);
  const manifest: MaterialsManifest = {
    schema: 1,
    layerCount: o.library.layers.length,
    textures,
    layers: o.library.layers.map((l, index) => {
      const im = layerImages[index] as LayerImages;
      return {
        id: l.id,
        group: l.group,
        index,
        tileM: l.tileM,
        avgColor: im.avgColor,
        avgOrm: im.avgOrm,
        source: `ambientcg:${l.asset}`,
      };
    }),
    groups: groupsOf(o.library.layers),
    interiors,
    hash,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest, cached: false };
}

/** 실내 큐브맵 48면 생성 → ETC1S sRGB 배열 1장(알베도와 같은 인코더 설정). */
async function buildInteriors(
  dir: string,
  work: string,
  log: Logger,
): Promise<NonNullable<MaterialsManifest['interiors']>> {
  const t0 = performance.now();
  const faces = join(work, 'interiors');
  mkdirSync(faces, { recursive: true });
  const img = writeInteriorFaces(faces);
  const bytes = await encodeArray('albedo', img.files, join(dir, INTERIORS_FILE));
  log.info(
    `${INTERIORS_FILE}: ${img.rooms.length} rooms, ${(bytes / 1e6).toFixed(2)} MB in ${Math.round(performance.now() - t0)} ms`,
  );
  return {
    file: INTERIORS_FILE,
    bytes,
    size: INTERIOR_FACE_SIZE,
    encode: 'etc1s',
    colorSpace: 'srgb',
    faces: 6,
    rooms: img.rooms,
  };
}

/** 캐시 → 빌드 폴더(shared/materials). world.json files.materials = shared/materials/manifest.json(05 §2). */
export function installMaterials(fromDir: string, buildDir: string): string {
  const dest = join(buildDir, 'shared', 'materials');
  mkdirSync(dest, { recursive: true });
  for (const f of [MANIFEST_FILE, ...Object.values(TEXTURE_FILES), INTERIORS_FILE])
    cpSync(join(fromDir, f), join(dest, f));
  return dest;
}
