// 머티리얼 라이브러리 정의(content/materials/library.json) 읽기·검사 + 런타임 매니페스트 형식(schemas/materials.schema.json).
// see docs/07-rendering.md §4, docs/05-tile-format.md §1(shared/materials), docs/modules/pipeline.md
import { readFileSync } from 'node:fs';

export interface LibraryLayer {
  id: string;
  group: string;
  /** ambientCG asset id(예: Asphalt025C) → `<asset>_1K-JPG.zip`. */
  asset: string;
  /** 텍스처 한 장이 덮는 실제 크기(m). */
  tileM: number;
}

export interface Library {
  schema: 1;
  /** 알베도 레이어 한 변(px). */
  size: number;
  /** 법선·ORM 레이어 한 변(px) — 다운로드 절감(ADR-0027). */
  detailSize: number;
  layers: LibraryLayer[];
}

/** 런타임 매니페스트(shared/materials/manifest.json). render `materials/library.ts`가 소비. */
export interface MaterialsManifest {
  schema: 1;
  layerCount: number;
  textures: Record<
    'albedo' | 'normal' | 'orm',
    { file: string; bytes: number; size: number; encode: 'etc1s' | 'uastc'; colorSpace: 'srgb' | 'linear' }
  >;
  layers: {
    id: string;
    group: string;
    index: number;
    tileM: number;
    /** 알베도 평균(sRGB 0–1) — 텍스처 적재 전·원거리 단색. */
    avgColor: [number, number, number];
    /** ORM 평균(ao, roughness, metalness). */
    avgOrm: [number, number, number];
    source: string;
  }[];
  groups: Record<string, number[]>;
  /** 실내 큐브맵 배열(M03-T05): 레이어 = 방 × 6 + 면(+X, −X, +Y, −Y, +Z, −Z). 옛 빌드엔 없음. */
  interiors?: {
    file: string;
    bytes: number;
    size: number;
    encode: 'etc1s';
    colorSpace: 'srgb';
    faces: 6;
    rooms: { id: string; avgColor: [number, number, number] }[];
  };
  /** library.json + 인코더 설정 해시(캐시 키). */
  hash: string;
}

const ID = /^[a-z0-9_]{1,40}$/;
const ASSET = /^[A-Za-z]+[0-9]+[A-Z]?$/;

export function parseLibrary(text: string): Library {
  const lib = JSON.parse(text) as Library;
  if (lib.schema !== 1) throw new Error(`library.json: schema ${String(lib.schema)} (expected 1)`);
  for (const s of [lib.size, lib.detailSize]) {
    if (!Number.isInteger(s) || s < 64 || s > 2048 || (s & (s - 1)) !== 0) {
      throw new Error(`library.json: size ${s} must be a power of two in 64..2048`);
    }
  }
  const seen = new Set<string>();
  for (const l of lib.layers) {
    if (!ID.test(l.id) || !ID.test(l.group)) throw new Error(`library.json: bad id/group "${l.id}"/"${l.group}"`);
    if (seen.has(l.id)) throw new Error(`library.json: duplicate id ${l.id}`);
    if (!ASSET.test(l.asset)) throw new Error(`library.json: bad ambientCG asset "${l.asset}"`);
    if (!(l.tileM > 0 && l.tileM <= 20)) throw new Error(`library.json: ${l.id} tileM ${l.tileM} out of (0, 20]`);
    seen.add(l.id);
  }
  if (lib.layers.length === 0 || lib.layers.length > 256) throw new Error('library.json: 1..256 layers');
  return lib;
}

export function readLibrary(path: string): Library {
  return parseLibrary(readFileSync(path, 'utf8'));
}

/** 그룹 → 레이어 인덱스(정의 순서). */
export function groupsOf(layers: readonly Pick<LibraryLayer, 'group'>[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  layers.forEach((l, i) => {
    out[l.group] ??= [];
    out[l.group]?.push(i);
  });
  return out;
}

export const zipNameOf = (asset: string): string => `${asset}_1K-JPG.zip`;
export const AMBIENTCG_GET = 'https://ambientcg.com/get?file=';
