// JCOL(collision.bin 압축 해제 후) 인코더/디코더. 셀 로컬 좌표, f32. see docs/05-tile-format.md §6, docs/08-physics.md §3
import type { Result } from '@sanpo/core';
import { JCOL_MAGIC, JCOL_VERSION, type JcolKind, type JcolShape, type TkcError, TkcErrorCode } from '../api.ts';
import { allFinite, ByteReader, ByteWriter, fail } from './bytes.ts';

const KIND_CODE: Record<JcolKind, number> = { triMesh: 0, box: 1, capsule: 2, cylinder: 3, convexHull: 4 };
const KIND_BY_CODE: readonly JcolKind[] = ['triMesh', 'box', 'capsule', 'cylinder', 'convexHull'];
const MAX_SHAPES = 0xffff;
const U8_MAX = 0xff;

function assertShape(s: JcolShape, i: number): void {
  const u8ok = [s.layer, s.material, s.flags].every((v) => Number.isInteger(v) && v >= 0 && v <= U8_MAX);
  if (!u8ok) throw new RangeError(`writeJcol: shape ${i} layer/material/flags must be u8`);
  if (!allFinite(s.posLocal) || !allFinite(s.quat)) throw new RangeError(`writeJcol: shape ${i} non-finite pose`);
  if (s.kind === 'triMesh') {
    const vCount = s.vertices.length / 3;
    if (!Number.isInteger(vCount) || s.indices.length % 3 !== 0) throw new RangeError(`writeJcol: shape ${i} sizes`);
    for (const ix of s.indices) if (ix >= vCount) throw new RangeError(`writeJcol: shape ${i} index ${ix} ≥ ${vCount}`);
  }
  if (s.kind === 'convexHull' && s.vertices.length % 3 !== 0) throw new RangeError(`writeJcol: shape ${i} sizes`);
}

function writeBody(w: ByteWriter, s: JcolShape): void {
  switch (s.kind) {
    case 'triMesh':
      w.u32(s.vertices.length / 3);
      w.u32(s.indices.length);
      w.f32s(s.vertices);
      w.u32s(s.indices);
      return;
    case 'convexHull':
      w.u32(s.vertices.length / 3);
      w.u32(0);
      w.f32s(s.vertices);
      return;
    case 'box':
      w.f32s(s.halfExtents);
      return;
    case 'capsule':
    case 'cylinder':
      w.f32(s.halfHeight);
      w.f32(s.radius);
      return;
  }
}

/** 셰이프 목록 → JCOL 바이트(gzip 전). 셰이프 순서 유지. 잘못된 입력은 throw. */
export function writeJcol(shapes: readonly JcolShape[]): Uint8Array {
  if (shapes.length > MAX_SHAPES) throw new RangeError(`writeJcol: ${shapes.length} shapes > ${MAX_SHAPES}`);
  const w = new ByteWriter();
  w.u32(JCOL_MAGIC);
  w.u16(JCOL_VERSION);
  w.u16(shapes.length);
  shapes.forEach((s, i) => {
    assertShape(s, i);
    w.u8(KIND_CODE[s.kind]);
    w.u8(s.layer);
    w.u8(s.material);
    w.u8(s.flags);
    w.f32s(s.posLocal);
    w.f32s(s.quat);
    writeBody(w, s);
  });
  return w.finish();
}

type Base = Pick<JcolShape, 'layer' | 'material' | 'flags' | 'posLocal' | 'quat'>;

function readMesh(r: ByteReader, base: Base, kind: 'triMesh' | 'convexHull', i: number): Result<JcolShape, TkcError> {
  const vCount = r.u32();
  const iCount = r.u32();
  if (r.overrun || r.remaining() < (vCount * 3 + iCount) * 4) return fail(TkcErrorCode.Truncated, `shape ${i} arrays`);
  if (kind === 'convexHull' && iCount !== 0)
    return fail(TkcErrorCode.Corrupt, `shape ${i} convexHull iCount ${iCount}`);
  if (iCount % 3 !== 0) return fail(TkcErrorCode.Corrupt, `shape ${i} iCount ${iCount} not multiple of 3`);
  const vertices = r.f32s(vCount * 3);
  if (!allFinite(vertices)) return fail(TkcErrorCode.Corrupt, `shape ${i} non-finite vertex`);
  if (kind === 'convexHull') return { ok: true, value: { ...base, kind, vertices } };
  const indices = r.u32s(iCount);
  for (const ix of indices) if (ix >= vCount) return fail(TkcErrorCode.Corrupt, `shape ${i} index ${ix} ≥ ${vCount}`);
  return { ok: true, value: { ...base, kind, vertices, indices } };
}

function readShape(r: ByteReader, i: number): Result<JcolShape, TkcError> {
  const code = r.u8v();
  const base: Base = {
    layer: r.u8v(),
    material: r.u8v(),
    flags: r.u8v(),
    posLocal: [r.f32(), r.f32(), r.f32()],
    quat: [r.f32(), r.f32(), r.f32(), r.f32()],
  };
  if (r.overrun) return fail(TkcErrorCode.Truncated, `shape ${i} header`);
  const kind = KIND_BY_CODE[code];
  if (!kind) return fail(TkcErrorCode.Corrupt, `shape ${i} unknown kind ${code}`);
  if (!allFinite(base.posLocal) || !allFinite(base.quat)) return fail(TkcErrorCode.Corrupt, `shape ${i} pose`);
  if (kind === 'triMesh' || kind === 'convexHull') return readMesh(r, base, kind, i);
  const shape: JcolShape =
    kind === 'box'
      ? { ...base, kind, halfExtents: [r.f32(), r.f32(), r.f32()] }
      : { ...base, kind, halfHeight: r.f32(), radius: r.f32() };
  if (r.overrun) return fail(TkcErrorCode.Truncated, `shape ${i} dims`);
  const dims = shape.kind === 'box' ? shape.halfExtents : [shape.halfHeight, shape.radius];
  if (!allFinite(dims)) return fail(TkcErrorCode.Corrupt, `shape ${i} dims`);
  return { ok: true, value: shape };
}

/**
 * JCOL 바이트(gzip 해제 후) → 셰이프. 배열은 입력 버퍼 view(4바이트 정렬 시) 또는 사본.
 * 미지 kind·범위 밖 인덱스·비유한 값·길이 부족은 오류. 끝의 여분 바이트는 무시.
 */
export function parseJcol(bytes: Uint8Array): Result<JcolShape[], TkcError> {
  const r = new ByteReader(bytes);
  const magic = r.u32();
  const version = r.u16();
  const count = r.u16();
  if (r.overrun) return fail(TkcErrorCode.Truncated, 'JCOL header');
  if (magic !== JCOL_MAGIC) return fail(TkcErrorCode.Magic, `JCOL magic 0x${magic.toString(16)}`);
  if (version !== JCOL_VERSION) return fail(TkcErrorCode.Version, `JCOL version ${version}`);
  const shapes: JcolShape[] = [];
  for (let i = 0; i < count; i++) {
    const s = readShape(r, i);
    if (!s.ok) return s;
    shapes.push(s.value);
  }
  return { ok: true, value: shapes };
}
