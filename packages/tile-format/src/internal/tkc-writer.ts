// TKC v1 인코더: 섹션 type 사전순 배치, 16바이트 정렬, 고정 키 순서 헤더 JSON(결정론). see docs/05-tile-format.md §3
import {
  type CellHeaderInput,
  FORMAT_VERSION,
  type SectionEntry,
  TKC_MAGIC,
  TKC_PREAMBLE_BYTES,
  type TkcSectionInput,
} from '../api.ts';
import { canonicalHeaderJson } from './header-check.ts';
import { align16, isSectionType, sectionHash, sectionSpec } from './sections.ts';

// 헤더 길이 ↔ 섹션 오프셋 고정점 반복 상한(오프셋 자릿수 증가로만 늘어나므로 실제로는 2–3회).
const MAX_LAYOUT_ITERATIONS = 32;
const I16_MIN = -32768;
const I16_MAX = 32767;
const encoder = new TextEncoder();

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new TypeError(`writeTkc: ${msg}`);
}

const finite3 = (v: readonly number[]): boolean => v.length === 3 && v.every(Number.isFinite);
const isAxis = (v: number): boolean => Number.isInteger(v) && v >= I16_MIN && v <= I16_MAX;

function validateHeader(h: CellHeaderInput): void {
  const { level, ix, iz } = h.cell;
  assert(Number.isInteger(level) && level >= 0 && level <= 3, `cell.level=${level}`);
  assert(isAxis(ix) && isAxis(iz), `cell ix/iz out of i16: ${ix},${iz}`);
  assert(typeof h.buildId === 'string' && h.buildId.length > 0, 'buildId empty');
  assert(finite3(h.originWF), 'originWF must be 3 finite numbers');
  assert(finite3(h.aabbWF.min) && finite3(h.aabbWF.max), 'aabbWF must be 3 finite numbers each');
  assert(
    h.materials.every((m) => typeof m === 'string'),
    'materials must be strings',
  );
  for (const k of ['tris', 'colliderTris', 'instances'] as const) {
    assert(Number.isSafeInteger(h.stats[k]) && h.stats[k] >= 0, `stats.${k}=${h.stats[k]}`);
  }
}

function validateSections(level: number, sections: readonly TkcSectionInput[]): void {
  const seen = new Set<string>();
  for (const s of sections) {
    assert(isSectionType(s.type), `unregistered section type "${s.type}" (05 §4에 먼저 등록)`);
    assert(!seen.has(s.type), `duplicate section "${s.type}"`);
    seen.add(s.type);
    const levels: readonly number[] = sectionSpec(s.type).levels;
    assert(levels.includes(level), `section "${s.type}" not allowed at L${level}`);
    assert(s.sources.length > 0 && s.sources.every((x) => typeof x === 'string' && x.length > 0), 'sources');
    assert(s.data instanceof Uint8Array, `section "${s.type}" data must be Uint8Array`);
  }
}

type PendingEntry = Omit<SectionEntry, 'offset'>;

function layout(pending: readonly PendingEntry[], start: number): SectionEntry[] {
  let cursor = start;
  return pending.map((p) => {
    const offset = cursor;
    cursor = align16(offset + p.length);
    return { ...p, offset };
  });
}

/** 헤더 JSON 길이가 섹션 시작 오프셋에 의존하므로 고정점까지 반복. */
function solveLayout(header: CellHeaderInput, pending: readonly PendingEntry[]) {
  let start = TKC_PREAMBLE_BYTES;
  for (let i = 0; i < MAX_LAYOUT_ITERATIONS; i++) {
    const sections = layout(pending, start);
    const json = encoder.encode(canonicalHeaderJson({ ...header, sections }));
    const need = TKC_PREAMBLE_BYTES + align16(json.byteLength);
    if (need === start) return { sections, json };
    start = need;
  }
  throw new Error('writeTkc: header layout did not converge');
}

/**
 * 셀 헤더 + 섹션 → TKC v1 바이트. 섹션 데이터는 코덱대로 이미 인코딩되어 있어야 한다(압축하지 않음).
 * 섹션은 type 사전순, sources는 정렬·중복 제거. 같은 입력 → 같은 바이트.
 * 잘못된 입력(미등록/중복 섹션, 레벨 불허, 빈 sources, 비유한 좌표)은 프로그래밍 오류로 throw.
 */
export function writeTkc(header: CellHeaderInput, sections: readonly TkcSectionInput[]): Uint8Array {
  validateHeader(header);
  validateSections(header.cell.level, sections);
  const sorted = [...sections].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0));
  const pending: PendingEntry[] = sorted.map((s) => ({
    type: s.type,
    length: s.data.byteLength,
    codec: sectionSpec(s.type).codec,
    sources: [...new Set(s.sources)].sort(),
    hash: sectionHash(s.data),
  }));
  const { sections: entries, json } = solveLayout(header, pending);
  const last = entries[entries.length - 1];
  const headerEnd = TKC_PREAMBLE_BYTES + align16(json.byteLength);
  const total = last ? Math.max(headerEnd, last.offset + last.length) : headerEnd;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, TKC_MAGIC, true);
  dv.setUint16(4, FORMAT_VERSION, true);
  dv.setUint16(6, 0, true); // flags: v1은 항상 0 (ADR-0017)
  dv.setUint32(8, json.byteLength, true);
  dv.setUint32(12, 0, true); // reserved
  out.set(json, TKC_PREAMBLE_BYTES);
  sorted.forEach((s, i) => {
    const e = entries[i];
    if (e) out.set(s.data, e.offset);
  });
  return out;
}
