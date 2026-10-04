// nav.bin(gzip 해제 후) 인코더/디코더(05 §4, M06-T03 — ADR-0063):
// u32 'NAVT', u16 version, u16 tileCount, 반복 {i16 tx, i16 tz, u32 len, u8[len], 0 채움 4바이트 정렬},
// u32 crossCount, 반복 {u32 id, f32 a[3], f32 b[3], f32 halfWidth, u32 signal} (36 B).
// 거부: 매직·버전(corrupt/version), 길이 부족(truncated), 비유한 좌표·폭 ≤ 0(corrupt). 타일 바이트 내용은 Detour가 검사(addTile).
import type { Result } from '@sanpo/core';
import { ok } from '@sanpo/core';
import { NAV_MAGIC, NAV_VERSION, type NavCellData, type NavCrossing, type TkcError, TkcErrorCode } from '../api.ts';
import { ByteReader, ByteWriter, fail } from './bytes.ts';

export function writeNav(d: NavCellData): Uint8Array {
  const w = new ByteWriter();
  w.u32(NAV_MAGIC);
  w.u16(NAV_VERSION);
  w.u16(d.tiles.length);
  for (const t of d.tiles) {
    w.i16(t.tx);
    w.i16(t.tz);
    w.u32(t.data.byteLength);
    w.bytes(t.data);
    for (let k = t.data.byteLength; k % 4 !== 0; k++) w.u8(0);
  }
  w.u32(d.crossings.length);
  for (const c of d.crossings) {
    const v = [...c.a, ...c.b, c.halfWidth];
    if (!v.every(Number.isFinite) || c.halfWidth <= 0) throw new RangeError(`writeNav: bad crossing ${c.id}`);
    w.u32(c.id >>> 0);
    w.f32s(v);
    w.u32(c.signal >>> 0);
  }
  return w.finish();
}

function readCrossing(r: ByteReader): NavCrossing {
  const id = r.u32();
  const v = r.f32s(7);
  const signal = r.u32();
  return {
    id,
    a: [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0],
    b: [v[3] ?? 0, v[4] ?? 0, v[5] ?? 0],
    halfWidth: v[6] ?? 0,
    signal,
  };
}

export function parseNav(bytes: Uint8Array): Result<NavCellData, TkcError> {
  const r = new ByteReader(bytes);
  if (r.u32() !== NAV_MAGIC) return fail(r.overrun ? TkcErrorCode.Truncated : TkcErrorCode.Corrupt, 'nav.bin: magic');
  const version = r.u16();
  if (version !== NAV_VERSION) return fail(TkcErrorCode.Version, `nav.bin: version ${version}`);
  const n = r.u16();
  const tiles: NavCellData['tiles'] = [];
  for (let i = 0; i < n; i++) {
    const tx = r.i16();
    const tz = r.i16();
    const len = r.u32();
    if (r.overrun || r.remaining() < len) return fail(TkcErrorCode.Truncated, `nav.bin: tile ${i}`);
    tiles.push({ tx, tz, data: bytes.slice(r.pos, r.pos + len) });
    r.skip(len + ((4 - (len % 4)) % 4));
  }
  const m = r.u32();
  if (r.overrun || r.remaining() < m * 36) return fail(TkcErrorCode.Truncated, 'nav.bin: crossings');
  const crossings: NavCrossing[] = [];
  for (let i = 0; i < m; i++) {
    const c = readCrossing(r);
    if (![...c.a, ...c.b, c.halfWidth].every(Number.isFinite) || c.halfWidth <= 0)
      return fail(TkcErrorCode.Corrupt, `nav.bin: crossing ${i}`);
    crossings.push(c);
  }
  return ok({ tiles, crossings });
}
