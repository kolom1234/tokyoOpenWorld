// 군중 팩 적재(M06-T01, ADR-0057): crowd.json + crowd.bin(meshopt 덩어리) + crowd.ktx2(12층 배열) → 베이스별 정점 속성·LOD 인덱스,
// 뼈 팔레트 텍스처(RGBA16F, 너비 2048 — 텍셀 = ((행 × 뼈) + 뼈) × 2 + {사원수, 이동}, 행 = 베이스 시작 + 클립 시작 + 프레임).
// 디코드는 베이스마다 끊어 메인 스레드 단일 작업을 짧게(01 §8). 파이프라인 = tools/pipeline/src/stages/characters/crowd.ts
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import {
  BufferAttribute,
  ClampToEdgeWrapping,
  DataTexture,
  HalfFloatType,
  LinearMipmapLinearFilter,
  NearestFilter,
  RGBAFormat,
  type Texture,
} from 'three/webgpu';
import type { CrowdAssetUrls } from '../../api.ts';

export const PALETTE_WIDTH = 2048;

type Range = [number, number];
export interface CrowdManifest {
  version: number;
  fps: number;
  bones: number;
  clips: string[];
  bases: {
    id: string;
    sex: 'm' | 'f';
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

export interface CrowdBase {
  id: string;
  weight: number;
  attributes: Record<'position' | 'normal' | 'uv' | '_joints' | '_weights', BufferAttribute>;
  lods: { index: BufferAttribute; maxDistM: number }[];
  /** 팔레트 행 시작(이 베이스 첫 클립 첫 프레임). */
  row0: number;
  clips: { start: number; frames: number }[];
}

export interface CrowdAssets {
  manifest: CrowdManifest;
  bases: CrowdBase[];
  palette: DataTexture;
  atlas: Texture;
  bones: number;
}

const yieldTask = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function decodeVertex(bin: Uint8Array, r: Range, count: number, size: number): Uint8Array {
  const out = new Uint8Array(count * size);
  MeshoptDecoder.decodeVertexBuffer(out, count, size, bin.subarray(r[0], r[0] + r[1]));
  return out;
}

function decodeIndex(bin: Uint8Array, r: Range, count: number): Uint16Array {
  const out = new Uint16Array(count);
  MeshoptDecoder.decodeIndexBuffer(new Uint8Array(out.buffer), count, 2, bin.subarray(r[0], r[0] + r[1]));
  return out;
}

function baseAttributes(bin: Uint8Array, b: CrowdManifest['bases'][number]): CrowdBase['attributes'] {
  const n = b.vertexCount;
  const raw = (k: keyof typeof b.streams, size: number) => decodeVertex(bin, b.streams[k], n, size);
  return {
    position: new BufferAttribute(new Float32Array(raw('position', 12).buffer), 3),
    normal: new BufferAttribute(new Int8Array(raw('normal', 4).buffer), 4, true),
    uv: new BufferAttribute(new Uint16Array(raw('uv', 4).buffer), 2, true),
    _joints: new BufferAttribute(raw('joints', 4), 4, true),
    _weights: new BufferAttribute(raw('weights', 4), 4, true),
  };
}

/** 뼈-우선(파일) → 프레임-우선(텍스처) 재배열. dst 텍셀 = ((row0 + f) × bones + j) × 2 + k. */
function fillPalette(dst: Uint16Array, src: Uint16Array, row0: number, frames: number, bones: number): void {
  for (let j = 0; j < bones; j++)
    for (let f = 0; f < frames; f++) {
      const s = (j * frames + f) * 8;
      const d = ((row0 + f) * bones + j) * 8;
      for (let k = 0; k < 8; k++) dst[d + k] = src[s + k] as number;
    }
}

async function loadAtlas(ktx2: KTX2Loader, url: string): Promise<Texture> {
  const t = (await ktx2.loadAsync(url)) as unknown as Texture;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  if (t.mipmaps && t.mipmaps.length > 1) t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export async function loadCrowdAssets(urls: CrowdAssetUrls, ktx2: KTX2Loader): Promise<CrowdAssets> {
  const [manifest, binBuf, atlas] = await Promise.all([
    fetch(urls.manifest).then((r) => {
      if (!r.ok) throw new Error(`crowd manifest HTTP ${r.status}`);
      return r.json() as Promise<CrowdManifest>;
    }),
    fetch(urls.bin).then((r) => {
      if (!r.ok) throw new Error(`crowd bin HTTP ${r.status}`);
      return r.arrayBuffer();
    }),
    loadAtlas(ktx2, urls.texture),
    MeshoptDecoder.ready,
  ]);
  const bin = new Uint8Array(binBuf);
  const bones = manifest.bones;
  const rows = manifest.bases.reduce((s, b) => s + b.anim.frames, 0);
  const height = Math.ceil((rows * bones * 2) / PALETTE_WIDTH);
  const texels = new Uint16Array(PALETTE_WIDTH * height * 4);
  const bases: CrowdBase[] = [];
  let row0 = 0;
  for (const b of manifest.bases) {
    await yieldTask();
    const pal = decodeVertex(bin, b.anim.range, bones * b.anim.frames, 16);
    fillPalette(texels, new Uint16Array(pal.buffer), row0, b.anim.frames, bones);
    bases.push({
      id: b.id,
      weight: b.weight,
      attributes: baseAttributes(bin, b),
      lods: b.lods.map((l) => ({
        index: new BufferAttribute(decodeIndex(bin, l.index, l.count), 1),
        maxDistM: l.maxDistM,
      })),
      row0,
      clips: b.anim.clips.map((c) => ({ start: c.start, frames: c.frames })),
    });
    row0 += b.anim.frames;
  }
  const palette = new DataTexture(texels, PALETTE_WIDTH, height, RGBAFormat, HalfFloatType);
  palette.minFilter = NearestFilter;
  palette.magFilter = NearestFilter;
  palette.generateMipmaps = false;
  palette.needsUpdate = true;
  return { manifest, bases, palette, atlas, bones };
}
