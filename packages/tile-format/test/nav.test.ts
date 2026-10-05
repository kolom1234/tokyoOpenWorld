import { describe, expect, it } from 'vitest';
import { NAV_NO_SIGNAL, parseNav, TkcErrorCode, writeNav } from '../src/index.ts';

const sample = {
  tiles: [
    { tx: -3, tz: 2, data: new Uint8Array([1, 2, 3, 4, 5]) },
    { tx: 4, tz: -1, data: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]) },
  ],
  crossings: [
    {
      id: 0xdeadbeef,
      a: [1, 2, 3] as [number, number, number],
      b: [4, 5, 6] as [number, number, number],
      halfWidth: 3,
      signal: 1234,
    },
    {
      id: 7,
      a: [-1, 0, -2] as [number, number, number],
      b: [-5, 0.5, 9] as [number, number, number],
      halfWidth: 2,
      signal: NAV_NO_SIGNAL,
    },
  ],
};

describe('nav.bin', () => {
  it('round-trips tiles (4-byte padded) and crossings', () => {
    const bytes = writeNav(sample);
    expect(bytes.byteLength % 4).toBe(0);
    const r = parseNav(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tiles.map((t) => [t.tx, t.tz, [...t.data]])).toEqual(
      sample.tiles.map((t) => [t.tx, t.tz, [...t.data]]),
    );
    expect(r.value.crossings).toEqual(sample.crossings);
  });
  it('rejects bad magic, truncation and non-finite crossings', () => {
    const bytes = writeNav(sample);
    const bad = bytes.slice();
    bad[0] = 0;
    expect(parseNav(bad)).toMatchObject({ ok: false, error: { code: TkcErrorCode.Corrupt } });
    expect(parseNav(bytes.slice(0, bytes.byteLength - 4))).toMatchObject({
      ok: false,
      error: { code: TkcErrorCode.Truncated },
    });
    expect(() => writeNav({ tiles: [], crossings: [{ ...sample.crossings[0], halfWidth: 0 } as never] })).toThrow();
  });
});
