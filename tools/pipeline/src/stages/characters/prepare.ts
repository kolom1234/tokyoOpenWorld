// 캐릭터 공용 준비(ADR-0057): 아바타 FBX → 편 손 자세·결합 메시·리그 휴지 행렬, 아틀라스 층, KTX2 인코드(toktx), 클립 일괄 표본.
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { encodePngRgba } from '../../lib/png.ts';
import { buildAtlasLayer } from './atlas.ts';
import { type FbxAvatar, type FbxClip, loadAvatarFbx } from './fbx.ts';
import { buildCharMesh, type CharMesh } from './mesh.ts';
import { captureRest, restoreRest, type SampledClip, sampleClip } from './pose.ts';
import { relaxFingers, rigParents, rigWorld } from './rig.ts';
import { avatarFiles, type Catalog, type CatalogBase } from './source.ts';
import { decodeTga, type Rgba } from './tga.ts';

const run = promisify(execFile);
/** 알베도 ETC1S sRGB(머티리얼 라이브러리와 같은 설정) + 알파(머리털). */
export const ETC1S = ['--encode', 'etc1s', '--clevel', '4', '--qlevel', '255', '--assign_oetf', 'srgb'];

export type Read = (rel: string) => Uint8Array;

export interface PreparedAvatar {
  av: FbxAvatar;
  mesh: CharMesh;
  parents: number[];
  restWorld: ReturnType<typeof rigWorld>;
  rest: ReturnType<typeof captureRest>;
}

/** FBX → 편 손 자세 → 결합 메시(LOD) + 리그 휴지 행렬. relax = 같은 성별 걷기 클립. */
export async function prepareAvatar(read: Read, b: CatalogBase, relax: FbxClip, lodTris: readonly number[]) {
  const av = loadAvatarFbx(read(avatarFiles(b).fbx));
  relaxFingers(av, relax);
  const rest = captureRest(av);
  const restWorld = rigWorld(av);
  const mesh = await buildCharMesh(av, lodTris);
  return { av, mesh, parents: rigParents(av), restWorld, rest } satisfies PreparedAvatar;
}

/** 아바타 텍스처 TGA 3장 → 아틀라스 층. */
export function atlasOf(read: Read, b: CatalogBase, mesh: CharMesh, part: number): Rgba {
  const f = avatarFiles(b);
  const parts = [f.body, f.head, f.hair].map((p) => (p ? decodeTga(read(p)) : undefined));
  return buildAtlasLayer(mesh, parts, part);
}

/** 층 PNG들 → KTX2(층 1개면 2D, 여럿이면 배열). 반환 = 바이트 수. */
export async function encodeKtx2(layers: readonly Rgba[], out: string): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), 'sanpo-char-'));
  try {
    const files = layers.map((l, i) => {
      const f = join(dir, `layer${i}.png`);
      writeFileSync(f, encodePngRgba(l.width, l.height, l.data));
      return f;
    });
    const arr = layers.length > 1 ? ['--layers', String(layers.length)] : [];
    await run('toktx', ['--t2', '--genmipmap', ...arr, ...ETC1S, out, ...files], { maxBuffer: 64 << 20 });
    return statSync(out).size;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function sampleAll(
  p: PreparedAvatar,
  clips: readonly { name: string; clip: FbxClip; trim?: boolean }[],
  c: Catalog,
) {
  const out: SampledClip[] = clips.map((k) =>
    sampleClip(p.av, k.clip, {
      name: k.name,
      fps: c.fps,
      ...(k.trim ? { trim: { lengthS: c.loopTrimS, blendS: c.loopBlendS } } : {}),
    }),
  );
  restoreRest(p.av, p.rest);
  return out;
}
