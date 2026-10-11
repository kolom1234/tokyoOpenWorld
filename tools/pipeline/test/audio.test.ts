// 오디오 단계 순수 함수(M09-T04 — ADR-0079): 원천 목록 검사, 지속 음조 검출, 루프 이음매, 발소리 조각.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monoOf, onsetsOf, spectrogramDb, tonalTrack } from '../src/stages/audio/analyze.ts';
import type { Pcm } from '../src/stages/audio/ffmpeg.ts';
import { type AudioLibrary, checkAudioLibrary } from '../src/stages/audio/library.ts';
import { LOOP_XFADE_S, makeLoop, normalizeRms, pickLoopWindow } from '../src/stages/audio/loop.ts';
import { sliceSteps } from '../src/stages/audio/steps.ts';

const RATE = 48_000;
/** 결정론 잡음(xorshift). */
function noise(n: number, amp: number, seed = 1): Float32Array {
  let s = seed >>> 0 || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = ((s >>> 0) / 0xffffffff - 0.5) * 2 * amp;
  }
  return out;
}
const mono = (data: Float32Array): Pcm => ({ rate: RATE, channels: 1, data });

describe('content/audio/library.json', () => {
  const lib = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../../content/audio/library.json'), 'utf8'),
  ) as AudioLibrary;
  it('passes the license/reference check (CC0·CC BY only)', () => {
    expect(() => checkAudioLibrary(lib)).not.toThrow();
    expect(lib.sources.every((s) => ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'].includes(s.license))).toBe(true);
  });
  it('every source has an ATTRIBUTION entry', () => {
    const attr = JSON.parse(readFileSync(join(import.meta.dirname, '../../../content/ATTRIBUTION.json'), 'utf8')) as {
      entries: { id: string; kind: string; url?: string; license: string }[];
    };
    for (const s of lib.sources) {
      const e = attr.entries.find((x) => x.id === s.id);
      expect(e, s.id).toBeDefined();
      expect(e?.kind).toBe('sound');
      expect(e?.license).toBe(s.license);
      expect(e?.url).toBe(s.url);
    }
  });
  it('rejects BY-SA / NC / unknown licenses', () => {
    const bad = structuredClone(lib);
    (bad.sources[0] as { license: string }).license = 'CC-BY-SA-4.0';
    expect(() => checkAudioLibrary(bad)).toThrow(/not allowed/);
    (bad.sources[0] as { license: string }).license = 'CC-BY-NC-4.0';
    expect(() => checkAudioLibrary(bad)).toThrow(/not allowed/);
  });
});

describe('tonalTrack', () => {
  it('flags a sustained 2 kHz beep, not broadband noise', () => {
    const n = RATE * 2;
    const nz = noise(n, 0.1);
    const beep = new Float32Array(n);
    for (let i = 0; i < n; i++) beep[i] = (nz[i] as number) + 0.2 * Math.sin((2 * Math.PI * 2000 * i) / RATE);
    const mean = (a: Float32Array) => a.reduce((x, y) => x + y, 0) / a.length;
    const tn = mean(tonalTrack(spectrogramDb(nz), RATE));
    const tb = mean(tonalTrack(spectrogramDb(beep), RATE));
    expect(tn).toBeLessThan(0.05);
    expect(tb).toBeGreaterThan(0.5);
  });
});

describe('loop', () => {
  it('picks the window without the beep and loops without a seam jump', () => {
    const n = RATE * 30;
    const data = noise(n, 0.1, 7);
    // 0–12 s에 신호음 같은 지속음 → 뒤쪽 구간을 골라야 한다.
    for (let i = 0; i < RATE * 12; i++) data[i] = (data[i] as number) + 0.3 * Math.sin((2 * Math.PI * 1500 * i) / RATE);
    const pcm = mono(data);
    const pick = pickLoopWindow(pcm, 10);
    expect(pick.startS).toBeGreaterThanOrEqual(12);
    const loop = makeLoop(pcm, pick.startS, 10);
    expect(loop.data.length).toBe(RATE * 10);
    // 이음매: 끝 표본 → 첫 표본 = 원래 연속 표본(끝 다음 = 원본 startS+10 s, 교차 시작은 꼬리 가중 1).
    const s0 = Math.round(pick.startS * RATE);
    expect(loop.data[0]).toBeCloseTo(data[s0 + RATE * 10] as number, 6);
    expect(loop.data[RATE * 10 - 1]).toBeCloseTo(data[s0 + RATE * 10 - 1] as number, 6);
    expect(LOOP_XFADE_S).toBeGreaterThan(0.5);
  });
  it('normalizes RMS with a −1 dBFS peak limit', () => {
    const pcm = mono(noise(RATE, 0.01, 3));
    normalizeRms(pcm, -24);
    let s = 0;
    let peak = 0;
    for (const v of pcm.data) {
      s += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    expect(20 * Math.log10(Math.sqrt(s / pcm.data.length))).toBeCloseTo(-24, 1);
    expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
  });
});

describe('steps', () => {
  /** 0.6 s 간격 감쇠 잡음 펄스(발소리 흉내). */
  function walk(count: number): Pcm {
    const data = noise(RATE * (count * 0.6 + 1), 0.002, 11);
    const burst = noise(RATE * 0.2, 0.5, 5);
    for (let k = 0; k < count; k++) {
      const at = Math.round(RATE * (0.5 + k * 0.6));
      for (let j = 0; j < burst.length; j++) data[at + j] = (burst[j] as number) * Math.exp(-j / (RATE * 0.04));
    }
    return mono(data);
  }
  it('finds onsets ~0.6 s apart', () => {
    const on = onsetsOf(monoOf(walk(6).data, 1), RATE);
    expect(on.length).toBe(6);
    expect(((on[1] as number) - (on[0] as number)) / RATE).toBeCloseTo(0.6, 1);
  });
  it('slices up to maxSteps into one sheet with offsets', () => {
    const sheet = sliceSteps(walk(12), 8);
    expect(sheet.steps).toHaveLength(8);
    for (const [t, d] of sheet.steps) {
      expect(d).toBeGreaterThan(0.12);
      expect(d).toBeLessThanOrEqual(0.42);
      expect(t * RATE + d * RATE).toBeLessThanOrEqual(sheet.pcm.data.length);
    }
  });
});
