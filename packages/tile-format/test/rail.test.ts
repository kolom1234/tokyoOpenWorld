// global/rail.bin v1(M07-T01, ADR-0070): 메타 JSON + 표본 배열 왕복, 참조 무결성 거부(선로 범위·정차 s·노선/역·잘림·매직).
import { describe, expect, it } from 'vitest';
import { RAIL_FLAG, type RailNetwork, TkcErrorCode } from '../src/api.ts';
import { parseRail, writeRail } from '../src/index.ts';

function net(): RailNetwork {
  const n = 5;
  const points = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) points.set([0, 10, -i * 0.5], i * 3);
  return {
    lines: [
      {
        id: 'yamanote',
        name: { ja: '山手線', en: 'Yamanote Line' },
        color: '#9acd32',
        kind: 'jr',
        rideable: true,
        maxSpeedKmh: 90,
        gaugeM: 1.067,
        formation: { cars: 11, carLengthM: 20 },
      },
    ],
    tracks: [
      {
        id: 'yamanote-outer',
        line: 'yamanote',
        heading: 'outer',
        ptOffset: 0,
        ptCount: n,
        lengthM: 2,
        stepM: 0.5,
        stops: [{ station: 'shibuya', s: 1, side: 'L', platformLengthM: 220 }],
      },
    ],
    stations: [{ id: 'shibuya', name: { ja: '渋谷', en: 'Shibuya' }, posWF: [0, 10, -1], mvpEdge: true }],
    points,
    speed: new Float32Array(n).fill(25),
    flags: Uint8Array.from([0, RAIL_FLAG.bridge, RAIL_FLAG.bridge, 0, RAIL_FLAG.tunnel]),
  };
}

describe('rail.bin', () => {
  it('round-trips meta and sample arrays', () => {
    const a = net();
    const r = parseRail(writeRail(a));
    expect(r.ok && r.value).toEqual(a);
  });

  it('rejects bad references on write and corrupt/truncated input on read', () => {
    expect(() =>
      writeRail({ ...net(), tracks: [{ ...(net().tracks[0] as RailNetwork['tracks'][number]), ptCount: 9 }] }),
    ).toThrow(/points exceed/);
    expect(() =>
      writeRail({
        ...net(),
        tracks: [
          {
            ...(net().tracks[0] as RailNetwork['tracks'][number]),
            stops: [{ station: 'x', s: 1, side: 'L', platformLengthM: 1 }],
          },
        ],
      }),
    ).toThrow(/unknown station/);
    const bytes = writeRail(net());
    const cut = parseRail(bytes.subarray(0, bytes.length - 3));
    expect(!cut.ok && cut.error.code).toBe(TkcErrorCode.Truncated);
    const bad = bytes.slice();
    bad[0] = 0;
    const m = parseRail(bad);
    expect(!m.ok && m.error.code).toBe(TkcErrorCode.Magic);
  });
});
