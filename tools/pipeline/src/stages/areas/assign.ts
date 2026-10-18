// 셀 meta placeNames(M10-T02): 정규화 町丁 링 중 셀 사각형(256 m)과 겹치는 것 → 셀 로컬(x, z) 폴리곤(링 전체 — HUD 점-폴리곤 조회, 이웃 셀과 중복 허용).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetaPlaceName } from '@sanpo/tile-format';
import type { PlaceRecord } from './normalize.ts';

/** 지명 원천(meta.json sources — 이름이 있을 때). */
export const AREAS_SOURCES = ['estat-small-area', 'japanpost-kenall'] as const;

export function readPlaces(normalizedDir: string): PlaceRecord[] {
  const f = join(normalizedDir, 'areas', 'places.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { places: PlaceRecord[] }).places : [];
}

function bboxOf(r: readonly [number, number][]): [number, number, number, number] {
  let x0 = Number.POSITIVE_INFINITY;
  let z0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let z1 = Number.NEGATIVE_INFINITY;
  for (const [x, z] of r) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0, z0, x1, z1];
}

/** 셀 원점(ox, oz)·크기 size의 사각형과 bbox가 겹치는 링 → 셀 로컬 폴리곤(0.1 m 반올림). */
export function placeNamesForCell(
  places: readonly PlaceRecord[],
  ox: number,
  oz: number,
  size: number,
): MetaPlaceName[] {
  const out: MetaPlaceName[] = [];
  for (const p of places)
    for (const r of p.rings) {
      const [x0, z0, x1, z1] = bboxOf(r);
      if (x1 < ox || x0 > ox + size || z1 < oz || z0 > oz + size) continue;
      out.push({
        code: p.code,
        nameI18n: p.name,
        polygonLocal: r.map(([x, z]) => [Math.round((x - ox) * 10) / 10, Math.round((z - oz) * 10) / 10]),
      });
    }
  return out;
}
