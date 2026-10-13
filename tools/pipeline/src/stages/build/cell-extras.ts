// 셀 조립 보조(assemble.ts 400줄 제한): meta.json 인코딩·lights.bin(M09-T03)·audio.json(M09-T04). see docs/05-tile-format.md §4
import { type CellKey, unpackCellKey } from '@sanpo/core';
import {
  type CellMeta,
  gunzip,
  gzip,
  parseTrees,
  type RailNetwork,
  treeRecordAt,
  writeLights,
} from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { deriveAudioZones } from '../derive/audio-zones.ts';
import type { OsmRecord } from '../normalize-osm.ts';
import { CELL_SIZE_M } from './dem-window.ts';
import { buildLights } from './lights-cell.ts';
import type { PropCellOutput } from './props-cell.ts';

export async function encodeMeta(meta: CellMeta): Promise<Uint8Array> {
  const ordered: CellMeta = {
    buildings: meta.buildings,
    pois: meta.pois,
    placeNames: meta.placeNames,
    signals: meta.signals,
    interactables: meta.interactables,
  };
  return gzip(new TextEncoder().encode(JSON.stringify(ordered)));
}

/** lights.bin(M09-T03, gzip): 소품이 있는 셀만(가로등·자판기·간판 + 상점 앞 — lights-cell.ts). 광원이 없으면 null. */
export async function lightsOf(
  input: { key: CellKey; buildings: readonly BuildingRecord[] },
  p: { props: PropCellOutput | null },
): Promise<Uint8Array | null> {
  if (!p.props) return null;
  const { ix, iz } = unpackCellKey(input.key);
  const recs = buildLights({
    batches: p.props.batches,
    buildings: input.buildings,
    originWF: [ix * CELL_SIZE_M, 0, iz * CELL_SIZE_M],
  });
  return recs.length > 0 ? gzip(writeLights(recs)) : null;
}

/** 나무 위치(셀 로컬 xz) — trees.inst(gzip) 해제. */
async function treeXZ(bytes: Uint8Array | null): Promise<[number, number][]> {
  if (!bytes) return [];
  const raw = await gunzip(bytes);
  if (!raw.ok) return [];
  const r = parseTrees(raw.value);
  if (!r.ok) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < r.value.count; i++) {
    const t = treeRecordAt(r.value, i);
    out.push([t.x, t.z]);
  }
  return out;
}

/** audio.json(M09-T04 — derive/audio-zones.ts, gzip). 존·발음체가 모두 없으면 null(전부 street = 기본). */
export async function audioOf(
  input: { key: CellKey; buildings: readonly BuildingRecord[]; osm?: readonly OsmRecord[]; rail?: RailNetwork },
  p: { props: PropCellOutput | null },
): Promise<Uint8Array | null> {
  const { ix, iz } = unpackCellKey(input.key);
  const z = deriveAudioZones({
    originWF: [ix * CELL_SIZE_M, 0, iz * CELL_SIZE_M],
    buildings: input.buildings,
    batches: p.props?.batches ?? [],
    trees: await treeXZ(p.props?.trees ?? null),
    osm: input.osm ?? [],
    ...(input.rail ? { rail: input.rail } : {}),
  });
  if (z.zones.length === 0 && z.emitters.length === 0) return null;
  return gzip(new TextEncoder().encode(JSON.stringify(z)));
}
