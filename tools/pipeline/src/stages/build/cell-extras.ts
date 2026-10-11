// 셀 조립 보조(assemble.ts 400줄 제한): meta.json 인코딩·lights.bin(M09-T03). see docs/05-tile-format.md §4
import { type CellKey, unpackCellKey } from '@sanpo/core';
import { type CellMeta, gzip, writeLights } from '@sanpo/tile-format';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
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
