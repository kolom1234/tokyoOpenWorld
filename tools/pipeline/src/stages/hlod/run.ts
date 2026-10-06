// hlod 단계: L1(영역 L0의 부모)·L2/L3(hlodExtentWF 전체) → hlod.mesh 1섹션 TKC, 크기 예산 초과 시 단순화 강화 후 재시도,
// 기존 cells.idx(L0)에 병합. 입력 = data/normalized(건물·dem_1m) + data/derived(원경 건물·원경 DEM). see docs/04-data-pipeline.md §4.5
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CellKey, type CellLevel, cellIdString, type Logger, packCellKey, unpackCellKey } from '@sanpo/core';
import { CELL_SIZES, cellBoundsWF, cellOf, parentOf } from '@sanpo/geo';
import {
  type CellsIndexEntry,
  readCellsIndex,
  tkcHash32,
  type Vec3Tuple,
  writeCellsIndex,
  writeTkc,
} from '@sanpo/tile-format';
import { readNdjsonGz } from '../../lib/ndjson-gz.ts';
import type { BuildingRecord } from '../../readers/plateau/types.ts';
import { readDemWindow } from '../build/dem-window.ts';
import type { AreaDef } from '../build/manifest.ts';
import type { OverrideSet } from '../build/overrides/index.ts';
import { type ChildGeometry, encodeHlod, type HlodEncoded } from './child-split.ts';
import { type FarDem, readFarDem } from './dem-far.ts';
import type { FarBuilding } from './far-buildings.ts';
import { buildL1, L1_PARAMS } from './l1.ts';
import { buildL2, type FarLevelParams, L2_PARAMS } from './l2.ts';
import { buildL3, L3_PARAMS } from './l3.ts';
import { readFarBuildings } from './tokyo23-lod1.ts';

export const FAR_SOURCES = ['gsi-dem-tiles', 'plateau-tokyo23'];
const MAX_ATTEMPTS = 4;

export interface HlodInput {
  area: AreaDef;
  buildId: string;
  normalizedDir: string;
  derivedDir: string;
  /** data/build/<buildId>(L0 build 결과가 있어야 한다 — cells.idx 병합). */
  outDir: string;
  levels: readonly (1 | 2 | 3)[];
  log: Logger;
  /** 랜드마크(content/overrides) — L1이 L0와 같은 모양을 쓴다(없으면 PLATEAU 원 건물, M07 사전 ⓪). */
  overrides?: OverrideSet;
}

export interface HlodCellStats {
  id: string;
  bytes: number;
  tris: number;
  attempts: number;
  overBudget: boolean;
  detail: string;
}

interface Built {
  enc: HlodEncoded;
  sources: string[];
  detail: string;
}

function areaCells(area: AreaDef): Set<CellKey> {
  const out = new Set<CellKey>();
  for (let ix = area.l0.minIx; ix <= area.l0.maxIx; ix++) {
    for (let iz = area.l0.minIz; iz <= area.l0.maxIz; iz++) out.add(packCellKey(0, ix, iz));
  }
  return out;
}

function cellsInExtent(level: CellLevel, e: NonNullable<AreaDef['hlodExtentWF']>): CellKey[] {
  const s = CELL_SIZES[level];
  const out: CellKey[] = [];
  for (let iz = Math.floor(e.minZ / s); iz < Math.ceil(e.maxZ / s); iz++) {
    for (let ix = Math.floor(e.minX / s); ix < Math.ceil(e.maxX / s); ix++) out.push(packCellKey(level, ix, iz));
  }
  return out;
}

function writeCell(
  outDir: string,
  key: CellKey,
  buildId: string,
  b: Built,
): { tkc: Uint8Array; entry: CellsIndexEntry } {
  const { level, ix, iz } = unpackCellKey(key);
  const size = CELL_SIZES[level];
  const originWF: Vec3Tuple = [ix * size, 0, iz * size];
  const add = (v: Vec3Tuple, f: (x: number) => number): Vec3Tuple =>
    v.map((c, k) => f((c + (originWF[k] as number)) * 1000) / 1000) as Vec3Tuple;
  const tkc = writeTkc(
    {
      cell: { level, ix, iz },
      buildId,
      originWF,
      aabbWF: { min: add(b.enc.aabbLocal.min, Math.floor), max: add(b.enc.aabbLocal.max, Math.ceil) },
      materials: b.enc.materials,
      stats: { tris: b.enc.tris, colliderTris: 0, instances: 0 },
    },
    [{ type: 'hlod.mesh', sources: b.sources, data: b.enc.glb }],
  );
  const dir = join(outDir, `L${level}`, String(ix));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${iz}.tkc`), tkc);
  return { tkc, entry: { level, ix, iz, flags: 0, byteLength: tkc.byteLength, hash32: tkcHash32(tkc) } };
}

/** 예산 안에 들 때까지 시도(build(n) = n번째 시도의 기하). */
async function withBudget(
  budget: number,
  build: (attempt: number) => Promise<{ children: ChildGeometry[]; sources: string[]; detail: string }>,
): Promise<Built & { attempts: number; over: boolean }> {
  let last: (Built & { attempts: number; over: boolean }) | undefined;
  for (let a = 0; a < MAX_ATTEMPTS; a++) {
    const g = await build(a);
    const enc = await encodeHlod(g.children);
    last = { enc, sources: g.sources, detail: g.detail, attempts: a + 1, over: enc.glb.byteLength > budget };
    if (!last.over) break;
  }
  return last as Built & { attempts: number; over: boolean };
}

/** 원경 레벨 재시도 파라미터: 박스 수 × 0.6ⁿ, 매스 격자 × 2(자식 크기의 약수 유지). */
function relax(p: FarLevelParams, attempt: number, childSize: number): FarLevelParams {
  let grid = p.massGrid;
  for (let i = 0; i < attempt && grid * 2 <= childSize / 4; i++) grid *= 2;
  return { ...p, maxBoxes: Math.floor(p.maxBoxes * 0.6 ** attempt), massGrid: grid };
}

class FarCache {
  private readonly m = new Map<string, FarBuilding[]>();
  private readonly dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  l2(key: CellKey): FarBuilding[] {
    const id = cellIdString(key);
    let v = this.m.get(id);
    if (!v) {
      v = readFarBuildings(this.dir, id);
      this.m.set(id, v);
    }
    return v;
  }
}

interface Ctx {
  input: HlodInput;
  farDem: FarDem;
  far: FarCache;
  inArea: Set<CellKey>;
}

function readL0Buildings(normalizedDir: string, key: CellKey): BuildingRecord[] {
  const f = join(normalizedDir, 'buildings', `${cellIdString(key)}.ndjson.gz`);
  return existsSync(f) ? readNdjsonGz<BuildingRecord>(f) : [];
}

async function l1Cell(c: Ctx, key: CellKey): Promise<Built & { attempts: number; over: boolean }> {
  const { input } = c;
  const b = cellBoundsWF(key);
  const m = L1_PARAMS.skirt;
  const dem1m = await readDemWindow(
    join(input.normalizedDir, 'terrain'),
    { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m },
    0,
    join(input.outDir, '.work-hlod'),
  );
  const far = c.far.l2(cellOf(2, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2));
  const l0 = new Map<CellKey, BuildingRecord[]>();
  const src = {
    l0Buildings: (k: CellKey) => {
      if (!c.inArea.has(k)) return undefined;
      let v = l0.get(k);
      if (!v) {
        v = readL0Buildings(input.normalizedDir, k);
        l0.set(k, v);
      }
      return v;
    },
    dem1m,
    farDem: c.farDem,
    far,
    ...(input.overrides ? { overrides: input.overrides } : {}),
  };
  return withBudget(L1_PARAMS.budgetBytes, async (a) => {
    const r = await buildL1(key, src, L1_PARAMS.ratio * 0.6 ** a);
    const plateau = new Set<string>();
    for (const v of l0.values()) for (const rec of v) plateau.add(rec.source);
    const sources = [...(r.inside > 0 ? ['gsi-dem'] : []), ...plateau, ...(r.inside < 16 ? FAR_SOURCES : [])];
    return { children: r.children, sources, detail: `inside ${r.inside}/16, bldg tris ${r.srcTris} → ${r.tris}` };
  });
}

async function farCell(c: Ctx, key: CellKey): Promise<Built & { attempts: number; over: boolean }> {
  const { level } = unpackCellKey(key);
  const base = level === 2 ? L2_PARAMS : L3_PARAMS;
  const far: FarBuilding[] = [];
  if (level === 2) far.push(...c.far.l2(key));
  else for (const k of cellsInExtent(2, cellBoundsWF(key))) far.push(...c.far.l2(k));
  return withBudget(base.budgetBytes, async (a) => {
    const p = relax(base, a, CELL_SIZES[(level - 1) as CellLevel]);
    const r = level === 2 ? buildL2(key, far, c.farDem, p) : buildL3(key, far, c.farDem, p);
    return {
      children: r.children,
      sources: FAR_SOURCES,
      detail: `bldgs ${r.buildings} → boxes ${r.boxes} + masses ${r.masses} (grid ${p.massGrid} m)`,
    };
  });
}

/** L1–L3 빌드 → TKC + cells.idx 병합(해당 레벨 기존 항목은 교체). */
export async function runHlod(input: HlodInput): Promise<HlodCellStats[]> {
  const { area, log } = input;
  if (!area.hlodExtentWF) throw new Error(`area ${area.id}: hlodExtentWF missing`);
  const idxPath = join(input.outDir, 'cells.idx');
  const idx = readCellsIndex(readFileSync(idxPath));
  if (!idx.ok) throw new Error(`cells.idx: ${idx.error.code}`);
  const keep: CellsIndexEntry[] = [...idx.value.entries()]
    .map(([k, r]) => ({ ...unpackCellKey(k), flags: r.flags, byteLength: r.byteLength, hash32: r.hash32 }))
    .filter((e) => !input.levels.includes(e.level as 1 | 2 | 3));
  const c: Ctx = {
    input,
    farDem: readFarDem(join(input.derivedDir, 'terrain-far')),
    far: new FarCache(input.derivedDir),
    inArea: areaCells(area),
  };
  const targets: CellKey[] = [];
  if (input.levels.includes(1)) {
    const l1 = new Set<CellKey>();
    for (const k of c.inArea) l1.add(parentOf(k) as CellKey);
    targets.push(...[...l1].sort((a, b) => a - b));
  }
  for (const lv of [2, 3] as const)
    if (input.levels.includes(lv)) targets.push(...cellsInExtent(lv, area.hlodExtentWF));
  const entries: CellsIndexEntry[] = [...keep];
  const stats: HlodCellStats[] = [];
  for (const key of targets) {
    const b = unpackCellKey(key).level === 1 ? await l1Cell(c, key) : await farCell(c, key);
    const { tkc, entry } = writeCell(input.outDir, key, input.buildId, b);
    entries.push(entry);
    const s = {
      id: cellIdString(key),
      bytes: tkc.byteLength,
      tris: b.enc.tris,
      attempts: b.attempts,
      overBudget: b.over,
      detail: b.detail,
    };
    stats.push(s);
    log.info(
      `${s.id}: ${s.bytes} B, ${s.tris} tris, ${s.detail}${s.attempts > 1 ? ` (attempt ${s.attempts})` : ''}${s.overBudget ? ' OVER BUDGET' : ''}`,
    );
  }
  writeFileSync(idxPath, writeCellsIndex(entries));
  return stats;
}
