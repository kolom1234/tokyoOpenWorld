// 월드 시계·천문(M03-T03): 시부야 하지 남중 고도·방위(수락 기준), 수렴각 보정, 시계 모드, 운행일 요일, 환경 캐시.
import { gridConvergenceDeg, wfToLonLat } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import { createSim } from '../src/index.ts';
import { clearSkyIlluminanceLux, dirWFFromGrid, sunPosition } from '../src/internal/clock/astronomy.ts';
import { createWorldClock, dayTypeOf } from '../src/internal/clock/world-clock.ts';
import { computeEnvironment } from '../src/internal/service.ts';

const SCRAMBLE = wfToLonLat({ x: -22.3, y: 0, z: 8.6 });
const JST = (iso: string): number => Date.parse(`${iso}+09:00`);

describe('astronomy (acceptance: Shibuya, 2026-06-21)', () => {
  it('culminates at ≈ 11:43 JST, altitude 77.78° ± 0.1°, azimuth 180°', () => {
    const day = JST('2026-06-21T00:00:00');
    let best = { el: -90, min: 0 };
    for (let m = 11 * 60; m <= 12 * 60 + 30; m += 0.25) {
      const el = sunPosition(day + m * 60_000, SCRAMBLE).elDeg;
      if (el > best.el) best = { el, min: m };
    }
    expect(Math.abs(best.min - (11 * 60 + 43))).toBeLessThanOrEqual(1);
    expect(best.el).toBeGreaterThan(77.68);
    expect(best.el).toBeLessThan(77.88);
    expect(sunPosition(day + best.min * 60_000, SCRAMBLE).azTrueDeg).toBeCloseTo(180, 0);
  });

  it('is ≈ 77.2° at 12:00 JST', () => {
    expect(sunPosition(JST('2026-06-21T12:00:00'), SCRAMBLE).elDeg).toBeCloseTo(77.2, 1);
  });

  it('converts true to grid azimuth with the meridian convergence', () => {
    const s = sunPosition(JST('2026-06-21T09:00:00'), SCRAMBLE);
    expect(s.azGridDeg).toBeCloseTo(s.azTrueDeg - gridConvergenceDeg(SCRAMBLE), 9);
    const d = s.dirWF;
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
    expect(dirWFFromGrid(90, 0).x).toBeCloseTo(1);
    expect(dirWFFromGrid(0, 0).z).toBeCloseTo(-1);
  });

  it('gives no illuminance below the horizon and ≈ 100 klx at high noon', () => {
    expect(clearSkyIlluminanceLux(-3)).toBe(0);
    expect(clearSkyIlluminanceLux(77)).toBeGreaterThan(90_000);
    expect(clearSkyIlluminanceLux(77)).toBeLessThan(110_000);
  });
});

describe('world clock', () => {
  it('runs realtime, custom (dtReal × scale) and frozen', () => {
    let real = 1000;
    const c = createWorldClock(() => real);
    c.tick(0.016);
    expect(c.gameTimeMs).toBe(1000);
    real = 5000;
    c.tick(0.016);
    expect(c.gameTimeMs).toBe(5000);
    c.setMode({ kind: 'custom', startMs: 0, scale: 60 });
    c.tick(1);
    expect(c.gameTimeMs).toBe(60_000);
    c.setMode({ kind: 'frozen', atMs: 42 });
    c.tick(10);
    expect(c.gameTimeMs).toBe(42);
    expect(c.timeScale).toBe(0);
    c.jumpTo(99);
    expect(c.gameTimeMs).toBe(99);
    expect(c.mode).toBe('frozen');
  });

  it('uses the 04:00 JST service-day boundary for the day type', () => {
    expect(dayTypeOf(JST('2026-06-21T12:00:00'))).toBe('holiday'); // 일요일
    expect(dayTypeOf(JST('2026-06-22T03:59:00'))).toBe('holiday'); // 월요일 새벽 = 일요일 운행일
    expect(dayTypeOf(JST('2026-06-22T04:00:00'))).toBe('weekday');
    expect(dayTypeOf(JST('2026-06-20T12:00:00'))).toBe('saturday');
  });
});

describe('sim service', () => {
  it('computes the environment at the camera and caches it per time', () => {
    const sim = createSim({
      bus: {} as never,
      log: {} as never,
      initialClock: { kind: 'frozen', atMs: JST('2026-06-21T12:00:00') },
    });
    const [clock] = sim.systems();
    clock?.update({ dtReal: 0.016, camera: { posWF: { x: 0, y: 0, z: 0 } } } as never);
    const a = sim.environment();
    expect(sim.environment()).toBe(a);
    expect(a.sunDirWF.y).toBeGreaterThan(0.97);
    expect(a.season.dayOfYear).toBe(172);
    sim.clock.jumpTo(JST('2026-06-21T23:00:00'));
    expect(sim.environment().sunDirWF.y).toBeLessThan(0);
    expect(computeEnvironment(JST('2026-06-21T23:00:00'), { x: 0, y: 0, z: 0 }).sunIlluminanceLux).toBe(0);
  });
});
