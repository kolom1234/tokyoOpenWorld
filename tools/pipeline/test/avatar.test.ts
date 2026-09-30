// 아바타 굽기(M05 결정 2): 최소 ZIP 읽기(저장·deflate), 스킨 가중치 u8(합 255), 옷 영역(가중치 합)·경계, 쌍선형 표본(sRGB → 선형).
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readZip } from '../src/lib/zip.ts';
import { outfitAt, quantizeWeights, sampleLinear, srgbToLinear } from '../src/stages/avatar/bake.ts';

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

describe('avatar bake', () => {
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

  it('quantizes skin weights to u8 summing to exactly 255', () => {
    const q = quantizeWeights([0.3333, 0.3333, 0.3334, 0, 0.5, 0.25, 0.125, 0.125]);
    expect(q.slice(0, 4).reduce((s, x) => s + x, 0)).toBe(255);
    expect(q.slice(4).reduce((s, x) => s + x, 0)).toBe(255);
  });

  it('paints outfit regions by summed joint weights with a narrow edge', () => {
    const names = ['root', 'spine_02', 'lowerarm_l', 'thigh_l', 'foot_l', 'Head'];
    expect(outfitAt(names, [1, 0, 0, 0], [1, 0, 0, 0])).toEqual({ region: 'shirt', cover: 1 });
    expect(outfitAt(names, [3, 4, 0, 0], [0.3, 0.7, 0, 0])).toEqual({ region: 'shoes', cover: 1 });
    // 팔꿈치: 위팔(셔츠 없음 — 이 목록엔 아래팔만) → 피부.
    expect(outfitAt(names, [2, 5, 0, 0], [0.6, 0.4, 0, 0]).cover).toBe(0);
    const edge = outfitAt(names, [1, 2, 0, 0], [0.5, 0.5, 0, 0]);
    expect(edge.cover).toBeCloseTo(0.5, 9);
  });

  it('samples textures bilinearly in linear space', () => {
    const img = { width: 2, height: 1, channels: 3 as const, data: new Uint8Array([0, 0, 0, 255, 255, 255]) };
    const out = [0, 0, 0];
    sampleLinear(img, 0.5, 0.5, out);
    expect(out[0]).toBeCloseTo(0.5, 9);
    sampleLinear(img, 1, 0.5, out);
    expect(out[1]).toBeCloseTo(1, 9);
    expect(srgbToLinear(128)).toBeCloseTo(0.2158, 3);
  });
});
