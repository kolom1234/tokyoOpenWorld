// cells.idx·JCOL·lanes.bin·terrain.height·gzip: round-trip 바이트 동일, 손상 입력 거부. see docs/05-tile-format.md §4–7
import { packCellKey } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import {
  CELL_FLAG,
  type CellsIndexEntry,
  gunzip,
  gzip,
  HEIGHTFIELD_BASE_M,
  type LaneGraphChunk,
  parseHeightfield,
  parseJcol,
  parseLanes,
  quantizeHeightfield,
  readCellsIndex,
  tkcHash32,
  writeCellsIndex,
  writeHeightfield,
  writeJcol,
  writeLanes,
} from '../src/index.ts';
import { heightsM, lanesChunk, noise, SHAPES } from './fixtures.ts';

const code = (r: { ok: boolean; error?: { code: string } }): string => (r.ok ? 'ok' : (r.error?.code ?? '?'));

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('cells.idx', () => {
  const entries: CellsIndexEntry[] = [
    { level: 1, ix: 0, iz: -5, flags: 0, byteLength: 2_500_000, hash32: 0xffffffff },
    { level: 0, ix: 6, iz: -17, flags: CELL_FLAG.rail, byteLength: 1234, hash32: 1 },
    {
      level: 0,
      ix: -7,
      iz: -17,
      flags: CELL_FLAG.override | CELL_FLAG.rail,
      byteLength: 4_000_000,
      hash32: 0x9e3779b9,
    },
    { level: 0, ix: -7, iz: 3, flags: 0, byteLength: 16, hash32: tkcHash32(noise(64, 'cell')) },
  ];

  it('round-trips byte-identically in (level, iz, ix) order with 16-byte records', () => {
    const bytes = writeCellsIndex(entries);
    expect(bytes.byteLength).toBe(8 + 16 * entries.length);
    expect([...bytes.subarray(0, 4)]).toEqual([0x54, 0x4b, 0x43, 0x49]);
    const idx = unwrap(readCellsIndex(bytes));
    expect([...idx.keys()]).toEqual([
      packCellKey(0, -7, -17),
      packCellKey(0, 6, -17),
      packCellKey(0, -7, 3),
      packCellKey(1, 0, -5),
    ]);
    expect(idx.get(packCellKey(0, -7, -17))).toEqual({ flags: 3, byteLength: 4_000_000, hash32: 0x9e3779b9 });
    expect(writeCellsIndex([...entries].reverse())).toEqual(bytes);
    expect(unwrap(readCellsIndex(bytes.slice().buffer)).size).toBe(4);
  });

  it('rejects bad magic, truncation, trailing bytes, disorder and duplicates', () => {
    const bytes = writeCellsIndex(entries);
    const bad = bytes.slice();
    bad[3] = 0x31;
    expect(code(readCellsIndex(bad))).toBe('magic');
    expect(code(readCellsIndex(bytes.subarray(0, 5)))).toBe('truncated');
    expect(code(readCellsIndex(bytes.subarray(0, bytes.byteLength - 1)))).toBe('truncated');
    expect(code(readCellsIndex(new Uint8Array([...bytes, 0])))).toBe('range');
    const swapped = bytes.slice();
    swapped.set(bytes.subarray(8, 24), 24);
    swapped.set(bytes.subarray(24, 40), 8);
    expect(code(readCellsIndex(swapped))).toBe('corrupt');
    const [first] = entries;
    if (!first) throw new Error('fixture');
    expect(() => writeCellsIndex([first, first])).toThrow(/duplicate/);
    expect(() => writeCellsIndex([{ ...first, ix: 40000 }])).toThrow(RangeError);
  });

  it('empty index', () => {
    expect(unwrap(readCellsIndex(writeCellsIndex([]))).size).toBe(0);
  });
});

describe('JCOL', () => {
  it('round-trips byte-identically and preserves f32 values', () => {
    const bytes = writeJcol(SHAPES);
    const shapes = unwrap(parseJcol(bytes));
    expect(writeJcol(shapes)).toEqual(bytes);
    expect(shapes.map((s) => s.kind)).toEqual(['triMesh', 'box', 'capsule', 'cylinder', 'convexHull']);
    const box = shapes[1];
    expect(box?.kind === 'box' && box.halfExtents).toEqual([0.4, 0.9, 0.35].map(Math.fround));
    const mesh = shapes[0];
    expect(mesh?.kind === 'triMesh' && [...mesh.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it('rejects damage', () => {
    const bytes = writeJcol(SHAPES);
    expect(code(parseJcol(bytes.subarray(0, 6)))).toBe('truncated');
    expect(code(parseJcol(bytes.subarray(0, bytes.byteLength - 1)))).toBe('truncated');
    const magic = bytes.slice();
    magic[0] = 0;
    expect(code(parseJcol(magic))).toBe('magic');
    const ver = bytes.slice();
    ver[4] = 2;
    expect(code(parseJcol(ver))).toBe('version');
    const kind = bytes.slice();
    kind[8] = 9;
    expect(code(parseJcol(kind))).toBe('corrupt');
    const idx = bytes.slice(); // 첫 삼각형 인덱스(8 + 32 + 8 + 12 f32) → 99
    new DataView(idx.buffer).setUint32(8 + 32 + 8 + 12 * 4, 99, true);
    expect(code(parseJcol(idx))).toBe('corrupt');
    const huge = bytes.slice(); // vCount 폭증 → 할당 전에 truncated
    new DataView(huge.buffer).setUint32(8 + 32, 0x7fffffff, true);
    expect(code(parseJcol(huge))).toBe('truncated');
  });

  it('writer rejects out-of-range indices', () => {
    const [mesh] = SHAPES;
    if (mesh?.kind !== 'triMesh') throw new Error('fixture');
    expect(() => writeJcol([{ ...mesh, indices: new Uint32Array([0, 1, 4]) }])).toThrow(RangeError);
  });
});

describe('lanes.bin', () => {
  it('round-trips byte-identically', () => {
    const bytes = writeLanes(lanesChunk());
    const g = unwrap(parseLanes(bytes));
    expect(writeLanes(g)).toEqual(bytes);
    expect(g).toEqual(lanesChunk());
    expect(bytes.byteLength).toBe(8 + 4 + 3 * 16 + 4 + 2 * 28 + 4 + 5 * 12);
  });

  it('rejects damage and broken references', () => {
    const bytes = writeLanes(lanesChunk());
    expect(code(parseLanes(bytes.subarray(0, bytes.byteLength - 1)))).toBe('truncated');
    const magic = bytes.slice();
    magic[0] = 0;
    expect(code(parseLanes(magic))).toBe('magic');
    const node = bytes.slice(); // lane 0 fromNode = 3 (노드 3개)
    new DataView(node.buffer).setUint32(8 + 4 + 48 + 4 + 4, 3, true);
    expect(code(parseLanes(node))).toBe('corrupt');
    const ver = bytes.slice();
    ver[4] = 1;
    expect(code(parseLanes(ver))).toBe('version');
    const g: LaneGraphChunk = lanesChunk();
    g.lanes.toNode[0] = 9;
    expect(() => writeLanes(g)).toThrow(/node index/);
    const p = lanesChunk();
    p.lanes.ptCount[1] = 4;
    expect(() => writeLanes(p)).toThrow(/points/);
  });
});

describe('terrain.height', () => {
  it('quantizes at 1 cm, round-trips byte-identically, reconstructs within step/2', () => {
    const h = heightsM();
    const hf = quantizeHeightfield(h, 257);
    const bytes = writeHeightfield(hf);
    expect(bytes.byteLength).toBe(10 + 257 * 257 * 2);
    const back = unwrap(parseHeightfield(bytes));
    expect(writeHeightfield(back)).toEqual(bytes);
    let maxErr = 0;
    for (let i = 0; i < h.length; i++) {
      maxErr = Math.max(maxErr, Math.abs(back.minH + (back.data[i] ?? 0) * back.step - (h[i] ?? 0)));
    }
    expect(maxErr).toBeLessThan(0.0051);
    expect(code(parseHeightfield(bytes.subarray(0, 100)))).toBe('truncated');
    expect(() => quantizeHeightfield([0, 0, 0, 1000], 2)).toThrow(/range/);
    expect(() => quantizeHeightfield([0, 0, 0, -100.01], 2)).toThrow(/range/);
  });

  it('uses the shared base so equal heights quantize to equal u16 in every cell (ADR-0018)', () => {
    // 경계 열(33.337)은 같고 셀 최솟값은 다른 두 격자.
    const west = quantizeHeightfield([2.5, 33.337, 2.5, 33.337], 2);
    const east = quantizeHeightfield([33.337, 80.25, 33.337, 90.1], 2);
    expect(west.minH).toBe(HEIGHTFIELD_BASE_M);
    expect(east.minH).toBe(west.minH);
    expect(east.step).toBe(west.step);
    expect([west.data[1], west.data[3]]).toEqual([east.data[0], east.data[2]]);
  });
});

describe('gzip', () => {
  it('round-trips, is deterministic and normalizes the OS byte', async () => {
    const data = noise(10_000, 'gz');
    const a = await gzip(data);
    expect(await gzip(data)).toEqual(a);
    expect(a[9]).toBe(0xff);
    expect(unwrap(await gunzip(a))).toEqual(data);
  });

  it('reports corrupt input as a result, not a rejection', async () => {
    const a = await gzip(noise(1000, 'gz2'));
    expect(code(await gunzip(a.subarray(0, a.byteLength - 10)))).toBe('corrupt');
    expect(code(await gunzip(new Uint8Array([1, 2, 3])))).toBe('corrupt');
  });
});
