// 지도 원천 수집(M10-T03): 정규화 데이터 → 지도 피처(WF xz). 건물 = PLATEAU 바닥 링(셀 소유), 도로·공원·물 = 정규화 OSM(셀 중복 id 제거), 철도·역 = 빌드 global/rail.bin,
// 지명 = places.json 町丁(라벨 점 = 가장 큰 링 무게중심). 외부 지도 타일 서비스는 쓰지 않는다.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CellKey } from '@sanpo/core';
import { gunzip, parseRail, type RailNetwork } from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { readPlaces } from '../areas/assign.ts';
import { readLayer } from '../build/area-reader.ts';
import { footprintSources } from '../derive/footprints.ts';
import type { OsmRecord } from '../normalize-osm.ts';

export type MapGeom = 'point' | 'line' | 'polygon';

/** WF xz 좌표 피처(면 = 링들 — 첫 링 바깥). */
export interface MapFeature {
  layer: 'water' | 'park' | 'building' | 'road' | 'rail' | 'station' | 'place';
  geom: MapGeom;
  /** 링·선 = [x0, z0, x1, z1, …], 점 = [x, z]. */
  parts: number[][];
  props: Record<string, string | number>;
  /** 이 줌부터 넣는다. */
  minZoom: number;
  /** 면적(m² — 면만, 작은 건물은 낮은 줌에서 뺀다). */
  area?: number;
}

const ROAD_CLASS: Readonly<Record<string, [string, number]>> = {
  motorway: ['major', 13],
  trunk: ['major', 13],
  primary: ['major', 13],
  secondary: ['medium', 13],
  tertiary: ['medium', 14],
  motorway_link: ['major', 14],
  trunk_link: ['major', 14],
  primary_link: ['major', 14],
  secondary_link: ['medium', 14],
  residential: ['minor', 15],
  unclassified: ['minor', 15],
  living_street: ['minor', 15],
  service: ['minor', 16],
  pedestrian: ['path', 15],
  footway: ['path', 16],
  path: ['path', 16],
  steps: ['path', 16],
  cycleway: ['path', 16],
};

const PARK = (t: Record<string, string>) =>
  ['park', 'garden', 'playground'].includes(t.leisure ?? '') ||
  ['grass', 'forest', 'park', 'recreation_ground'].includes(t.landuse ?? '') ||
  ['wood', 'scrub'].includes(t.natural ?? '');

function shoelace(r: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i += 2) {
    const j = (i + 2) % r.length;
    s += (r[i] as number) * (r[j + 1] as number) - (r[j] as number) * (r[i + 1] as number);
  }
  return Math.abs(s / 2);
}

const flatXZ = (rings: number[][]): number[][] => rings.map((r) => [...r]);

function osmFeatures(rec: OsmRecord): MapFeature | null {
  const t = rec.tags;
  if (t.highway && rec.geom === 'line') {
    const c = ROAD_CLASS[t.highway];
    if (!c) return null;
    return { layer: 'road', geom: 'line', parts: flatXZ(rec.rings), props: { class: c[0] }, minZoom: c[1] };
  }
  if (rec.geom === 'polygon' && t.natural === 'water') {
    const area = shoelace(rec.rings[0] ?? []);
    return {
      layer: 'water',
      geom: 'polygon',
      parts: flatXZ(rec.rings),
      props: {},
      minZoom: area > 5000 ? 13 : 15,
      area,
    };
  }
  if (rec.geom === 'polygon' && PARK(t)) {
    const area = shoelace(rec.rings[0] ?? []);
    return {
      layer: 'park',
      geom: 'polygon',
      parts: flatXZ(rec.rings),
      props: {},
      minZoom: area > 20000 ? 13 : 15,
      area,
    };
  }
  return null;
}

function buildingFeatures(b: readonly BuildingRecord[]): MapFeature[] {
  const out: MapFeature[] = [];
  for (const fp of footprintSources(b))
    for (const rings of fp.ground) {
      const xz = rings.map((r) => {
        const o: number[] = [];
        for (let i = 0; i + 2 < r.length; i += 3) o.push(r[i] as number, r[i + 2] as number);
        return o;
      });
      const area = shoelace(xz[0] ?? []);
      if (area < 8) continue;
      out.push({ layer: 'building', geom: 'polygon', parts: xz, props: {}, minZoom: area > 400 ? 15 : 16, area });
    }
  return out;
}

async function railFeatures(buildDir: string): Promise<MapFeature[]> {
  const f = join(buildDir, 'global', 'rail.bin');
  if (!existsSync(f)) return [];
  const raw = new Uint8Array(readFileSync(f));
  const g = await gunzip(raw);
  const parsed = parseRail(g.ok ? g.value : raw);
  if (!parsed.ok) return [];
  const net: RailNetwork = parsed.value;
  const out: MapFeature[] = [];
  for (const tr of net.tracks) {
    const line: number[] = [];
    const step = Math.max(1, Math.round(8 / tr.stepM));
    for (let k = 0; k < tr.ptCount; k += step) {
      const i = (tr.ptOffset + k) * 3;
      line.push(net.points[i] as number, net.points[i + 2] as number);
    }
    const kind = net.lines.find((l) => l.id === tr.line)?.kind ?? 'jr';
    out.push({ layer: 'rail', geom: 'line', parts: [line], props: { kind, line: tr.line }, minZoom: 13 });
  }
  for (const s of net.stations)
    out.push({
      layer: 'station',
      geom: 'point',
      parts: [[s.posWF[0], s.posWF[2]]],
      props: { id: s.id, name_ja: s.name.ja, name_en: s.name.en, name_ko: s.name.ko ?? s.name.en },
      minZoom: 13,
    });
  return out;
}

function placeFeatures(normalizedDir: string): MapFeature[] {
  return readPlaces(normalizedDir).flatMap((p) => {
    const ring = [...p.rings].sort((a, b) => b.length - a.length)[0];
    if (!ring) return [];
    const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length;
    const cz = ring.reduce((s, q) => s + q[1], 0) / ring.length;
    const short = (n: string) => n.replace(/^\S+\s/, '').replace(/,\s*\S+$/, '');
    return [
      {
        layer: 'place' as const,
        geom: 'point' as const,
        parts: [[cx, cz]],
        props: { code: p.code, name_ja: short(p.name.ja), name_en: short(p.name.en), name_ko: short(p.name.ko) },
        minZoom: 15,
      },
    ];
  });
}

export async function collectMapFeatures(
  normalizedDir: string,
  buildDir: string,
  cells: readonly CellKey[],
): Promise<MapFeature[]> {
  const out: MapFeature[] = [];
  const seen = new Set<string>();
  for (const key of cells) {
    out.push(...buildingFeatures(readLayer<BuildingRecord>(normalizedDir, 'buildings', key)));
    for (const rec of readLayer<OsmRecord>(normalizedDir, 'osm', key)) {
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      const f = osmFeatures(rec);
      if (f) out.push(f);
    }
  }
  out.push(...(await railFeatures(buildDir)), ...placeFeatures(normalizedDir));
  return out;
}
