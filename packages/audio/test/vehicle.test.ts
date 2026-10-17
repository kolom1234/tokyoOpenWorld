// M08-T04(ADR-0090): 탈것 소리 목표 매핑 + 엔진 워클릿 합성기(같은 코드를 Node에서) — 점화 주파수 추종·변속 RPM 낙하·유한·가벼움(언더런 여유).
import { describe, expect, it } from 'vitest';
import type { VehicleAudioState } from '../src/api.ts';
import { EngineSynth } from '../src/internal/synth/engine-worklet.js';
import { vehicleTargets } from '../src/internal/synth/vehicle.ts';

const CAR: VehicleAudioState = {
  kind: 'car',
  rpm: 3000,
  throttle: 1,
  speedMs: 15,
  shifting: false,
  slip: 0,
  wetness: 0,
  surface: 1,
  interior: false,
};
const SR = 48_000;

/** 주기(자기상관 — 최대의 80 % 넘는 첫 봉우리) → Hz. */
function pitchHz(sig: Float32Array): number {
  const cs: number[] = [];
  let best = 0;
  const lo = Math.floor(SR / 400);
  for (let l = lo; l < SR / 15; l++) {
    let c = 0;
    for (let i = 0; i < 6000; i++) c += (sig[i] ?? 0) * (sig[i + l] ?? 0);
    cs.push(c);
    best = Math.max(best, c);
  }
  for (let k = 1; k < cs.length - 1; k++) {
    const c = cs[k] ?? 0;
    if (c >= 0.8 * best && c >= (cs[k - 1] ?? 0) && c >= (cs[k + 1] ?? 0)) return SR / (k + lo);
  }
  return 0;
}

function renderS(s: EngineSynth, seconds: number, rpm: number, load: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  const blk = new Float32Array(128);
  for (let o = 0; o + 128 <= out.length; o += 128) {
    s.render(blk, 128, rpm, load, 1);
    out.set(blk, o);
  }
  return out;
}

describe('vehicle targets', () => {
  it('null = silent; car engine louder with load; shifting drops load', () => {
    expect(vehicleTargets(null).engine).toBe(0);
    expect(vehicleTargets(CAR).engine).toBeGreaterThan(vehicleTargets({ ...CAR, throttle: 0 }).engine);
    expect(vehicleTargets({ ...CAR, shifting: true }).load).toBeLessThan(0.1);
  });
  it('wet road adds hiss and softens squeal; interior cuts wind and highs', () => {
    expect(vehicleTargets(CAR).wet).toBe(0);
    expect(vehicleTargets({ ...CAR, wetness: 1 }).wet).toBeGreaterThan(0.1);
    const dry = vehicleTargets({ ...CAR, slip: 0.6 }).squeal;
    expect(dry).toBeGreaterThan(0.1);
    expect(vehicleTargets({ ...CAR, slip: 0.6, wetness: 1 }).squeal).toBeLessThan(dry / 2);
    expect(vehicleTargets({ ...CAR, interior: true }).wind).toBeLessThan(vehicleTargets(CAR).wind);
    expect(vehicleTargets({ ...CAR, interior: true }).cabinHz).toBeLessThan(2000);
  });
  it('tyre roll grows with speed; bicycle = chain when pedalling, freewheel ticks when coasting, no engine', () => {
    expect(vehicleTargets({ ...CAR, speedMs: 25 }).roll).toBeGreaterThan(vehicleTargets({ ...CAR, speedMs: 5 }).roll);
    const bike: VehicleAudioState = { ...CAR, kind: 'bicycle', rpm: 0, speedMs: 5 };
    expect(vehicleTargets(bike).engine).toBe(0);
    expect(vehicleTargets(bike).chain).toBeGreaterThan(0);
    expect(vehicleTargets(bike).ticks).toBe(0);
    const coast = vehicleTargets({ ...bike, throttle: 0 });
    expect(coast.chain).toBe(0);
    expect(coast.ticks).toBeGreaterThan(0);
    // 5 m/s → 바퀴 2.41 rev/s × 18 = 43 Hz 딸깍.
    expect(coast.tickHz).toBeCloseTo(43.4, 0);
  });
});

describe('engine worklet synth (M08-T04)', () => {
  it('pitch = firing frequency rpm/30 (inline-4), bounded, louder with load', () => {
    for (const rpm of [900, 2400, 4200, 6000]) {
      const s = new EngineSynth(SR);
      renderS(s, 0.2, rpm, 1);
      const sig = renderS(s, 0.4, rpm, 1);
      expect(Math.abs(pitchHz(sig) - rpm / 30) / (rpm / 30)).toBeLessThan(0.03);
      let pk = 0;
      for (const x of sig) pk = Math.max(pk, Math.abs(x));
      expect(pk).toBeLessThanOrEqual(1);
      expect(pk).toBeGreaterThan(0.2);
    }
    const rms = (a: Float32Array) => Math.sqrt(a.reduce((m, x) => m + x * x, 0) / a.length);
    expect(rms(renderS(new EngineSynth(SR), 0.5, 3000, 1))).toBeGreaterThan(
      rms(renderS(new EngineSynth(SR), 0.5, 3000, 0)) * 1.4,
    );
  });
  it('a shift (5600 → 3700 rpm) is heard as a pitch drop without non-finite samples', () => {
    const s = new EngineSynth(SR);
    renderS(s, 0.3, 5600, 1);
    const before = pitchHz(renderS(s, 0.3, 5600, 1));
    renderS(s, 0.1, 3700, 0.05);
    const after = pitchHz(renderS(s, 0.3, 3700, 1));
    expect(before / after).toBeCloseTo(5600 / 3700, 1);
    expect(renderS(s, 0.2, 3700, 0).every(Number.isFinite)).toBe(true);
  });
  it('render cost leaves the audio thread > 20× headroom (128-frame block)', () => {
    const s = new EngineSynth(SR);
    const blk = new Float32Array(128);
    const blocks = (SR * 10) / 128;
    const t0 = performance.now();
    for (let i = 0; i < blocks; i++) s.render(blk, 128, 2000 + (i % 400) * 10, 0.7, 0.8);
    const ms = performance.now() - t0;
    process.stdout.write(
      `[engine-worklet] 10 s audio in ${ms.toFixed(1)} ms (${((ms / 10_000) * 100).toFixed(2)} % of real time)\n`,
    );
    expect(ms).toBeLessThan(10_000 / 20);
  });
});
