// TKC v1: round-trip 바이트 동일·결정론·16바이트 정렬, 손상 입력 거부, 미지 섹션 무시, writer 입력 검사. see docs/05-tile-format.md §3–4, §8
import { beforeAll, describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  readTkc,
  SECTION_REGISTRY,
  type SectionType,
  sectionHash,
  TKC_MAGIC,
  type TkcErrorCode,
  type TkcReader,
  type TkcSectionInput,
  verifyTkc,
  writeTkc,
} from '../src/index.ts';
import { HEADER, noise, rawTkc, sections } from './fixtures.ts';

let input: TkcSectionInput[];
let bytes: Uint8Array;

beforeAll(async () => {
  input = await sections();
  bytes = writeTkc(HEADER, input);
});

function read(b: ArrayBuffer | Uint8Array): TkcReader {
  const r = readTkc(b);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

function errCode(b: Uint8Array): TkcErrorCode | 'ok' {
  const r = readTkc(b);
  return r.ok ? 'ok' : r.error.code;
}

/** 리더에서 writer 입력을 복원(등록 섹션만). */
function rebuild(r: TkcReader): Uint8Array {
  const { sections: entries, ...rest } = r.header;
  const again = entries.map((e) => ({
    type: e.type as SectionType,
    sources: e.sources,
    data: r.section(e.type as SectionType) ?? new Uint8Array(0),
  }));
  return writeTkc(rest, again);
}

describe('writeTkc / readTkc round-trip', () => {
  it('write → read → write is byte-identical', () => {
    expect(rebuild(read(bytes))).toEqual(bytes);
  });

  it('is deterministic regardless of section input order and duplicate/unsorted sources', () => {
    const shuffled = [...input].reverse().map((s) => ({ ...s, sources: [...s.sources, ...s.sources].reverse() }));
    expect(writeTkc(HEADER, shuffled)).toEqual(bytes);
  });

  it('accepts a plain ArrayBuffer and an offset Uint8Array view (sections are zero-copy views)', () => {
    const padded = new Uint8Array(bytes.byteLength + 32);
    padded.set(bytes, 32);
    const view = padded.subarray(32);
    const r = read(view);
    expect(r.section('terrain.mesh')?.buffer).toBe(padded.buffer);
    expect(read(bytes.slice().buffer).header).toEqual(r.header);
  });

  it('preserves header fields and section payloads', () => {
    const r = read(bytes);
    const { sections: _, ...rest } = r.header;
    expect(rest).toEqual(HEADER);
    for (const s of input) {
      expect(r.section(s.type)).toEqual(s.data);
      expect(r.entry(s.type)?.codec).toBe(SECTION_REGISTRY[s.type].codec);
      expect(r.entry(s.type)?.hash).toBe(sectionHash(s.data));
    }
    expect(r.section('nav.bin')).toBeUndefined();
    expect(verifyTkc(r).ok).toBe(true);
  });

  it('writes the 16-byte preamble per spec', () => {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    expect([...bytes.subarray(0, 4)]).toEqual([0x54, 0x4b, 0x43, 0x31]);
    expect(dv.getUint32(0, true)).toBe(TKC_MAGIC);
    expect(dv.getUint16(4, true)).toBe(FORMAT_VERSION);
    expect(dv.getUint16(6, true)).toBe(0);
    expect(dv.getUint32(12, true)).toBe(0);
  });
});

describe('16-byte alignment', () => {
  it('places every section at a 16-aligned offset after the padded header, in type order, zero-padded', () => {
    const r = read(bytes);
    const headerLen = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true);
    const headerEnd = 16 + Math.ceil(headerLen / 16) * 16;
    const entries = r.header.sections;
    expect(entries.map((e) => e.type)).toEqual([...entries.map((e) => e.type)].sort());
    expect(entries[0]?.offset).toBe(headerEnd);
    let prevEnd = 16 + headerLen;
    for (const e of entries) {
      expect(e.offset % 16).toBe(0);
      expect(bytes.subarray(prevEnd, e.offset).every((b) => b === 0)).toBe(true);
      expect(e.offset - prevEnd).toBeLessThan(16);
      prevEnd = e.offset + e.length;
    }
    expect(prevEnd).toBe(bytes.byteLength);
  });

  it('keeps alignment for zero-length and 1-byte sections', () => {
    const b = writeTkc(HEADER, [
      { type: 'nav.bin', sources: ['osm'], data: new Uint8Array(0) },
      { type: 'terrain.mesh', sources: ['gsi-dem'], data: new Uint8Array([7]) },
      { type: 'roads.mesh', sources: ['osm'], data: noise(17, 'roads') },
    ]);
    const r = read(b);
    for (const e of r.header.sections) expect(e.offset % 16).toBe(0);
    expect(r.section('nav.bin')?.byteLength).toBe(0);
    expect(r.section('terrain.mesh')).toEqual(new Uint8Array([7]));
    expect(rebuild(r)).toEqual(b);
  });

  it('writes an empty-section cell', () => {
    const r = read(writeTkc(HEADER, []));
    expect(r.header.sections).toEqual([]);
  });
});

describe('readTkc rejects damaged or incompatible input', () => {
  const header = () => {
    const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(8, true);
    return JSON.parse(new TextDecoder().decode(bytes.subarray(16, 16 + len)));
  };
  const patch = (off: number, set: (dv: DataView) => void) => {
    const b = bytes.slice();
    set(new DataView(b.buffer, off));
    return b;
  };

  it('short buffers → truncated', () => {
    expect(errCode(new Uint8Array(0))).toBe('truncated');
    expect(errCode(bytes.subarray(0, 15))).toBe('truncated');
    expect(errCode(bytes.subarray(0, 40))).toBe('truncated');
  });

  it('wrong magic → magic; other versions → version; unknown/gzip flags → flags', () => {
    expect(errCode(patch(0, (d) => d.setUint8(3, 0x32)))).toBe('magic');
    expect(errCode(patch(0, (d) => d.setUint32(0, 0x46546c67, true)))).toBe('magic');
    expect(errCode(patch(4, (d) => d.setUint16(0, 2, true)))).toBe('version');
    expect(errCode(patch(4, (d) => d.setUint16(0, 0, true)))).toBe('version');
    expect(errCode(patch(6, (d) => d.setUint16(0, 1, true)))).toBe('flags');
    expect(errCode(patch(6, (d) => d.setUint16(0, 0x8000, true)))).toBe('flags');
  });

  it('bad header JSON / structure → header', () => {
    expect(errCode(patch(16, (d) => d.setUint8(0, 0x5b)))).toBe('header');
    expect(errCode(rawTkc({ ...header(), cell: { level: 5, ix: 0, iz: 0 } }, []))).toBe('header');
    const s0 = header().sections[0];
    expect(errCode(rawTkc({ ...header(), sections: [{ ...s0, hash: 'md5:00' }] }, []))).toBe('header');
    expect(errCode(rawTkc({ ...header(), sections: [{ ...s0, codec: 'bin+gzip' }] }, [], { total: 8192 }))).toBe(
      'header',
    );
    expect(errCode(rawTkc({ ...header(), sections: [s0, s0] }, [], { total: 8192 }))).toBe('header');
  });

  it('out-of-range offsets → range', () => {
    const h = header();
    const last = h.sections[h.sections.length - 1];
    const tooLong = { ...h, sections: [{ ...last, length: last.length + 1 }] };
    expect(errCode(rawTkc(tooLong, [], { total: bytes.byteLength }))).toBe('range');
    const beyond = { ...h, sections: [{ ...last, offset: 1 << 24 }] };
    expect(errCode(rawTkc(beyond, [], { total: bytes.byteLength }))).toBe('range');
    const intoHeader = { ...h, sections: [{ ...h.sections[0], offset: 16 }] };
    expect(errCode(rawTkc(intoHeader, [], { total: bytes.byteLength }))).toBe('range');
    const [a, b] = h.sections;
    const overlap = { ...h, sections: [a, { ...b, offset: a.offset }] };
    expect(errCode(rawTkc(overlap, [], { total: bytes.byteLength }))).toBe('range');
  });

  it('misaligned offsets → align', () => {
    const h = header();
    const s = h.sections[0];
    expect(errCode(rawTkc({ ...h, sections: [{ ...s, offset: s.offset + 8 }] }, [], { total: 8192 }))).toBe('align');
  });

  it('verifyTkc detects tampered section bytes', () => {
    const b = bytes.slice();
    const r = read(b);
    const e = r.entry('terrain.mesh');
    if (!e) throw new Error('missing terrain.mesh');
    b[e.offset] = (b[e.offset] ?? 0) ^ 0xff;
    const v = verifyTkc(read(b));
    expect(v.ok ? 'ok' : v.error.code).toBe('corrupt');
  });
});

describe('unknown sections are ignored (forward compatibility)', () => {
  it('reads known sections and skips an unregistered type with an unknown codec', () => {
    const glb = noise(40, 'fut');
    const future = noise(20, 'future');
    const h = {
      ...HEADER,
      extraField: { from: 'v1.x' },
      sections: [
        { type: 'future.thing', offset: 1024, length: 20, codec: 'zstd', sources: ['x'], hash: sectionHash(future) },
        { type: 'terrain.mesh', offset: 1056, length: 40, codec: 'glb', sources: ['gsi-dem'], hash: sectionHash(glb) },
      ],
    };
    const r = read(
      rawTkc(h, [
        [1024, future],
        [1056, glb],
      ]),
    );
    expect(r.section('terrain.mesh')).toEqual(glb);
    expect(r.header.sections.map((e) => e.type)).toEqual(['future.thing', 'terrain.mesh']);
    expect(r.section('future.thing' as SectionType)).toBeUndefined();
    expect(verifyTkc(r).ok).toBe(true);
    // 재기록 시 미지 섹션·추가 필드는 떨어진다.
    expect(read(rebuildKnown(r)).header.sections.map((e) => e.type)).toEqual(['terrain.mesh']);
  });
});

function rebuildKnown(r: TkcReader): Uint8Array {
  const { sections: _, ...rest } = r.header;
  const data = r.section('terrain.mesh') ?? new Uint8Array(0);
  return writeTkc(rest, [{ type: 'terrain.mesh', sources: ['gsi-dem'], data }]);
}

describe('writeTkc rejects programming errors', () => {
  const data = new Uint8Array(4);
  it('throws on unregistered, duplicate or level-disallowed sections', () => {
    expect(() => writeTkc(HEADER, [{ type: 'bogus' as SectionType, sources: ['a'], data }])).toThrow(/unregistered/);
    const dup = { type: 'nav.bin' as const, sources: ['a'], data };
    expect(() => writeTkc(HEADER, [dup, dup])).toThrow(/duplicate/);
    expect(() => writeTkc(HEADER, [{ type: 'hlod.mesh', sources: ['a'], data }])).toThrow(/not allowed at L0/);
    expect(() => writeTkc(HEADER, [{ type: 'nav.bin', sources: [], data }])).toThrow(/sources/);
  });

  it('throws on non-finite geometry or out-of-range cell', () => {
    expect(() => writeTkc({ ...HEADER, originWF: [Number.NaN, 0, 0] }, [])).toThrow(/originWF/);
    expect(() => writeTkc({ ...HEADER, cell: { level: 0, ix: 40000, iz: 0 } }, [])).toThrow(/i16/);
  });
});
