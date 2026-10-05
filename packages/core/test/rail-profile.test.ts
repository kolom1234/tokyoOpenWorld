// M07 주행 곡선: 정지 → 정지(가속 0.83·감속 0.97, 제한속도), 통과 끝 속도, 시간 ↔ 위치 역산 일관(단조·끝점·연속), 트립 구간(진입·시발·종착).
import { describe, expect, it } from 'vitest';
import { computeRunProfile, profileAt, RAIL_ACCEL, RAIL_DECEL, timeAtS, tripLegs } from '../src/index.ts';

describe('rail run profile', () => {
  const lim = new Float32Array(4001).fill(25); // 2 km, 0.5 m 표본

  it('accelerates, cruises at the limit and stops with the given rates', () => {
    const p = computeRunProfile(lim, 0.5, 0, 2000);
    const tAcc = 25 / RAIL_ACCEL;
    const tDec = 25 / RAIL_DECEL;
    const dAcc = 25 ** 2 / (2 * RAIL_ACCEL);
    const dDec = 25 ** 2 / (2 * RAIL_DECEL);
    const expected = tAcc + tDec + (2000 - dAcc - dDec) / 25;
    expect(p.duration).toBeCloseTo(expected, 0);
    expect(Math.max(...p.v)).toBeCloseTo(25, 3);
    expect(p.v[0]).toBe(0);
    expect(p.v[p.v.length - 1]).toBe(0);
  });

  it('enters and leaves at speed when the ends are pass-through', () => {
    const p = computeRunProfile(lim, 0.5, 100, 600, 25, 25);
    expect(p.duration).toBeCloseTo(500 / 25, 3);
  });

  it('inverts time to position monotonically and hits the ends', () => {
    const lim2 = Float32Array.from(lim, (v, k) => (k > 1500 && k < 2200 ? 12 : v));
    const p = computeRunProfile(lim2, 0.5, 0, 2000);
    let prev = -1;
    for (let t = 0; t <= p.duration; t += 0.25) {
      const { s, v } = profileAt(p, t);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-6);
      expect(v).toBeLessThanOrEqual(25 + 1e-3);
      prev = s;
    }
    expect(profileAt(p, 0).s).toBe(0);
    expect(profileAt(p, p.duration).s).toBeCloseTo(2000, 3);
    // 제한 12 m/s 구간(750–1100 m) 안에서는 12 이하.
    expect(profileAt(p, p.t[1800] as number).v).toBeLessThanOrEqual(12 + 1e-3);
  });

  it('maps position back to the same time (timeAtS ∘ profileAt = id)', () => {
    const lim2 = Float32Array.from(lim, (v, k) => (k > 1500 && k < 2200 ? 12 : v));
    const p = computeRunProfile(lim2, 0.5, 30, 1900);
    for (let t = 0.5; t < p.duration; t += 7.3) expect(timeAtS(p, profileAt(p, t).s)).toBeCloseTo(t, 2);
    expect(timeAtS(p, 1900)).toBeCloseTo(p.duration, 6);
  });
});

describe('trip legs', () => {
  const lim = new Float32Array(2001).fill(20); // 1 km

  it('enters at speed, stops at each stop and leaves at speed', () => {
    const legs = tripLegs(lim, 0.5, 50, 950, [300, 700]);
    expect(legs).toHaveLength(3);
    expect(legs[0]?.v[0]).toBe(20);
    expect(legs[0]?.v.at(-1)).toBe(0);
    expect(legs[1]?.v[0]).toBe(0);
    expect(legs[2]?.v.at(-1)).toBe(20);
  });

  it('treats a start or end on a stop as origin / terminus (zero-length leg)', () => {
    const legs = tripLegs(lim, 0.5, 300, 700, [300, 700]);
    expect(legs[0]?.duration).toBe(0);
    expect(legs[2]?.duration).toBe(0);
    expect(legs[1]?.v[0]).toBe(0);
    expect(legs[1]?.v.at(-1)).toBe(0);
    const pass = tripLegs(lim, 0.5, 0, 1000, []);
    expect(pass).toHaveLength(1);
    expect(pass[0]?.duration).toBeCloseTo(50, 3);
  });
});
