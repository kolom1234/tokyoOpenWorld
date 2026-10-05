// lanes.bin(gzip 해제 후) v2 인코더/디코더(05 §7, M06-T05 — ADR-0065). SoA 청크, 참조 무결성(노드 인덱스·점 범위·유한 좌표) 검사.
// 노드 16 B {u32 key, f32 x,y,z}, 차선 28 B {u32 id, u32 from, u32 to, u8 kind, u8 turn, u8 speedKmh, u8 laneIdx, u32 signal, u32 ptOffset, u16 ptCount, u16 widthCm}.
import type { Result } from '@sanpo/core';
import { LANES_MAGIC, LANES_VERSION, type LaneGraphChunk, type TkcError, TkcErrorCode } from '../api.ts';
import { allFinite, ByteReader, ByteWriter, fail } from './bytes.ts';

const NODE_BYTES = 16;
const LANE_BYTES = 28;

function assertChunk(g: LaneGraphChunk): void {
  const n = g.nodes.key.length;
  const l = g.lanes.id.length;
  const L = g.lanes;
  const sizesOk =
    g.nodes.posLocal.length === n * 3 &&
    [L.fromNode, L.toNode, L.kind, L.turn, L.speedKmh, L.laneIdx, L.signal, L.ptOffset, L.ptCount, L.widthCm].every(
      (a) => a.length === l,
    ) &&
    g.pointsLocal.length % 3 === 0;
  if (!sizesOk) throw new RangeError('writeLanes: SoA array lengths disagree');
  const bad = checkRefs(g);
  if (bad) throw new RangeError(`writeLanes: ${bad}`);
}

/** 참조 무결성: 노드 인덱스, 점 범위, 유한 좌표. 문제 없으면 null. */
function checkRefs(g: LaneGraphChunk): string | null {
  const n = g.nodes.key.length;
  const points = g.pointsLocal.length / 3;
  for (let i = 0; i < g.lanes.id.length; i++) {
    if ((g.lanes.fromNode[i] ?? n) >= n || (g.lanes.toNode[i] ?? n) >= n) return `lane ${i} node index ≥ ${n}`;
    if ((g.lanes.ptOffset[i] ?? 0) + (g.lanes.ptCount[i] ?? 0) > points) return `lane ${i} points exceed ${points}`;
  }
  if (!allFinite(g.nodes.posLocal) || !allFinite(g.pointsLocal)) return 'non-finite coordinate';
  return null;
}

/** 차선 그래프 청크 → lanes.bin 바이트(gzip 전). 배열 길이 불일치·참조 오류는 throw. */
export function writeLanes(g: LaneGraphChunk): Uint8Array {
  assertChunk(g);
  const w = new ByteWriter();
  w.u32(LANES_MAGIC);
  w.u16(LANES_VERSION);
  w.u16(0);
  const { nodes, lanes } = g;
  w.u32(nodes.key.length);
  for (let i = 0; i < nodes.key.length; i++) {
    w.u32(nodes.key[i] ?? 0);
    w.f32s(nodes.posLocal.subarray(i * 3, i * 3 + 3));
  }
  w.u32(lanes.id.length);
  for (let i = 0; i < lanes.id.length; i++) {
    w.u32(lanes.id[i] ?? 0);
    w.u32(lanes.fromNode[i] ?? 0);
    w.u32(lanes.toNode[i] ?? 0);
    w.u8(lanes.kind[i] ?? 0);
    w.u8(lanes.turn[i] ?? 0);
    w.u8(lanes.speedKmh[i] ?? 0);
    w.u8(lanes.laneIdx[i] ?? 0);
    w.u32(lanes.signal[i] ?? 0);
    w.u32(lanes.ptOffset[i] ?? 0);
    w.u16(lanes.ptCount[i] ?? 0);
    w.u16(lanes.widthCm[i] ?? 0);
  }
  w.u32(g.pointsLocal.length / 3);
  w.f32s(g.pointsLocal);
  return w.finish();
}

function readLanes(r: ByteReader, l: number): LaneGraphChunk['lanes'] {
  const lanes = {
    id: new Uint32Array(l),
    fromNode: new Uint32Array(l),
    toNode: new Uint32Array(l),
    kind: new Uint8Array(l),
    turn: new Uint8Array(l),
    speedKmh: new Uint8Array(l),
    laneIdx: new Uint8Array(l),
    signal: new Uint32Array(l),
    ptOffset: new Uint32Array(l),
    ptCount: new Uint16Array(l),
    widthCm: new Uint16Array(l),
  };
  for (let i = 0; i < l; i++) {
    lanes.id[i] = r.u32();
    lanes.fromNode[i] = r.u32();
    lanes.toNode[i] = r.u32();
    lanes.kind[i] = r.u8v();
    lanes.turn[i] = r.u8v();
    lanes.speedKmh[i] = r.u8v();
    lanes.laneIdx[i] = r.u8v();
    lanes.signal[i] = r.u32();
    lanes.ptOffset[i] = r.u32();
    lanes.ptCount[i] = r.u16();
    lanes.widthCm[i] = r.u16();
  }
  return lanes;
}

/** count × 레코드 크기가 남은 바이트를 넘으면 할당 전에 거부(손상된 count로 인한 거대 할당 방지). */
function countFits(r: ByteReader, count: number, recordBytes: number): boolean {
  return !r.overrun && count * recordBytes <= r.remaining();
}

/** lanes.bin 바이트(gzip 해제 후) → SoA 청크(사본). 길이 부족·참조 오류·비유한 좌표는 오류. */
export function parseLanes(bytes: Uint8Array): Result<LaneGraphChunk, TkcError> {
  const r = new ByteReader(bytes);
  const magic = r.u32();
  const version = r.u16();
  r.skip(2);
  if (r.overrun) return fail(TkcErrorCode.Truncated, 'lanes header');
  if (magic !== LANES_MAGIC) return fail(TkcErrorCode.Magic, `lanes magic 0x${magic.toString(16)}`);
  if (version !== LANES_VERSION) return fail(TkcErrorCode.Version, `lanes version ${version}`);
  const n = r.u32();
  if (!countFits(r, n, NODE_BYTES)) return fail(TkcErrorCode.Truncated, 'lanes nodes');
  const nodes = { key: new Uint32Array(n), posLocal: new Float32Array(n * 3) };
  for (let i = 0; i < n; i++) {
    nodes.key[i] = r.u32();
    nodes.posLocal.set([r.f32(), r.f32(), r.f32()], i * 3);
  }
  const l = r.u32();
  if (!countFits(r, l, LANE_BYTES)) return fail(TkcErrorCode.Truncated, 'lanes lanes');
  const lanes = readLanes(r, l);
  const p = r.u32();
  if (!countFits(r, p, 12)) return fail(TkcErrorCode.Truncated, 'lanes points');
  const chunk: LaneGraphChunk = { nodes, lanes, pointsLocal: r.f32s(p * 3).slice() };
  const bad = checkRefs(chunk);
  return bad ? fail(TkcErrorCode.Corrupt, `lanes ${bad}`) : { ok: true, value: chunk };
}
