// 군중 팩(M06-T01, ADR-0057): Rocketbox 베이스 12종 → 결합 메시(LOD 4)·클립 5종(성별별) 뼈 팔레트·아틀라스 층(부위 512²) →
// apps/game/src/assets/characters/{crowd.json, crowd.bin(meshopt 덩어리 이어 붙임), crowd.ktx2(12층 배열)}. 렌더 = packages/render/src/internal/crowd.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeIndices, encodeStream, paletteHalf, vertexStreams } from './crowd-encode.ts';
import { loadClipFbx } from './fbx.ts';
import { atlasOf, encodeKtx2, prepareAvatar, type Read, sampleAll } from './prepare.ts';
import { RIG_BONES } from './rig.ts';
import { type Catalog, clipFile, type Sex } from './source.ts';
import type { Rgba } from './tga.ts';

export const CROWD_DIR = 'apps/game/src/assets/characters';
type Range = [number, number];

export interface CrowdManifest {
  version: 1;
  fps: number;
  bones: number;
  files: { bin: string; texture: string };
  clips: string[];
  bases: {
    id: string;
    sex: Sex;
    weight: number;
    heightM: number;
    feetY: number;
    vertexCount: number;
    streams: Record<'position' | 'normal' | 'uv' | 'joints' | 'weights', Range>;
    lods: { index: Range; count: number; maxDistM: number }[];
    anim: {
      frames: number;
      range: Range;
      clips: { name: string; start: number; frames: number; durationS: number; speedMs: number }[];
    };
  }[];
}

class Blob {
  parts: Uint8Array[] = [];
  size = 0;
  push(b: Uint8Array): Range {
    const r: Range = [this.size, b.byteLength];
    this.parts.push(b);
    this.size += b.byteLength;
    return r;
  }
  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const p of this.parts) {
      out.set(p, o);
      o += p.byteLength;
    }
    return out;
  }
}

type ManifestBase = CrowdManifest['bases'][number];

/** 베이스 1개: 결합 메시·클립 표본 → 정점 스트림·LOD 인덱스·팔레트를 blob에, 아틀라스 층. */
async function bakeBase(
  read: Read,
  c: Catalog,
  b: Catalog['bases'][number],
  fbxClips: readonly ReturnType<typeof loadClipFbx>[],
  blob: Blob,
): Promise<{ entry: ManifestBase; layer: Rgba }> {
  const relax = fbxClips[0];
  if (!relax) throw new Error('catalog: no clips');
  const p = await prepareAvatar(
    read,
    b,
    relax,
    c.lods.map((l) => l.maxTris),
  );
  const specs = c.clips.map((k, i) => ({
    name: k.name,
    clip: fbxClips[i] as typeof relax,
    ...(k.trim ? { trim: true } : {}),
  }));
  const sampled = sampleAll(p, specs, c);
  const s = vertexStreams(p.mesh);
  const n = p.mesh.pos.length / 3;
  const streams = {
    position: blob.push(encodeStream(s.position, n, 12)),
    normal: blob.push(encodeStream(s.normal, n, 4)),
    uv: blob.push(encodeStream(s.uv, n, 4)),
    joints: blob.push(encodeStream(s.joints, n, 4)),
    weights: blob.push(encodeStream(s.weights, n, 4)),
  };
  const lods = p.mesh.lods.map((idx, i) => ({
    index: blob.push(encodeIndices(idx)),
    count: idx.length,
    maxDistM: c.lods[i]?.maxDistM ?? 1e9,
  }));
  let start = 0;
  const clips = sampled.map((k) => {
    const e = { name: k.name, start, frames: k.frames, durationS: k.durationS, speedMs: k.speedMs };
    start += k.frames;
    return e;
  });
  const pal = paletteHalf(sampled, p.restWorld);
  const anim = { frames: start, range: blob.push(encodeStream(pal, RIG_BONES.length * start, 16)), clips };
  const entry: ManifestBase = {
    id: b.id,
    sex: b.sex,
    weight: b.weight ?? 1,
    heightM: p.mesh.heightM,
    feetY: p.mesh.feetY,
    vertexCount: n,
    streams,
    lods,
    anim,
  };
  return { entry, layer: atlasOf(read, b, p.mesh, c.textures.crowdPart) };
}

export async function buildCrowdPack(repoRoot: string, read: Read, c: Catalog, log: Logger): Promise<void> {
  await MeshoptEncoder.ready;
  const blob = new Blob();
  const layers: Rgba[] = [];
  const bases: ManifestBase[] = [];
  const clipsBySex = new Map<Sex, ReturnType<typeof loadClipFbx>[]>();
  for (const sex of ['m', 'f'] as const)
    clipsBySex.set(
      sex,
      c.clips.map((k) => loadClipFbx(read(clipFile(k[sex])))),
    );
  for (const b of c.bases) {
    const { entry, layer } = await bakeBase(read, c, b, clipsBySex.get(b.sex) ?? [], blob);
    bases.push(entry);
    layers.push(layer);
    const tris = entry.lods.map((l) => l.count / 3).join('/');
    log.info(
      `crowd ${b.id}: ${entry.vertexCount} verts, lods ${tris} tris, ${entry.anim.frames} frames, height ${entry.heightM.toFixed(2)} m`,
    );
  }
  const dir = join(repoRoot, CROWD_DIR);
  mkdirSync(dir, { recursive: true });
  const manifest: CrowdManifest = {
    version: 1,
    fps: c.fps,
    bones: RIG_BONES.length,
    files: { bin: 'crowd.bin', texture: 'crowd.ktx2' },
    clips: c.clips.map((k) => k.name),
    bases,
  };
  const bin = blob.bytes();
  writeFileSync(join(dir, 'crowd.bin'), bin);
  writeFileSync(
    join(dir, 'crowd.json'),
    `${JSON.stringify(manifest, null, 1)}
`,
  );
  const ktx = await encodeKtx2(layers, join(dir, 'crowd.ktx2'));
  log.info(
    `crowd pack: ${bases.length} bases, bin ${(bin.byteLength / 1e3).toFixed(0)} KB, ktx2 ${(ktx / 1e3).toFixed(0)} KB`,
  );
}
