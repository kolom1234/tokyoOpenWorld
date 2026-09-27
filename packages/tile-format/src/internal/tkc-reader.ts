// TKC v1 디코더: 프리앰블·헤더 검사, 섹션 범위/정렬/겹침 검사, 미지 섹션 무시, 원본 버퍼 view 제공. see docs/05-tile-format.md §3, §8
import type { Result } from '@sanpo/core';
import {
  type CellHeader,
  FORMAT_VERSION,
  type SectionEntry,
  type SectionType,
  TKC_ALIGN,
  TKC_MAGIC,
  TKC_PREAMBLE_BYTES,
  type TkcError,
  TkcErrorCode,
  type TkcReader,
} from '../api.ts';
import { asBytes, fail } from './bytes.ts';
import { checkHeader } from './header-check.ts';
import { isSectionType, sectionHash, sectionSpec } from './sections.ts';

const decoder = new TextDecoder('utf-8', { fatal: true });

function parseHeaderJson(bytes: Uint8Array): Result<CellHeader, TkcError> {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch (e) {
    return fail(TkcErrorCode.Header, `header JSON: ${(e as Error).message}`);
  }
  const bad = checkHeader(value);
  if (bad) return fail(TkcErrorCode.Header, `header field invalid: ${bad}`);
  return { ok: true, value: value as CellHeader };
}

function checkLayout(sections: readonly SectionEntry[], headerEnd: number, fileLen: number): Result<true, TkcError> {
  for (const e of sections) {
    if (e.offset % TKC_ALIGN !== 0) return fail(TkcErrorCode.Align, `${e.type} offset ${e.offset} not 16-aligned`);
    if (e.offset < headerEnd) return fail(TkcErrorCode.Range, `${e.type} offset ${e.offset} overlaps header`);
    if (e.offset + e.length > fileLen) {
      return fail(TkcErrorCode.Range, `${e.type} [${e.offset}, +${e.length}) exceeds file ${fileLen}`);
    }
  }
  const byOffset = [...sections].sort((a, b) => a.offset - b.offset);
  for (let i = 1; i < byOffset.length; i++) {
    const prev = byOffset[i - 1];
    const cur = byOffset[i];
    if (prev && cur && prev.offset + prev.length > cur.offset) {
      return fail(TkcErrorCode.Range, `${prev.type} overlaps ${cur.type}`);
    }
  }
  return { ok: true, value: true };
}

/** 등록 타입만 색인. 미지 타입은 무시(전방 호환), 등록 타입의 코덱 불일치·중복은 헤더 오류. */
function indexKnown(sections: readonly SectionEntry[]): Result<Map<SectionType, SectionEntry>, TkcError> {
  const known = new Map<SectionType, SectionEntry>();
  for (const e of sections) {
    if (!isSectionType(e.type)) continue;
    if (known.has(e.type)) return fail(TkcErrorCode.Header, `duplicate section ${e.type}`);
    if (e.codec !== sectionSpec(e.type).codec) return fail(TkcErrorCode.Header, `${e.type} codec ${e.codec}`);
    known.set(e.type, e);
  }
  return { ok: true, value: known };
}

function checkPreamble(dv: DataView, fileLen: number): Result<number, TkcError> {
  if (fileLen < TKC_PREAMBLE_BYTES) return fail(TkcErrorCode.Truncated, `file ${fileLen} B < preamble`);
  const magic = dv.getUint32(0, true);
  if (magic !== TKC_MAGIC) return fail(TkcErrorCode.Magic, `magic 0x${magic.toString(16)}`);
  const version = dv.getUint16(4, true);
  if (version !== FORMAT_VERSION) return fail(TkcErrorCode.Version, `formatVersion ${version} ≠ ${FORMAT_VERSION}`);
  const flags = dv.getUint16(6, true);
  if (flags !== 0) return fail(TkcErrorCode.Flags, `flags 0x${flags.toString(16)} unsupported in v1`);
  const headerLen = dv.getUint32(8, true);
  if (TKC_PREAMBLE_BYTES + headerLen > fileLen) {
    return fail(TkcErrorCode.Truncated, `header ${headerLen} B exceeds file ${fileLen}`);
  }
  return { ok: true, value: headerLen };
}

/**
 * TKC 바이트 → 리더. 손상·비호환 입력은 `TkcError`(throw 없음).
 * 섹션 view는 입력 버퍼를 공유하므로 입력을 transfer/수정하면 view도 무효가 된다. 해시는 검사하지 않는다(`verifyTkc`).
 */
export function readTkc(buf: ArrayBuffer | Uint8Array): Result<TkcReader, TkcError> {
  const u8 = asBytes(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const pre = checkPreamble(dv, u8.byteLength);
  if (!pre.ok) return pre;
  const headerLen = pre.value;
  const parsed = parseHeaderJson(u8.subarray(TKC_PREAMBLE_BYTES, TKC_PREAMBLE_BYTES + headerLen));
  if (!parsed.ok) return parsed;
  const header = parsed.value;
  const indexed = indexKnown(header.sections);
  if (!indexed.ok) return indexed;
  const layout = checkLayout(header.sections, TKC_PREAMBLE_BYTES + headerLen, u8.byteLength);
  if (!layout.ok) return layout;
  const known = indexed.value;
  const reader: TkcReader = {
    header,
    entry: (type) => known.get(type),
    section(type) {
      const e = known.get(type);
      return e ? u8.subarray(e.offset, e.offset + e.length) : undefined;
    },
  };
  return { ok: true, value: reader };
}

/** 등록 섹션의 `hash`를 실제 바이트와 대조(파이프라인 validate·테스트용. 런타임 핫패스에선 생략). */
export function verifyTkc(reader: TkcReader): Result<true, TkcError> {
  for (const e of reader.header.sections) {
    if (!isSectionType(e.type)) continue;
    const data = reader.section(e.type);
    if (!data || sectionHash(data) !== e.hash) return fail(TkcErrorCode.Corrupt, `${e.type} hash mismatch`);
  }
  return { ok: true, value: true };
}
