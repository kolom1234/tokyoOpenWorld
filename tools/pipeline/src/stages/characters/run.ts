// `pnpm pipeline characters`(M06 사전 1·M06-T01, ADR-0057): Microsoft Rocketbox(MIT) FBX·TGA → 플레이어 아바타(스킨 GLB + KTX2 아틀라스)
// + 군중 팩(베이스 12종 LOD·뼈 팔레트 텍스처·KTX2 배열, crowd.ts). 산출 = apps/game/src/assets/characters(게임 해시 에셋, 첫 표시 뒤 적재).
// 컨테이너 전용(toktx). see docs/adr/0057-rocketbox-characters.md
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { buildCrowdPack } from './crowd.ts';
import { loadClipFbx } from './fbx.ts';
import { writePlayerGlb } from './player.ts';
import { atlasOf, encodeKtx2, prepareAvatar, type Read, sampleAll } from './prepare.ts';
import { type Catalog, clipFile, ensureSources, type RocketboxLock, readCatalog } from './source.ts';

export const CHAR_OUT = 'apps/game/src/assets/characters';
export const PLAYER_GLB = 'avatar-rb.glb';
export const PLAYER_KTX2 = 'avatar-rb.ktx2';
export const GENERATOR = 'sanpo pipeline characters (Microsoft Rocketbox, MIT)';

async function buildPlayer(repoRoot: string, read: Read, c: Catalog, log: Logger): Promise<void> {
  const walk = c.clips.find((k) => k.name === 'walk');
  if (!walk) throw new Error('catalog: no walk clip');
  const relax = loadClipFbx(read(clipFile(walk[c.player.sex])));
  const p = await prepareAvatar(read, c.player, relax, [0]);
  const clips = sampleAll(
    p,
    c.playerClips.map((k) => ({
      name: k.name,
      clip: loadClipFbx(read(clipFile(k.file))),
      ...(k.trim ? { trim: true } : {}),
    })),
    c,
  );
  const glb = await writePlayerGlb({
    mesh: p.mesh,
    parents: p.parents,
    restWorld: p.restWorld,
    clips,
    fps: c.fps,
    generator: GENERATOR,
  });
  const dir = join(repoRoot, CHAR_OUT);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, PLAYER_GLB), glb);
  const ktx = await encodeKtx2([atlasOf(read, c.player, p.mesh, c.textures.playerPart)], join(dir, PLAYER_KTX2));
  const tris = (p.mesh.lods[0]?.length ?? 0) / 3;
  log.info(
    `player ${c.player.id}: ${p.mesh.pos.length / 3} verts, ${tris} tris, height ${p.mesh.heightM.toFixed(2)} m, ` +
      `glb ${(glb.byteLength / 1e3).toFixed(0)} KB, ktx2 ${(ktx / 1e3).toFixed(0)} KB, clips ${clips
        .map((k) => `${k.name} ${k.frames}f ${k.speedMs.toFixed(2)} m/s`)
        .join(', ')}`,
  );
}

export async function buildCharacters(o: {
  repoRoot: string;
  lock: RocketboxLock;
  updateLock: boolean;
  log: Logger;
  only?: 'player' | 'crowd';
}): Promise<void> {
  const catalog = readCatalog(o.repoRoot);
  const read = await ensureSources({
    repoRoot: o.repoRoot,
    catalog,
    lock: o.lock,
    updateLock: o.updateLock,
    log: o.log,
  });
  if (o.only !== 'crowd') await buildPlayer(o.repoRoot, read, catalog, o.log);
  if (o.only !== 'player') await buildCrowdPack(o.repoRoot, read, catalog, o.log);
}
