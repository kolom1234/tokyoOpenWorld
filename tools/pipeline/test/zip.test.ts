// 최소 ZIP 읽기(lib/zip.ts — 저장·deflate). M05 결정 2 아바타 굽기에서 쓰던 것(아바타는 ADR-0057 Rocketbox로 교체).
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readZip } from '../src/lib/zip.ts';

/** 항목 2개(저장·deflate) ZIP을 손으로 만든다. */
function makeZip(files: { name: string; data: Uint8Array; deflate: boolean }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const body = f.deflate ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const name = new TextEncoder().encode(f.name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(8, f.deflate ? 8 : 0, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(10, f.deflate ? 8 : 0, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    locals.push(new Uint8Array(lh.buffer), name, body);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

describe('zip', () => {
  it('reads stored and deflated zip entries', () => {
    const a = new TextEncoder().encode('hello avatar');
    const b = new Uint8Array(4096).map((_, i) => i % 7);
    const zip = readZip(
      makeZip([
        { name: 'dir/a.txt', data: a, deflate: false },
        { name: 'dir/b.bin', data: b, deflate: true },
      ]),
    );
    expect([...zip.keys()]).toEqual(['dir/a.txt', 'dir/b.bin']);
    expect(new TextDecoder().decode(zip.get('dir/a.txt')?.read())).toBe('hello avatar');
    expect(zip.get('dir/b.bin')?.read()).toEqual(b);
    expect(() => readZip(new Uint8Array(10))).toThrow(/end of central directory/);
  });
});
