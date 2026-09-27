// lanes.bin(gzip 해제 후) 인코더/디코더. SoA 청크, 참조 무결성(노드 인덱스·점 범위·신호 그룹) 검사. see docs/05-tile-format.md §7
import type { Result } from '@sanpo/core';
import {
  LANE_NO_SIGNAL,
  LANES_MAGIC,
  LANES_VERSION,
  type LaneGraphChunk,
  type TkcError,
  TkcErrorCode,
} from '../api.ts';
import { allFinite, ByteReader, ByteWriter, fail } from './bytes.ts';

const NODE_BYTES = 20;
const LANE_BYTES = 24;
const GROUP_BYTES = 8;

function assertChunk(g: LaneGraphChunk): void {
  const n = g.nodes.id.length;
  const l = g.lanes.id.length;
  const k = g.groups.id.length;
  const sizesOk =
    g.nodes.posLocal.length === n * 3 &&
    g.nodes.portalKey.length === n &&
    [g.lanes.fromNode, g.lanes.toNode, g.lanes.kind, g.lanes.speedKmh, g.lanes.signalGroup].every(
      (a) => a.length === l,
    ) &&
    [g.lanes.ptOffset, g.lanes.ptCount, g.lanes.widthCm].every((a) => a.length === l) &&
    g.pointsLocal.length % 3 === 0 &&
    g.groups.intersection.length === k &&
    g.groups.phaseIndex.length === k;
  if (!sizesOk) throw new RangeError('writeLanes: SoA array lengths disagree');
  const bad = checkRefs(g);
  if (bad) throw new RangeError(`writeLanes: ${bad}`);
}

/** 참조 무결성: 노드 인덱스, 점 범위, 신호 그룹 존재, 유한 좌표. 문제 없으면 null. */
function checkRefs(g: LaneGraphChunk): string | null {
  const n = g.nodes.id.length;
  const points = g.pointsLocal.length / 3;
  const groupIds = new Set(g.groups.id);
  for (let i = 0; i < g.lanes.id.length; i++) {
    if ((g.lanes.fromNode[i] ?? n) >= n || (g.lanes.toNode[i] ?? n) >= n) return `lane ${i} node index ≥ ${n}`;
    if ((g.lanes.ptOffset[i] ?? 0) + (g.lanes.ptCount[i] ?? 0) > points) return `lane ${i} points exceed ${points}`;
    const sg = g.lanes.signalGroup[i] ?? LANE_NO_SIGNAL;
    if (sg !== LANE_NO_SIGNAL && !groupIds.has(sg)) return `lane ${i} signalGroup ${sg} missing`;
  }
  if (!allFinite(g.nodes.posLocal) || !allFinite(g.pointsLocal)) return 'non-finite coordinate';
  return null;
}

function writeNodesLanes(w: ByteWriter, g: LaneGraphChunk): void {
  const { nodes, lanes } = g;
  w.u32(nodes.id.length);
  for (let i = 0; i < nodes.id.length; i++) {
    w.u32(nodes.id[i] ?? 0);
    w.f32s(nodes.posLocal.subarray(i * 3, i * 3 + 3));
    w.u32(nodes.portalKey[i] ?? 0);
  }
  w.u32(lanes.id.length);
  for (let i = 0; i < lanes.id.length; i++) {
    w.u32(lanes.id[i] ?? 0);
    w.u32(lanes.fromNode[i] ?? 0);
    w.u32(lanes.toNode[i] ?? 0);
    w.u8(lanes.kind[i] ?? 0);
    w.u8(lanes.speedKmh[i] ?? 0);
    w.u16(lanes.signalGroup[i] ?? LANE_NO_SIGNAL);
    w.u32(lanes.ptOffset[i] ?? 0);
    w.u16(lanes.ptCount[i] ?? 0);
    w.u16(lanes.widthCm[i] ?? 0);
  }
}

/** 차선 그래프 청크 → lanes.bin 바이트(gzip 전). 배열 길이 불일치·참조 오류는 throw. */
export function writeLanes(g: LaneGraphChunk): Uint8Array {
  assertChunk(g);
  const w = new ByteWriter();
  w.u32(LANES_MAGIC);
  w.u16(LANES_VERSION);
  w.u16(0);
  writeNodesLanes(w, g);
  w.u32(g.pointsLocal.length / 3);
  w.f32s(g.pointsLocal);
  w.u32(g.groups.id.length);
  for (let i = 0; i < g.groups.id.length; i++) {
    w.u16(g.groups.id[i] ?? 0);
    w.u16(g.groups.intersection[i] ?? 0);
    w.u8(g.groups.phaseIndex[i] ?? 0);
    w.u8(0);
    w.u16(0);
  }
  return w.finish();
}

function readNodes(r: ByteReader, n: number): LaneGraphChunk['nodes'] {
  const nodes = { id: new Uint32Array(n), posLocal: new Float32Array(n * 3), portalKey: new Uint32Array(n) };
  for (let i = 0; i < n; i++) {
    nodes.id[i] = r.u32();
    nodes.posLocal.set([r.f32(), r.f32(), r.f32()], i * 3);
    nodes.portalKey[i] = r.u32();
  }
  return nodes;
}

function readLanes(r: ByteReader, l: number): LaneGraphChunk['lanes'] {
  const u32 = () => new Uint32Array(l);
  const u16 = () => new Uint16Array(l);
  const lanes = {
    id: u32(),
    fromNode: u32(),
    toNode: u32(),
    kind: new Uint8Array(l),
    speedKmh: new Uint8Array(l),
    signalGroup: u16(),
    ptOffset: u32(),
    ptCount: u16(),
    widthCm: u16(),
  };
  for (let i = 0; i < l; i++) {
    lanes.id[i] = r.u32();
    lanes.fromNode[i] = r.u32();
    lanes.toNode[i] = r.u32();
    lanes.kind[i] = r.u8v();
    lanes.speedKmh[i] = r.u8v();
    lanes.signalGroup[i] = r.u16();
    lanes.ptOffset[i] = r.u32();
    lanes.ptCount[i] = r.u16();
    lanes.widthCm[i] = r.u16();
  }
  return lanes;
}

function readGroups(r: ByteReader, k: number): LaneGraphChunk['groups'] {
  const groups = { id: new Uint16Array(k), intersection: new Uint16Array(k), phaseIndex: new Uint8Array(k) };
  for (let i = 0; i < k; i++) {
    groups.id[i] = r.u16();
    groups.intersection[i] = r.u16();
    groups.phaseIndex[i] = r.u8v();
    r.skip(3);
  }
  return groups;
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
  const nodes = readNodes(r, n);
  const l = r.u32();
  if (!countFits(r, l, LANE_BYTES)) return fail(TkcErrorCode.Truncated, 'lanes lanes');
  const lanes = readLanes(r, l);
  const p = r.u32();
  if (!countFits(r, p, 12)) return fail(TkcErrorCode.Truncated, 'lanes points');
  const pointsLocal = r.f32s(p * 3).slice();
  const k = r.u32();
  if (!countFits(r, k, GROUP_BYTES)) return fail(TkcErrorCode.Truncated, 'lanes groups');
  const chunk: LaneGraphChunk = { nodes, lanes, pointsLocal, groups: readGroups(r, k) };
  const bad = checkRefs(chunk);
  return bad ? fail(TkcErrorCode.Corrupt, `lanes ${bad}`) : { ok: true, value: chunk };
}
