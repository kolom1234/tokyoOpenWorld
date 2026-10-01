// 나무 수종(M05-T04): OSM 태그(genus·species·name·leaf_type) → 수종, 없으면 문맥 기본값 — 가로수 = 도로마다 한 수종(도로 이름 표 → 없으면
// 선 이름·id 해시 가중 추첨: 은행 0.45·느티 0.25·벚 0.2·녹나무 0.1, 도쿄 가로수 구성 근사), 숲 = 상록 활엽(녹나무 계열) 위주 혼합, 공원 = 혼합.
// 크기 = 수종별 높이 범위 × 결정론 난수, 수관 반경 = 높이 비례. see ADR-0052
import { createRng, hash32, WORLD_SEED } from '@sanpo/core';
import { TREE_SPECIES, type TreeSpeciesName } from '@sanpo/tile-format';

export interface SpeciesSpec {
  /** 높이 범위(m). */
  height: [number, number];
  /** 수관 반경 / 높이. */
  crown: number;
}

export const SPECIES: Readonly<Record<TreeSpeciesName, SpeciesSpec>> = {
  ginkgo: { height: [11, 16], crown: 0.26 },
  zelkova: { height: [12, 18], crown: 0.38 },
  cherry: { height: [6, 9], crown: 0.55 },
  camphor: { height: [10, 16], crown: 0.4 },
  pine: { height: [6, 12], crown: 0.3 },
  shrub: { height: [1, 2], crown: 0.6 },
};

/** 도로 이름 → 가로수 수종(널리 알려진 것만 — 나머지는 해시 추첨). */
const STREET_SPECIES: Readonly<Record<string, TreeSpeciesName>> = {
  表参道: 'zelkova',
};

const STREET_MIX: readonly [TreeSpeciesName, number][] = [
  ['ginkgo', 0.45],
  ['zelkova', 0.25],
  ['cherry', 0.2],
  ['camphor', 0.1],
];
const FOREST_MIX: readonly [TreeSpeciesName, number][] = [
  ['camphor', 0.55],
  ['zelkova', 0.15],
  ['pine', 0.15],
  ['ginkgo', 0.05],
  ['cherry', 0.1],
];
const PARK_MIX: readonly [TreeSpeciesName, number][] = [
  ['zelkova', 0.3],
  ['cherry', 0.3],
  ['camphor', 0.2],
  ['ginkgo', 0.1],
  ['pine', 0.1],
];

function pick(mix: readonly [TreeSpeciesName, number][], u: number): TreeSpeciesName {
  let acc = 0;
  for (const [s, w] of mix) {
    acc += w;
    if (u < acc) return s;
  }
  return (mix[mix.length - 1] as [TreeSpeciesName, number])[0];
}

/** 태그로 정해지는 수종(없으면 undefined). */
export function speciesFromTags(t: Readonly<Record<string, string>>): TreeSpeciesName | undefined {
  const s = `${t.genus ?? ''} ${t.species ?? ''} ${t.name ?? ''}`.toLowerCase();
  if (/ginkgo|イチョウ|銀杏/.test(s)) return 'ginkgo';
  if (/zelkova|ケヤキ|欅/.test(s)) return 'zelkova';
  if (/prunus|cerasus|サクラ|桜/.test(s)) return 'cherry';
  if (/cinnamomum|クスノキ|楠|castanopsis|シイ|quercus|カシ|magnolia|ulmus/.test(s)) return 'camphor';
  if (/pinus|マツ|松|metasequoia|cryptomeria|スギ|chamaecyparis/.test(s)) return 'pine';
  if (t.leaf_type === 'needleleaved') return 'pine';
  return undefined;
}

/** 도로(선 이름 또는 id)마다 한 가로수 수종. */
export function streetSpecies(roadName: string | undefined, roadId: string): TreeSpeciesName {
  const named = roadName ? STREET_SPECIES[roadName] : undefined;
  if (named) return named;
  const u = createRng(hash32(WORLD_SEED, 'trees', 'street', roadName ?? roadId)).next();
  return pick(STREET_MIX, u);
}

export const forestSpecies = (u: number): TreeSpeciesName => pick(FOREST_MIX, u);
export const parkSpecies = (u: number): TreeSpeciesName => pick(PARK_MIX, u);

/** 높이·수관(태그 height가 있으면 그것). */
export function sizeOf(
  species: TreeSpeciesName,
  u: number,
  tagHeight?: string,
  scale = 1,
): { height: number; crownR: number } {
  const s = SPECIES[species];
  const tagged = Number.parseFloat(tagHeight ?? '');
  const h =
    Number.isFinite(tagged) && tagged > 0.5 && tagged < 50
      ? tagged
      : (s.height[0] + (s.height[1] - s.height[0]) * u) * scale;
  return { height: Math.round(h * 100) / 100, crownR: Math.round(h * s.crown * 100) / 100 };
}

export const speciesId = (s: TreeSpeciesName): number => TREE_SPECIES[s];
