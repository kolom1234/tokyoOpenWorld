// 캐릭터 원천(M06 사전 1, ADR-0057): content/characters/catalog.json → Microsoft Rocketbox 저장소(커밋 고정) 상대 경로 목록,
// 없으면 raw.githubusercontent.com에서 내려받고 sources.lock `rocketbox`의 파일별 sha256으로 검사(--update-lock = 기록).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Logger } from '@sanpo/core';
import { sha256Of } from '../materials/fetch.ts';

export type Sex = 'm' | 'f';

export interface CatalogBase {
  id: string;
  /** 텍스처 접두사(예: m005 → m005_body_color.tga). */
  tex: string;
  /** Assets/Avatars/ 아래 폴더(예: Professions/Business_Male_01). */
  avatar: string;
  sex: Sex;
  /** 머리털 불투명 텍스처 없음(대머리 등). */
  hair?: boolean;
  /** 군중 선택 가중치. */
  weight?: number;
}

export interface CatalogClip {
  name: string;
  m: string;
  f: string;
  /** 긴 대기 클립 → loopTrimS 길이 + 끝 loopBlendS 교차 혼합으로 반복. */
  trim?: boolean;
}

export interface Catalog {
  version: number;
  repo: string;
  commit: string;
  fps: number;
  loopTrimS: number;
  loopBlendS: number;
  bases: CatalogBase[];
  player: CatalogBase;
  clips: CatalogClip[];
  playerClips: { name: string; file: string; trim?: boolean }[];
  /** maxTris 0 = 원본. maxDistM = 이 LOD를 쓰는 최대 거리(런타임). */
  lods: { maxTris: number; maxDistM: number }[];
  textures: { crowdPart: number; playerPart: number };
}

export interface RocketboxLock {
  id: 'rocketbox';
  sha256: Record<string, string>;
  [k: string]: unknown;
}

export const RAW_DIR = 'data/raw/rocketbox';
export const CATALOG = 'content/characters/catalog.json';

export const readCatalog = (repoRoot: string): Catalog =>
  JSON.parse(readFileSync(join(repoRoot, CATALOG), 'utf8')) as Catalog;

/** 아바타 원천 파일(저장소 상대 경로): FBX + 기본색 텍스처 2–3장. */
export function avatarFiles(b: CatalogBase): { fbx: string; body: string; head: string; hair?: string } {
  const name = b.avatar.split('/').pop() ?? b.avatar;
  const dir = `Assets/Avatars/${b.avatar}`;
  const tex = (part: string) => `${dir}/Textures/${b.tex}_${part}_color.tga`;
  return {
    fbx: `${dir}/Export/${name}.fbx`,
    body: tex('body'),
    head: tex('head'),
    ...(b.hair === false ? {} : { hair: tex('opacity') }),
  };
}

/** 클립 키(xy/m_walk_neutral_01) → 저장소 상대 경로. */
export const clipFile = (key: string): string => {
  const [kind, name] = key.split('/');
  return `Assets/Animations/all_animations_max_motextr_${kind}/${name}.max.fbx`;
};

export function allFiles(c: Catalog): string[] {
  const out = new Set<string>();
  for (const b of [...c.bases, c.player]) for (const f of Object.values(avatarFiles(b))) if (f) out.add(f);
  for (const k of c.clips) {
    out.add(clipFile(k.m));
    out.add(clipFile(k.f));
  }
  for (const k of c.playerClips) out.add(clipFile(k.file));
  return [...out].sort();
}

/** 원천 확보 + sha256 검사. 반환 = 저장소 상대 경로 → 바이트 읽기 함수. */
export async function ensureSources(o: {
  repoRoot: string;
  catalog: Catalog;
  lock: RocketboxLock;
  updateLock: boolean;
  log: Logger;
}): Promise<(rel: string) => Uint8Array> {
  const raw = join(o.repoRoot, RAW_DIR);
  for (const rel of allFiles(o.catalog)) {
    const path = join(raw, rel);
    if (!existsSync(path)) {
      const url = `https://raw.githubusercontent.com/${o.catalog.repo}/${o.catalog.commit}/${rel.split('/').map(encodeURIComponent).join('/')}`;
      o.log.info(`fetch ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`rocketbox: ${url} HTTP ${res.status}`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
    }
    const got = sha256Of(new Uint8Array(readFileSync(path)));
    if (o.updateLock) o.lock.sha256[rel] = got;
    else if (o.lock.sha256[rel] !== got)
      throw new Error(`rocketbox: ${rel} sha256 ${got} ≠ lock ${o.lock.sha256[rel] ?? '(missing)'}`);
  }
  return (rel) => new Uint8Array(readFileSync(join(raw, rel)));
}
