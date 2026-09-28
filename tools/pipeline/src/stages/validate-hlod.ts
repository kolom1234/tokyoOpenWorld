// validate(HLOD L1–L3): 레벨별 크기 예산(L1 ≤ 3 MB, L2/L3 ≤ 2 MB), hlod.mesh 자식 그룹(모든 정점 _CHILD ∈ 0..15,
// 자식 지형 패치 16개 = 부모 전체), stats.tris 일치. see docs/04-data-pipeline.md §4.5–4.6, docs/05 §4
import type { TkcReader } from '@sanpo/tile-format';
import { decodeGlb } from '../lib/gltf.ts';

/** 10진 MB(L0 BUDGET과 같은 단위). */
export const HLOD_BUDGET_BYTES: Readonly<Record<1 | 2 | 3, number>> = { 1: 3_000_000, 2: 2_000_000, 3: 2_000_000 };

export interface HlodCellReport {
  id: string;
  level: number;
  bytes: number;
  tris: number;
  buildingTris: number;
  primitives: number;
}

export async function inspectHlodCell(
  r: TkcReader,
  bytes: number,
  id: string,
  errors: string[],
): Promise<HlodCellReport | null> {
  const level = r.header.cell.level as 1 | 2 | 3;
  if (bytes > HLOD_BUDGET_BYTES[level])
    errors.push(`${id}: ${bytes} B > ${HLOD_BUDGET_BYTES[level]} (L${level} budget)`);
  const glb = r.section('hlod.mesh');
  if (!glb) {
    errors.push(`${id}: hlod.mesh missing`);
    return null;
  }
  const d = await decodeGlb(glb);
  const terrain = new Set<number>();
  let tris = 0;
  let buildingTris = 0;
  for (const p of d.primitives) {
    const child = p.attributes._CHILD?.array;
    if (!child) {
      errors.push(`${id}: ${p.materialId} primitive without _CHILD`);
      continue;
    }
    for (const c of child) if (c > 15) errors.push(`${id}: _CHILD ${c} ∉ 0..15`);
    const t = p.indices.length / 3;
    tris += t;
    if (p.materialId === 'terrain_ground') for (const c of child) terrain.add(c);
    else buildingTris += t;
  }
  if (terrain.size !== 16) errors.push(`${id}: terrain child groups ${terrain.size}/16 (자식 합집합 ≠ 부모)`);
  if (tris !== r.header.stats.tris) errors.push(`${id}: stats.tris ${r.header.stats.tris} ≠ ${tris}`);
  return { id, level, bytes, tris, buildingTris, primitives: d.primitives.length };
}

/** 레벨별 요약 줄(report.md). */
export function hlodSummary(cells: readonly HlodCellReport[]): string[] {
  const out: string[] = [];
  for (const lv of [1, 2, 3]) {
    const cs = cells.filter((c) => c.level === lv);
    if (cs.length === 0) continue;
    const max = cs.reduce((a, c) => (c.bytes > a.bytes ? c : a));
    const avg = cs.reduce((a, c) => a + c.bytes, 0) / cs.length;
    const kb = (b: number): string => (b / 1024).toFixed(1);
    out.push(
      `L${lv}: ${cs.length} cells, avg ${kb(avg)} KiB, max ${kb(max.bytes)} KiB (${max.id}, ${max.tris} tris), budget ${kb(HLOD_BUDGET_BYTES[lv as 1 | 2 | 3])} KiB`,
    );
  }
  return out;
}
