// global/rail.bin(gzip 해제 후) v1 인코더/디코더(05 §9, M07-T01 — ADR-0070): u32 'RAIL', u16 version, u16 pad, u32 jsonBytes, 메타 JSON(UTF-8, 4바이트 채움),
// u32 pointCount, f32[pointCount×3] 표본 WF xyz, f32[pointCount] 제한속도(m/s), u8[pointCount] 플래그. 메타 = { lines, tracks, stations, platforms(M07-T04 — 없으면 []) }.
// 검사: 선로 표본 범위·정차 s ∈ [0, 길이]·노선/역 참조·비유한 값.
import type { Result } from '@sanpo/core';
import { ok } from '@sanpo/core';
import { RAIL_MAGIC, RAIL_VERSION, type RailNetwork, type TkcError, TkcErrorCode } from '../api.ts';
import { allFinite, ByteReader, ByteWriter, fail } from './bytes.ts';

type Meta = Pick<RailNetwork, 'lines' | 'tracks' | 'stations' | 'platforms'>;

/** 참조 무결성(메타 ↔ 배열). 문제 없으면 null. */
function checkNetwork(n: RailNetwork): string | null {
  const points = n.points.length / 3;
  if (n.points.length % 3 !== 0 || n.speed.length !== points || n.flags.length !== points)
    return 'array lengths disagree';
  const lines = new Set(n.lines.map((l) => l.id));
  const stations = new Set(n.stations.map((s) => s.id));
  for (const t of n.tracks) {
    if (!lines.has(t.line)) return `track ${t.id}: unknown line ${t.line}`;
    if (t.ptCount < 2 || t.ptOffset + t.ptCount > points) return `track ${t.id}: points exceed ${points}`;
    for (const s of t.stops) {
      if (!stations.has(s.station)) return `track ${t.id}: unknown station ${s.station}`;
      if (s.platform !== undefined && !n.platforms[s.platform]) return `track ${t.id}: stop platform ${s.platform}`;
      if (!(s.s >= 0 && s.s <= t.lengthM)) return `track ${t.id}: stop ${s.station} s ${s.s} ∉ [0, ${t.lengthM}]`;
    }
  }
  for (const p of n.platforms)
    if (
      p.ringXZ.length < 6 ||
      p.ringXZ.length % 2 !== 0 ||
      !p.ringXZ.every(Number.isFinite) ||
      !Number.isFinite(p.topY)
    )
      return `platform ${p.id}: bad ring`;
  if (!allFinite(n.points) || !allFinite(n.speed)) return 'non-finite sample';
  return null;
}

export function writeRail(n: RailNetwork): Uint8Array {
  const bad = checkNetwork(n);
  if (bad) throw new RangeError(`writeRail: ${bad}`);
  const meta: Meta = { lines: n.lines, tracks: n.tracks, stations: n.stations, platforms: n.platforms };
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const pad = (4 - (json.length % 4)) % 4;
  const w = new ByteWriter();
  w.u32(RAIL_MAGIC);
  w.u16(RAIL_VERSION);
  w.u16(0);
  w.u32(json.length + pad);
  w.bytes(json);
  for (let i = 0; i < pad; i++) w.u8(0x20);
  w.u32(n.points.length / 3);
  w.f32s(n.points);
  w.f32s(n.speed);
  w.bytes(n.flags);
  return w.finish();
}

export function parseRail(bytes: Uint8Array): Result<RailNetwork, TkcError> {
  const r = new ByteReader(bytes);
  const magic = r.u32();
  const version = r.u16();
  r.skip(2);
  const jsonBytes = r.u32();
  if (r.overrun) return fail(TkcErrorCode.Truncated, 'rail header');
  if (magic !== RAIL_MAGIC) return fail(TkcErrorCode.Magic, `rail magic 0x${magic.toString(16)}`);
  if (version !== RAIL_VERSION) return fail(TkcErrorCode.Version, `rail version ${version}`);
  if (jsonBytes > r.remaining()) return fail(TkcErrorCode.Truncated, 'rail meta');
  let meta: Meta;
  try {
    meta = JSON.parse(new TextDecoder().decode(bytes.subarray(r.pos, r.pos + jsonBytes))) as Meta;
  } catch (e) {
    return fail(TkcErrorCode.Header, `rail meta JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  r.skip(jsonBytes);
  const count = r.u32();
  if (r.overrun || count * 17 > r.remaining()) return fail(TkcErrorCode.Truncated, `rail ${count} samples`);
  const points = Float32Array.from(r.f32s(count * 3));
  const speed = Float32Array.from(r.f32s(count));
  const flags = Uint8Array.from(bytes.subarray(r.pos, r.pos + count));
  const n: RailNetwork = { ...meta, platforms: meta.platforms ?? [], points, speed, flags };
  const bad = checkNetwork(n);
  if (bad) return fail(TkcErrorCode.Corrupt, `rail: ${bad}`);
  return ok(n);
}
