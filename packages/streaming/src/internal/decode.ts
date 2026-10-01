// TKC 파일 → CellPayload(워커 전용): hash32·헤더(셀·buildId) 검사 → 섹션별 디코드(glb=meshopt, gzip 해제). see docs/05-tile-format.md §3–4, docs/06-world-streaming.md §9
import { ok, packCellKey, type Result } from '@sanpo/core';
import {
  type CellMeta,
  type CellPayload,
  type DecodedMesh,
  gunzip,
  type MeshSlot,
  parseHeightfield,
  parseProps,
  parseTrees,
  readTkc,
  type SectionType,
  type TkcReader,
  tkcHash32,
} from '@sanpo/tile-format';
import type { DecodeError, DecodeRequest } from '../api.ts';
import { type AbortCheck, fail } from './decode-util.ts';
import { decodeGlb } from './glb.ts';

/** glb 섹션 → CellPayload.meshes 슬롯. */
const MESH_SLOTS: Partial<Record<SectionType, MeshSlot>> = {
  'terrain.mesh': 'terrain',
  'buildings.mesh': 'buildings',
  'roads.mesh': 'roads',
  'decals.mesh': 'decals',
  'overrides.mesh': 'overrides',
  'hlod.mesh': 'hlod',
};

/** onReady 기본 섹션(06 §2·§9): 렌더 메시 + terrain.height(groundHeightAt 보관용). 물리·sim 섹션은 requestSections로. */
export const DEFAULT_SECTIONS: readonly SectionType[] = [
  'terrain.mesh',
  'buildings.mesh',
  'roads.mesh',
  'decals.mesh',
  'overrides.mesh',
  'hlod.mesh',
  'terrain.height',
  'props.inst',
  'trees.inst',
];

/** 이 디코더가 아는 섹션. 나머지(lights/audio)는 해당 태스크에서 추가 — 지금은 건너뛴다. */
export const DECODABLE: ReadonlySet<SectionType> = new Set([
  ...DEFAULT_SECTIONS,
  'collision.bin',
  'lanes.bin',
  'nav.bin',
  'meta.json',
]);

export interface DecodeOptions {
  verifyHash: boolean;
  check: AbortCheck;
}

/** 독립 ArrayBuffer(transfer용). 이미 버퍼 전체면 그대로. */
function ownBuffer(u8: Uint8Array): ArrayBuffer {
  const whole = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength && u8.buffer instanceof ArrayBuffer;
  return whole ? (u8.buffer as ArrayBuffer) : (u8.slice().buffer as ArrayBuffer);
}

async function gunzipped(bytes: Uint8Array, type: SectionType): Promise<Result<Uint8Array, DecodeError>> {
  const r = await gunzip(bytes);
  return r.ok ? r : fail(r.error.code, `${type}: ${r.error.message}`);
}

/** 섹션 1개를 payload에 채운다. */
async function decodeSection(tkc: TkcReader, type: SectionType, out: CellPayload, check: AbortCheck) {
  const bytes = tkc.section(type);
  if (bytes === undefined) return ok(undefined);
  const slot = MESH_SLOTS[type];
  if (slot) {
    const m: Result<DecodedMesh, DecodeError> = await decodeGlb(bytes, check);
    if (!m.ok) return fail(m.error.code, `${type}: ${m.error.message}`);
    out.meshes[slot] = m.value;
    return ok(undefined);
  }
  if (type === 'nav.bin') {
    out.nav = ownBuffer(bytes);
    return ok(undefined);
  }
  const raw = await gunzipped(bytes, type);
  if (!raw.ok) return raw;
  if (type === 'terrain.height') {
    const hf = parseHeightfield(raw.value);
    if (!hf.ok) return fail(hf.error.code, `${type}: ${hf.error.message}`);
    out.heightfield = hf.value;
  } else if (type === 'collision.bin') out.collision = ownBuffer(raw.value);
  else if (type === 'lanes.bin') out.lanes = ownBuffer(raw.value);
  else if (type === 'props.inst') {
    const props = parseProps(raw.value);
    if (!props.ok) return fail(props.error.code, `${type}: ${props.error.message}`);
    out.instances = { ...out.instances, props: props.value };
  } else if (type === 'trees.inst') {
    const trees = parseTrees(raw.value);
    if (!trees.ok) return fail(trees.error.code, `${type}: ${trees.error.message}`);
    out.instances = { ...out.instances, trees: trees.value };
  } else if (type === 'meta.json') {
    try {
      out.meta = JSON.parse(new TextDecoder().decode(raw.value)) as CellMeta;
    } catch {
      return fail('corrupt', 'meta.json: JSON parse');
    }
  }
  return ok(undefined);
}

/** 컨테이너·셀 일치 검사 후 리더. */
function openTkc(u8: Uint8Array, req: DecodeRequest, verifyHash: boolean): Result<TkcReader, DecodeError> {
  if (verifyHash && req.hash32 !== undefined && tkcHash32(u8) >>> 0 !== req.hash32 >>> 0) {
    return fail('mismatch', 'hash32 ≠ cells.idx');
  }
  const r = readTkc(u8);
  if (!r.ok) return fail(r.error.code, `tkc: ${r.error.message}`);
  const c = r.value.header.cell;
  if (packCellKey(c.level, c.ix, c.iz) !== req.key) return fail('mismatch', `header cell L${c.level}_${c.ix}_${c.iz}`);
  if (r.value.header.buildId !== req.buildId) return fail('mismatch', `buildId ${r.value.header.buildId}`);
  return r;
}

/**
 * .tkc 바이트 → CellPayload. 섹션 사이마다 `check()`(양보 + 취소 확인). 요청 섹션 중 파일에 없는 것은 건너뛴다.
 * 결과 배열은 모두 새 버퍼(입력 버퍼와 공유 없음) → `transferList`로 넘긴다.
 */
export async function decodeCell(
  bytes: ArrayBuffer,
  req: DecodeRequest,
  opts: DecodeOptions,
): Promise<Result<CellPayload, DecodeError>> {
  const tkc = openTkc(new Uint8Array(bytes), req, opts.verifyHash);
  if (!tkc.ok) return tkc;
  const h = tkc.value.header;
  const [x, y, z] = h.originWF;
  const out: CellPayload = {
    key: req.key,
    id: `L${h.cell.level}_${h.cell.ix}_${h.cell.iz}`,
    level: h.cell.level,
    originWF: { x, y, z },
    header: h,
    meshes: {},
  };
  for (const type of req.sections ?? DEFAULT_SECTIONS) {
    if (!DECODABLE.has(type)) continue;
    const stop = await opts.check();
    if (stop) return fail(stop.code, stop.message);
    const r = await decodeSection(tkc.value, type, out, opts.check);
    if (!r.ok) return r;
  }
  return ok(out);
}
