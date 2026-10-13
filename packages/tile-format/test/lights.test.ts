// M09-T03 lights.bin: 왕복·잘림·비유한 거부.
import { describe, expect, it } from 'vitest';
import {
  LIGHT_KIND,
  LIGHT_RECORD_BYTES,
  LIGHT_SCHEDULE,
  type LightRecord,
  parseLights,
  writeLights,
} from '../src/index.ts';

const L: LightRecord[] = [
  {
    kind: LIGHT_KIND.streetLamp,
    schedule: LIGHT_SCHEDULE.night,
    kelvin: 4000,
    posLocal: [1.5, 6.75, 200.25],
    dirOct: [0, -127],
    lumen: 3000,
    range: 18,
  },
  {
    kind: LIGHT_KIND.shopFront,
    schedule: LIGHT_SCHEDULE.shop,
    kelvin: 3200,
    posLocal: [-3, 3.125, 7],
    dirOct: [90, -20],
    lumen: 900,
    range: 9,
  },
];

describe('lights.bin', () => {
  it('round-trips records', () => {
    const b = writeLights(L);
    expect(b.byteLength).toBe(4 + L.length * LIGHT_RECORD_BYTES);
    const r = parseLights(b);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(L);
  });
  it('rejects truncation and bad ranges', () => {
    const b = writeLights(L);
    expect(parseLights(b.subarray(0, b.byteLength - 1)).ok).toBe(false);
    expect(() => writeLights([{ ...(L[0] as LightRecord), range: 0 }])).toThrow();
    expect(parseLights(writeLights([])).ok).toBe(true);
  });
});
