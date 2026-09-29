import { describe, expect, it } from 'vitest';
import { createSunOverride, dirFromAzEl, overrideEnvironment, parseSunFlag } from '../src/debug/sun-override.ts';

describe('sun override', () => {
  it('parses az,el and rejects nonsense', () => {
    expect(parseSunFlag('70,3')).toEqual({ azDeg: 70, elDeg: 3 });
    expect(parseSunFlag('290,-4.5')).toEqual({ azDeg: 290, elDeg: -4.5 });
    expect(parseSunFlag('1,2,3')).toBeUndefined();
    expect(parseSunFlag('10,95')).toBeUndefined();
    expect(parseSunFlag(null)).toBeUndefined();
  });

  it('uses the WF convention (north = −Z, east = +X) and puts the moon opposite', () => {
    const n = dirFromAzEl(0, 0);
    expect(n.z).toBeCloseTo(-1);
    expect(dirFromAzEl(90, 0).x).toBeCloseTo(1);
    const e = overrideEnvironment(180, 30, 5);
    expect(e.sunDirWF.y).toBeCloseTo(0.5);
    expect(e.moonDirWF.y).toBeCloseTo(-0.5);
    expect(e.gameTimeMs).toBe(5);
  });

  it('pushes the environment every frame', () => {
    const seen: number[] = [];
    const sys = createSunOverride({ setEnvironment: (e) => seen.push(e.sunDirWF.y) }, { azDeg: 0, elDeg: 90 });
    sys.update({ gameTimeMs: 1 } as never);
    sys.update({ gameTimeMs: 2 } as never);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeCloseTo(1);
  });
});
