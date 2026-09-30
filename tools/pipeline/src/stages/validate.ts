// validate 단계: 스키마(world.json·셀 헤더·meta.json, ajv) + cells.idx 일치 + 섹션 해시 + 예산 + 경계 이음새 → report. see docs/04-data-pipeline.md §4.6
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cellIdString, unpackCellKey } from '@sanpo/core';
import {
  type CellsIndex,
  gunzip,
  parseHeightfield,
  readCellsIndex,
  readTkc,
  type TkcReader,
  tkcHash32,
  verifyTkc,
} from '@sanpo/tile-format';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import { decodeGlb } from '../lib/gltf.ts';
import { type HlodCellReport, hlodSummary, inspectHlodCell } from './validate-hlod.ts';
import { checkMaterials, type MaterialsReport } from './validate-materials.ts';
import { type CellTerrain, checkSeams, type SeamReport } from './validate-seams.ts';

/** docs/04 §4.6 예산(L0). 크기는 10진 MB. */
export const BUDGET = { cellBytes: 4_000_000, tris: 400_000, colliderTris: 60_000, instances: 5_000 } as const;
const SCHEMA_FILES = ['area', 'world', 'cell-header', 'cell-meta', 'materials'];
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface CellReport {
  id: string;
  bytes: number;
  tris: number;
  terrainVertices: number;
  terrainTris: number;
  buildingVertices: number;
  buildingTris: number;
  /** 보도·연석(roads.mesh, M05-T01). */
  roadsTris: number;
  buildings: number;
  sections: Record<string, number>;
}

export interface ValidateReport {
  buildId: string;
  cells: CellReport[];
  hlod: HlodCellReport[];
  seams: Omit<SeamReport, 'errors'>;
  /** shared/materials(없으면 null). */
  materials: MaterialsReport | null;
  errors: string[];
}

interface Validators {
  world: ValidateFunction;
  header: ValidateFunction;
  meta: ValidateFunction;
  materials: ValidateFunction;
}

export function createValidators(schemasDir: string): Validators {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  ajv.addFormat('date-time', DATE_TIME);
  for (const f of SCHEMA_FILES) ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, `${f}.schema.json`), 'utf8')));
  const get = (id: string): ValidateFunction => {
    const v = ajv.getSchema(id);
    if (!v) throw new Error(`validate: schema ${id} missing`);
    return v;
  };
  return {
    world: get('sanpo/world'),
    header: get('sanpo/cell-header'),
    meta: get('sanpo/cell-meta'),
    materials: get('sanpo/materials'),
  };
}

function schemaErrors(v: ValidateFunction, data: unknown, what: string, errors: string[]): void {
  if (!v(data)) errors.push(`${what}: schema ${JSON.stringify(v.errors?.slice(0, 3))}`);
}

/** TKC 헤더 원문 JSON(스키마는 리더 정규화 전 원문으로 검사). */
function rawHeader(tkc: Uint8Array): unknown {
  const len = new DataView(tkc.buffer, tkc.byteOffset, tkc.byteLength).getUint32(8, true);
  return JSON.parse(new TextDecoder().decode(tkc.subarray(16, 16 + len)));
}

async function gunzipJson(bytes: Uint8Array | undefined): Promise<unknown> {
  if (!bytes) return undefined;
  const r = await gunzip(bytes);
  return r.ok ? JSON.parse(new TextDecoder().decode(r.value)) : undefined;
}

async function meshCounts(bytes: Uint8Array | undefined): Promise<{ positions: Float32Array; v: number; t: number }> {
  if (!bytes) return { positions: new Float32Array(0), v: 0, t: 0 };
  const prims = (await decodeGlb(bytes)).primitives;
  const p = prims[0];
  const pos = p?.attributes.POSITION?.array;
  const v = pos ? pos.length / 3 : 0;
  // 삼각형 = 모든 프리미티브(decals.mesh 전선 등 M05-T03), 위치·정점 수는 첫 프리미티브.
  const t = prims.reduce((n, q) => n + q.indices.length / 3, 0);
  return { positions: pos instanceof Float32Array ? pos : new Float32Array(0), v, t };
}

interface CellCtx {
  buildId: string;
  v: Validators;
  lockIds: ReadonlySet<string>;
  errors: string[];
}

function checkHeader(r: TkcReader, tkc: Uint8Array, id: string, ctx: CellCtx, l0Budget = true): void {
  schemaErrors(ctx.v.header, rawHeader(tkc), `${id} header`, ctx.errors);
  const vr = verifyTkc(r);
  if (!vr.ok) ctx.errors.push(`${id}: ${vr.error.code} ${vr.error.message}`);
  const h = r.header;
  if (h.buildId !== ctx.buildId) ctx.errors.push(`${id}: buildId ${h.buildId} ≠ ${ctx.buildId}`);
  for (const s of h.sections) {
    for (const src of s.sources)
      if (!ctx.lockIds.has(src)) ctx.errors.push(`${id}: ${s.type} source ${src} not in lock`);
  }
  if (!l0Budget) return; // HLOD 예산은 validate-hlod
  if (tkc.byteLength > BUDGET.cellBytes) ctx.errors.push(`${id}: ${tkc.byteLength} B > ${BUDGET.cellBytes}`);
  const st = h.stats;
  if (st.tris > BUDGET.tris || st.colliderTris > BUDGET.colliderTris || st.instances > BUDGET.instances) {
    ctx.errors.push(`${id}: stats over budget ${JSON.stringify(st)}`);
  }
}

async function inspectCell(tkc: Uint8Array, id: string, ctx: CellCtx): Promise<[CellReport, CellTerrain] | null> {
  const r = readTkc(tkc);
  if (!r.ok) {
    ctx.errors.push(`${id}: ${r.error.code} ${r.error.message}`);
    return null;
  }
  checkHeader(r.value, tkc, id, ctx);
  const meta = (await gunzipJson(r.value.section('meta.json'))) as { buildings?: unknown[] } | undefined;
  schemaErrors(ctx.v.meta, meta, `${id} meta.json`, ctx.errors);
  const hfRaw = await gunzip(r.value.section('terrain.height') ?? new Uint8Array(0));
  const hf = hfRaw.ok ? parseHeightfield(hfRaw.value) : undefined;
  if (!hf?.ok) {
    ctx.errors.push(`${id}: terrain.height missing or corrupt`);
    return null;
  }
  const terrain = await meshCounts(r.value.section('terrain.mesh'));
  const bld = await meshCounts(r.value.section('buildings.mesh'));
  const roads = await meshCounts(r.value.section('roads.mesh'));
  const decals = await meshCounts(r.value.section('decals.mesh'));
  const tris = terrain.t + bld.t + roads.t + decals.t;
  if (tris !== r.value.header.stats.tris) ctx.errors.push(`${id}: stats.tris ${r.value.header.stats.tris} ≠ ${tris}`);
  const sections = Object.fromEntries(r.value.header.sections.map((s) => [s.type, s.length]));
  const { ix, iz } = r.value.header.cell;
  const report: CellReport = {
    id,
    bytes: tkc.byteLength,
    tris,
    terrainVertices: terrain.v,
    terrainTris: terrain.t,
    buildingVertices: bld.v,
    buildingTris: bld.t,
    roadsTris: roads.t,
    buildings: meta?.buildings?.length ?? 0,
    sections,
  };
  return [report, { ix, iz, hf: hf.value, positions: terrain.positions }];
}

function readIndex(dir: string, errors: string[]): CellsIndex {
  const r = readCellsIndex(new Uint8Array(readFileSync(join(dir, 'cells.idx'))));
  if (r.ok) return r.value;
  errors.push(`cells.idx: ${r.error.code} ${r.error.message}`);
  return new Map();
}

/** `data/build/<buildId>` 검사. 오류는 report.errors에 모은다(호출자가 비어 있지 않으면 실패 처리). */
export async function validateBuild(
  dir: string,
  schemasDir: string,
  lockIds: ReadonlySet<string>,
): Promise<ValidateReport> {
  const errors: string[] = [];
  const world = JSON.parse(readFileSync(join(dir, 'world.json'), 'utf8')) as { buildId: string };
  const ctx: CellCtx = { buildId: world.buildId, v: createValidators(schemasDir), lockIds, errors };
  schemaErrors(ctx.v.world, world, 'world.json', errors);
  const cells: CellReport[] = [];
  const hlod: HlodCellReport[] = [];
  const terrains: CellTerrain[] = [];
  for (const [key, e] of readIndex(dir, errors)) {
    const { level, ix, iz } = unpackCellKey(key);
    const id = cellIdString(key);
    const tkc = new Uint8Array(readFileSync(join(dir, `L${level}`, String(ix), `${iz}.tkc`)));
    if (tkc.byteLength !== e.byteLength || tkcHash32(tkc) !== e.hash32)
      errors.push(`${id}: cells.idx size/hash mismatch`);
    if (level > 0) {
      const r = readTkc(tkc);
      if (!r.ok) {
        errors.push(`${id}: ${r.error.code} ${r.error.message}`);
        continue;
      }
      checkHeader(r.value, tkc, id, ctx, false);
      const h = await inspectHlodCell(r.value, tkc.byteLength, id, errors);
      if (h) hlod.push(h);
      continue;
    }
    const res = await inspectCell(tkc, id, ctx);
    if (res) {
      cells.push(res[0]);
      terrains.push(res[1]);
    }
  }
  const { errors: seamErrors, ...seams } = checkSeams(terrains);
  errors.push(...seamErrors);
  const materials = checkMaterials(dir, ctx.v.materials, errors);
  return { buildId: world.buildId, cells, hlod, seams, materials, errors };
}

/** 셀 표(Markdown): PR 본문·인계용. */
export function reportMarkdown(r: ValidateReport): string {
  const kb = (b: number): string => (b / 1024).toFixed(1);
  const rows = r.cells.map(
    (c) =>
      `| ${c.id} | ${kb(c.bytes)} | ${c.terrainVertices} | ${c.terrainTris} | ${c.buildings} | ${c.buildingVertices} | ${c.buildingTris} |`,
  );
  const s = r.seams;
  return [
    `# validate ${r.buildId}`,
    '',
    '| cell | size (KiB) | terrain verts | terrain tris | buildings | building verts | building tris |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...rows,
    '',
    `seams: ${s.pairs} pairs, ${s.heightSamples} height samples, ${s.meshVertices} mesh edge vertices compared`,
    ...hlodSummary(r.hlod ?? []),
    r.materials
      ? `materials: ${r.materials.layers} layers, ${(r.materials.bytes / 1e6).toFixed(2)} MB`
      : 'materials: none',
    `errors: ${r.errors.length}`,
    ...r.errors.map((e) => `- ${e}`),
    '',
  ].join('\n');
}

/** report.json + report.md를 빌드 디렉토리에 기록. */
export function writeReport(dir: string, r: ValidateReport): void {
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(r, null, 2)}\n`);
  writeFileSync(join(dir, 'report.md'), reportMarkdown(r));
}
