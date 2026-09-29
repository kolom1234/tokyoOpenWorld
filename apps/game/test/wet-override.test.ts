// `?wet=` 디버그 젖음 덮어쓰기(M03-T06). 슬라이더 DOM은 e2e 없이 수동 확인.
import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/boot.ts';
import { overrideEnvironment } from '../src/debug/sun-override.ts';
import { parseWetFlag, withWeatherOverride } from '../src/debug/wet-override.ts';

describe('wet override', () => {
  it('parses 0..1 and rejects the rest', () => {
    expect(parseWetFlag('0.6')).toBe(0.6);
    expect(parseWetFlag('0')).toBe(0);
    expect(parseWetFlag('1.2')).toBeUndefined();
    expect(parseWetFlag('')).toBeUndefined();
    expect(parseWetFlag(null)).toBeUndefined();
    expect(parseFlags('?wet=0.4').wet).toBe(0.4);
    expect(parseFlags('?wet=x').wet).toBeUndefined();
  });

  it('replaces only weather.wetness', () => {
    const e = overrideEnvironment(180, 30, 5);
    expect(withWeatherOverride(e, undefined)).toBe(e);
    const w = withWeatherOverride(e, { wetness: 0.7 });
    expect(w.weather).toEqual({ ...e.weather, wetness: 0.7 });
    expect(e.weather.wetness).toBe(0);
  });
});
