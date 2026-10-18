// M10-T04 도감 검수(오프라인): 명소 20곳 형식, 설명 = 자체 작성(descriptionSource original + review.json의 위키백과 겹침 통과 + 현재 글 sha256 일치), 홍보 문구 0,
// 이름 규칙(라벨·Wikidata 별칭·ko만 derived), 좌표가 MVP 영역 안. 설명을 고치면 `pnpm pipeline poi-review`를 다시 돌려야 통과한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lonLatToWF } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import type { ReviewEntry, WikidataPoi } from '../src/stages/poi/fetch.ts';
import { readPois } from '../src/stages/poi/fetch.ts';
import { LCS_MAX, NGRAM_MAX, overlap, POI_LANGS, promoHits, sha256 } from '../src/stages/poi/text-check.ts';

const REPO = join(import.meta.dirname, '../../..');
const { pois, author } = readPois(REPO);
const wd = JSON.parse(readFileSync(join(REPO, 'content/poi/wikidata.json'), 'utf8')) as {
  pois: WikidataPoi[];
  license: string;
};
const review = (JSON.parse(readFileSync(join(REPO, 'content/poi/review.json'), 'utf8')) as { entries: ReviewEntry[] })
  .entries;
const area = JSON.parse(readFileSync(join(REPO, 'data/areas/mvp-shibuya-shinjuku.json'), 'utf8')) as {
  l0: { minIx: number; maxIx: number; minIz: number; maxIz: number };
};

describe('poi content', () => {
  it('20 unique POIs with valid kinds, radius and three self-written descriptions', () => {
    expect(pois).toHaveLength(20);
    expect(new Set(pois.map((p) => p.id)).size).toBe(20);
    expect(author).toBe('tokyo-sanpo');
    for (const p of pois) {
      expect(['landmark', 'street', 'park', 'shrine', 'view']).toContain(p.kind);
      expect(p.radiusM).toBeGreaterThanOrEqual(25);
      expect(p.descriptionSource, p.id).toBe('original');
      for (const l of POI_LANGS) {
        const d = p.description[l];
        expect(d.length, `${p.id}:${l}`).toBeGreaterThan(l === 'en' ? 50 : 25);
        expect(d.length, `${p.id}:${l}`).toBeLessThan(l === 'en' ? 260 : 140);
        expect(promoHits(d, l), `${p.id}:${l}`).toEqual([]);
      }
    }
  });
  it('every description has a passing, up-to-date originality review', () => {
    for (const p of pois)
      for (const l of POI_LANGS) {
        const r = review.find((e) => e.id === p.id && e.lang === l);
        expect(r, `${p.id}:${l} review missing — run pnpm pipeline poi-review`).toBeDefined();
        expect(r?.sha256, `${p.id}:${l} edited after review — run pnpm pipeline poi-review`).toBe(
          sha256(p.description[l]),
        );
        expect(r?.pass).toBe(true);
        expect(r?.lcs ?? 99).toBeLessThanOrEqual(LCS_MAX[l]);
        expect(r?.ngram ?? 1).toBeLessThanOrEqual(NGRAM_MAX);
      }
    // 위키백과와 대조할 수 있었던 것이 절반 이상(없는 언어판은 비교 대상 없음).
    expect(review.filter((e) => e.wikipedia).length).toBeGreaterThanOrEqual(30);
  });
  it('overlap check catches copied sentences', () => {
    const src = '明治神宮は、東京都渋谷区代々木神園町にある神社。明治天皇と昭憲皇太后を祭神とする。';
    expect(overlap('明治天皇と昭憲皇太后を祭神とする神社です。', src, 'ja').pass).toBe(false);
    expect(overlap('広い森に囲まれた神社。', src, 'ja').pass).toBe(true);
    const en =
      'Meiji Jingu is a Shinto shrine in Shibuya, Tokyo, that is dedicated to the deified spirits of Emperor Meiji.';
    expect(overlap('It is dedicated to the deified spirits of Emperor Meiji and his wife.', en, 'en').pass).toBe(false);
  });
});

describe('poi names & positions (Wikidata CC0)', () => {
  it('names come from Wikidata labels/aliases; only Korean may be derived', () => {
    expect(wd.license).toBe('CC0-1.0');
    for (const p of pois) {
      const w = wd.pois.find((x) => x.id === p.id);
      expect(w?.wikidata, p.id).toBe(p.wikidata);
      for (const l of POI_LANGS) {
        const spec = (p as unknown as { name: Record<string, string> }).name[l] as string;
        if (spec === 'label') expect(w?.labels[l], `${p.id}:${l}`).toBeTruthy();
        else if (spec.startsWith('alias:')) expect(w?.aliases[l]).toContain(spec.slice(6));
        else {
          expect(spec.startsWith('derived:'), `${p.id}:${l}`).toBe(true);
          expect(l).toBe('ko');
          expect(w?.labels.ko).toBeUndefined();
        }
      }
    }
  });
  it('every POI lies inside the MVP L0 area (discoverable)', () => {
    const minX = area.l0.minIx * 256;
    const maxX = (area.l0.maxIx + 1) * 256;
    const minZ = area.l0.minIz * 256;
    const maxZ = (area.l0.maxIz + 1) * 256;
    for (const w of wd.pois) {
      const p = lonLatToWF({ lon: w.lon, lat: w.lat });
      expect(p.x, w.id).toBeGreaterThan(minX);
      expect(p.x, w.id).toBeLessThan(maxX);
      expect(p.z, w.id).toBeGreaterThan(minZ);
      expect(p.z, w.id).toBeLessThan(maxZ);
    }
  });
});
