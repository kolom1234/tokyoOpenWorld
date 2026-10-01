// CLI 에셋 단계(cli.ts에서 분리): materials(KTX2 배열, M03-T01), avatar(Quaternius → 게임 GLB, 결정 2), trees(수종·잎·임포스터, M05-T04).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Logger } from '@sanpo/core';
import { type AvatarLock, buildAvatar } from './stages/avatar/run.ts';
import type { LockSource } from './stages/fixture.ts';
import type { AmbientLock } from './stages/materials/fetch.ts';
import { readLibrary } from './stages/materials/library.ts';
import { buildMaterials, installMaterials } from './stages/materials/run.ts';
import { buildTreeAssets } from './stages/trees/run.ts';

export interface AssetCtx {
  repoRoot: string;
  log: Logger;
  lockSources: () => LockSource[];
}

/** 머티리얼 라이브러리(M03-T01): content/materials/library.json → data/derived/materials/<hash> → (--build-id) 빌드 shared/materials. 컨테이너 전용. */
export async function materials(ctx: AssetCtx, args: string[]): Promise<void> {
  const { repoRoot: REPO_ROOT, log } = ctx;
  const LOCK_PATH = join(REPO_ROOT, 'data/sources.lock.json');
  const { values } = parseArgs({
    args,
    options: {
      'build-id': { type: 'string' },
      'update-lock': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const lockFile = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as { sources: (LockSource | AmbientLock)[] };
  const lock = lockFile.sources.find((s) => s.id === 'ambientcg') as AmbientLock | undefined;
  if (!lock) throw new Error('sources.lock.json: no "ambientcg" source');
  const mlog = log.child('materials');
  const r = await buildMaterials({
    library: readLibrary(join(REPO_ROOT, 'content/materials/library.json')),
    lock,
    updateLock: values['update-lock'],
    rawDir: join(REPO_ROOT, 'data/raw/ambientcg'),
    derivedDir: join(REPO_ROOT, 'data/derived'),
    log: mlog,
    force: values.force,
  });
  if (values['update-lock'])
    writeFileSync(
      LOCK_PATH,
      `${JSON.stringify(lockFile, null, 2)}
`,
    );
  const t = r.manifest.textures;
  mlog.info(
    `materials ${r.manifest.hash}${r.cached ? ' (cached)' : ''}: ${r.manifest.layerCount} layers, ` +
      `albedo ${(t.albedo.bytes / 1e6).toFixed(2)} MB, normal ${(t.normal.bytes / 1e6).toFixed(2)} MB, orm ${(t.orm.bytes / 1e6).toFixed(2)} MB`,
  );
  if (values['build-id'])
    mlog.info(`installed → ${installMaterials(r.dir, join(REPO_ROOT, 'data/build', values['build-id']))}`);
}

/** 나무 수종 에셋(M05-T04, 호스트 Node): ez-tree 생성 + 잎 아틀라스 + 임포스터 → apps/game/src/assets/trees. */
export async function trees(ctx: AssetCtx): Promise<void> {
  await buildTreeAssets({ repoRoot: ctx.repoRoot, log: ctx.log.child('trees') });
}

export async function avatar(ctx: AssetCtx): Promise<void> {
  await buildAvatar({
    repoRoot: ctx.repoRoot,
    lock: ctx.lockSources() as unknown as AvatarLock[],
    log: ctx.log.child('avatar'),
  });
}
