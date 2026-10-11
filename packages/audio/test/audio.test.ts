// @sanpo/audio 순수 부분 + 가짜 AudioContext 베드 램프(M09-T04 — ADR-0079). 수락: 존 경계 이동 시 클릭/끊김 0 — 가중이 1 m당 0.1 이하·20 m 넘게 걸쳐 바뀌고
// 베드 이득은 setTargetAtTime으로만(계단 setValue 없음), 새 소스는 이득 0에서 시작.
import { createLogger, packCellKey } from '@sanpo/core';
import { JCOL_MATERIAL } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { AudioEnv } from '../src/api.ts';
import { createAudio } from '../src/index.ts';
import type { AssetStore } from '../src/internal/assets.ts';
import { createBedPlayer } from '../src/internal/beds.ts';
import { StepClock, stepSetOf, strideM } from '../src/internal/footsteps.ts';
import { BED_IDS, bedGains } from '../src/internal/mixer.ts';
import { SFX_TONES, sfxDuration } from '../src/internal/synth/sfx.ts';
import { notesBetween, patternOfCode, toneCycle } from '../src/internal/synth/signal-tones.ts';
import { jointTimes } from '../src/internal/synth/train.ts';
import { chooseVictim, MAX_VOICES } from '../src/internal/voices.ts';
import { ZONE_SAMPLES, ZoneIndex } from '../src/internal/zones.ts';

const ENV: AudioEnv = {
  gameTimeMs: Date.parse('2026-05-15T12:00:00+09:00'),
  night: 0,
  rainMmH: 0,
  windMs: 2,
  crowd: 0.7,
  umbrella: false,
};
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

describe('ZoneIndex', () => {
  const key = packCellKey(0, 0, 0);
  const z = new ZoneIndex();
  // 같은 종류 사각형 두 개가 x = 64에서 맞닿고, 그 옆(x ≥ 128)은 park.
  z.add(key, {
    zones: [
      { kind: 'crossing', polygonLocal: rect(0, 0, 64, 64), y0: -100, y1: 1000 },
      { kind: 'crossing', polygonLocal: rect(64, 0, 128, 64), y0: -100, y1: 1000 },
      { kind: 'park', polygonLocal: rect(128, 0, 256, 64), y0: -100, y1: 1000 },
    ],
    emitters: [{ kind: 'signalTone', pos: [10, 3, 10], code: 0x123 }],
  });
  it('does not dip at a shared edge of same-kind zones', () => {
    expect(z.weightsAt(64, 32).crossing).toBeCloseTo(1, 6);
  });
  it('crossfades smoothly across a kind border (≤ 0.1 per metre over ≥ 20 m)', () => {
    let prev = z.weightsAt(100, 32);
    let maxStep = 0;
    let span = 0;
    for (let x = 101; x <= 160; x++) {
      const w = z.weightsAt(x, 32);
      if (w.crossing > 0.01 && w.park > 0.01) span++;
      maxStep = Math.max(maxStep, Math.abs(w.crossing - prev.crossing), Math.abs(w.park - prev.park));
      expect(w.crossing + w.park + w.street).toBeCloseTo(1, 6);
      prev = w;
    }
    expect(maxStep).toBeLessThanOrEqual(0.1);
    expect(span).toBeGreaterThanOrEqual(20);
    expect(ZONE_SAMPLES).toBe(32);
    expect(z.weightsAt(100, 32).crossing).toBeCloseTo(1, 6);
    expect(z.weightsAt(160, 32).park).toBeCloseTo(1, 6);
  });
  it('falls back to street outside zones and finds emitters', () => {
    expect(z.weightsAt(128, 500).street).toBe(1);
    expect(z.emittersNear(12, 12, 10, 'signalTone')).toHaveLength(1);
    expect(z.emittersNear(100, 100, 10, 'signalTone')).toHaveLength(0);
  });
});

describe('bedGains', () => {
  const only = (k: string) => ({
    street: 0,
    crossing: 0,
    station: 0,
    shopping: 0,
    alley: 0,
    park: 0,
    elevated: 0,
    [k]: 1,
  });
  it('street by day uses the day bed, by night the night bed', () => {
    expect(bedGains(only('street'), ENV, 1.7)['street-day']).toBeGreaterThan(0.5);
    const n = bedGains(only('street'), { ...ENV, night: 1 }, 1.7);
    expect(n['street-day']).toBe(0);
    expect(n['street-night']).toBeGreaterThan(0.5);
  });
  it('rain beds follow mm/h; umbrella only when under one; station blocks rain', () => {
    const r = bedGains(only('street'), { ...ENV, rainMmH: 6, umbrella: true }, 1.7);
    expect(r['rain-street']).toBeGreaterThan(0.6);
    expect(r['rain-umbrella']).toBeGreaterThan(0.4);
    expect(bedGains(only('station'), { ...ENV, rainMmH: 6 }, 1.7)['rain-street']).toBeLessThan(0.2);
  });
  it('aloft: street beds fade, distant traffic + wind remain', () => {
    const a = bedGains(only('crossing'), ENV, 200);
    expect(a.crowd).toBe(0);
    expect(a['traffic-far']).toBeGreaterThan(0.3);
    expect(a.wind).toBeGreaterThan(0.2);
  });
  it('cicadas only in summer alleys', () => {
    const summer = bedGains(only('alley'), { ...ENV, gameTimeMs: Date.parse('2026-08-10T13:00:00+09:00') }, 1.7);
    expect(summer['residential-day']).toBeGreaterThan(0.5);
    expect(bedGains(only('alley'), ENV, 1.7)['residential-day']).toBe(0);
  });
  it('all gains in [0, 1] for every kind', () => {
    for (const k of ['street', 'crossing', 'station', 'shopping', 'alley', 'park', 'elevated']) {
      const g = bedGains(only(k), { ...ENV, rainMmH: 30, windMs: 30, night: 0.5 }, 0);
      for (const b of BED_IDS) {
        expect(g[b]).toBeGreaterThanOrEqual(0);
        expect(g[b]).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('footsteps', () => {
  it('maps JCOL materials to step sets', () => {
    expect(stepSetOf(JCOL_MATERIAL.asphalt)).toBe('step-asphalt');
    expect(stepSetOf(JCOL_MATERIAL.grass)).toBe('step-grass');
    expect(stepSetOf(JCOL_MATERIAL.concrete)).toBe('step-concrete');
  });
  it('walking 1.4 m/s ≈ 1.9 steps/s, never repeats the last two', () => {
    const c = new StepClock();
    let s = 1;
    const rand = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const idx: number[] = [];
    let n = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      const e = c.advance(1.4, true, 1 / 60, 10, rand);
      if (e) {
        n++;
        idx.push(e.index);
        expect(e.rate).toBeGreaterThanOrEqual(0.95);
        expect(e.rate).toBeLessThanOrEqual(1.05);
      }
    }
    expect(n / 10).toBeCloseTo(1.4 / strideM(1.4), 0);
    for (let i = 2; i < idx.length; i++) expect([idx[i - 1], idx[i - 2]]).not.toContain(idx[i]);
    expect(c.advance(1.4, false, 1, 10, rand)).toBeNull();
  });
});

describe('signal tones (self-designed)', () => {
  it('two patterns, notes inside the period, audible range', () => {
    for (const p of ['chirp', 'cuckoo'] as const) {
      const c = toneCycle(p);
      for (const n of c.notes) {
        expect(n.t + n.dur).toBeLessThan(c.periodS);
        expect(Math.min(n.f0, n.f1)).toBeGreaterThan(500);
        expect(Math.max(n.f0, n.f1)).toBeLessThan(4000);
      }
    }
    expect(patternOfCode(0x120)).not.toBe(patternOfCode(0x121));
  });
  it('notesBetween covers a window exactly once (no gaps/duplicates across calls)', () => {
    const a = notesBetween('chirp', 77, 10, 10.3);
    const b = notesBetween('chirp', 77, 10.3, 10.6);
    const all = notesBetween('chirp', 77, 10, 10.6);
    expect(a.length + b.length).toBe(all.length);
  });
});

describe('voices / trains / sfx', () => {
  it('steals the lowest priority only if the newcomer is louder', () => {
    const v = Array.from({ length: MAX_VOICES }, (_, i) => ({ id: i, priority: 1 + i }));
    expect(chooseVictim(v, 5)).toBe(0);
    expect(chooseVictim(v, 0.5)).toBeNull();
  });
  it('rail joints: 4 clicks per 25 m (two bogies × two axles)', () => {
    const t = jointTimes(0, 25, 0, 4);
    expect(t.length).toBeGreaterThanOrEqual(15);
    expect(t.length).toBeLessThanOrEqual(17);
    expect(jointTimes(0, 0.2, 0, 4)).toHaveLength(0);
  });
  it('synth sfx are short and defined', () => {
    for (const id of Object.keys(SFX_TONES) as (keyof typeof SFX_TONES)[]) {
      expect(sfxDuration(id)).toBeGreaterThan(0.05);
      expect(sfxDuration(id)).toBeLessThan(2);
    }
  });
});

/** 가짜 AudioContext(베드 램프 검사용 최소 구현). */
function fakeCtx() {
  const calls: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setTargetAtTime: (v: number) => calls.push(`${name}.target ${v.toFixed(3)}`),
    setValueAtTime: () => calls.push(`${name}.set`),
    linearRampToValueAtTime: () => calls.push(`${name}.ramp`),
  });
  const node = () => ({ connect: (n: unknown) => n, disconnect: () => {} });
  const ctx = {
    currentTime: 0,
    createGain: () => ({ ...node(), gain: param('gain') }),
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      start: () => calls.push('start'),
      stop: () => calls.push('stop'),
    }),
  };
  return { ctx: ctx as unknown as AudioContext, calls, advance: (s: number) => (ctx.currentTime += s) };
}

describe('bed player (click-free)', () => {
  it('new beds start at gain 0 and only ramp with setTargetAtTime', () => {
    const f = fakeCtx();
    const buf = { duration: 45 } as AudioBuffer;
    const assets: AssetStore = {
      manifest: null,
      entry: () => undefined,
      buffer: () => buf,
      loaded: () => 1,
      files: () => 1,
    };
    const bp = createBedPlayer(f.ctx, {} as AudioNode, {} as AudioNode, assets);
    const g = bedGains({ street: 1, crossing: 0, station: 0, shopping: 0, alley: 0, park: 0, elevated: 0 }, ENV, 1.7);
    for (let i = 0; i < 50; i++) {
      bp.update(g, () => 0.5);
      f.advance(0.1);
    }
    expect(f.calls.filter((c) => c.endsWith('.set') || c.endsWith('.ramp'))).toHaveLength(0);
    expect(f.calls.filter((c) => c === 'start').length).toBe(bp.audible().length);
    expect(bp.audible()).toContain('street-day');
  });
});

describe('createAudio without WebAudio', () => {
  it('is unavailable and every call is a silent no-op', async () => {
    const a = createAudio({ log: createLogger() });
    const real = globalThis.AudioContext;
    expect(['unavailable', 'locked']).toContain(a.state);
    await a.unlock();
    a.playAt('gateOpen', { x: 0, y: 0, z: 0 });
    a.setMix({ master: 2 });
    expect(a.mix.master).toBe(1.5);
    expect(a.stats().beds).toEqual([]);
    expect(real).toBe(globalThis.AudioContext);
  });
});
