// 런타임 헤더 구조 검사(ajv 없이, schemas/cell-header.schema.json의 부분집합) + 정규 직렬화. see docs/05-tile-format.md §3
import type { CellHeader, SectionEntry } from '../api.ts';
import { HASH_RE } from './sections.ts';

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isVec3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(isNum);

function checkEntry(e: unknown, i: number): string | null {
  const at = `sections[${i}]`;
  if (!isObj(e)) return `${at} is not an object`;
  if (typeof e.type !== 'string') return `${at}.type`;
  if (!isInt(e.offset) || e.offset < 0) return `${at}.offset`;
  if (!isInt(e.length) || e.length < 0) return `${at}.length`;
  if (typeof e.codec !== 'string') return `${at}.codec`;
  if (!isStrArr(e.sources) || e.sources.length === 0) return `${at}.sources`;
  if (typeof e.hash !== 'string' || !HASH_RE.test(e.hash)) return `${at}.hash`;
  return null;
}

function checkCell(c: unknown): string | null {
  if (!isObj(c)) return 'cell';
  if (!isInt(c.level) || c.level < 0 || c.level > 3) return 'cell.level';
  if (!isInt(c.ix) || !isInt(c.iz)) return 'cell.ix/iz';
  return null;
}

/** 구조가 맞으면 null, 아니면 문제 필드 경로. 정렬·범위 검사는 reader가 따로 한다. */
export function checkHeader(h: unknown): string | null {
  if (!isObj(h)) return 'header is not an object';
  const cellErr = checkCell(h.cell);
  if (cellErr) return cellErr;
  if (typeof h.buildId !== 'string') return 'buildId';
  if (!isVec3(h.originWF)) return 'originWF';
  if (!isObj(h.aabbWF) || !isVec3(h.aabbWF.min) || !isVec3(h.aabbWF.max)) return 'aabbWF';
  if (!Array.isArray(h.sections)) return 'sections';
  for (let i = 0; i < h.sections.length; i++) {
    const e = checkEntry(h.sections[i], i);
    if (e) return e;
  }
  if (!isStrArr(h.materials)) return 'materials';
  if (!isObj(h.stats)) return 'stats';
  for (const k of ['tris', 'colliderTris', 'instances'] as const) {
    if (!isInt(h.stats[k])) return `stats.${k}`;
  }
  return null;
}

const vec3 = (v: readonly number[]): [number, number, number] => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0];

function canonicalEntry(e: SectionEntry): SectionEntry {
  return {
    type: e.type,
    offset: e.offset,
    length: e.length,
    codec: e.codec,
    sources: [...e.sources],
    hash: e.hash,
  };
}

/**
 * 고정 키 순서의 헤더 JSON(결정론). 스키마 밖 추가 필드는 버린다 —
 * writer 출력은 항상 이 형태이므로 write→read→write가 바이트 동일.
 */
export function canonicalHeaderJson(h: CellHeader): string {
  const canonical: CellHeader = {
    cell: { level: h.cell.level, ix: h.cell.ix, iz: h.cell.iz },
    buildId: h.buildId,
    originWF: vec3(h.originWF),
    aabbWF: { min: vec3(h.aabbWF.min), max: vec3(h.aabbWF.max) },
    sections: h.sections.map(canonicalEntry),
    materials: [...h.materials],
    stats: { tris: h.stats.tris, colliderTris: h.stats.colliderTris, instances: h.stats.instances },
  };
  return JSON.stringify(canonical);
}
