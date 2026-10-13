// 역 배치·동선(M07-T06, ADR-0081): access.json → 개찰구 상자·플랩·물리·통로, 통로 통과 판정(들어감/나감/옆 통과 아님), 플랩 곡선, 계단 닿음, 오디오 보조(열차 최근접점).
import { describe, expect, it } from 'vitest';
import ACCESS from '../../../content/stations/access.json';
import { type AccessFile, crossedAisle, forwardOf, rad, stationLayout } from '../src/station/layout.ts';
import { flapOpen, passageAt, STAIRS_REACH_M } from '../src/station/wiring.ts';
import { crowdOfHour, nearestOnTrain, nightOfSun } from '../src/world-audio.ts';

const access = ACCESS as unknown as AccessFile;

describe('station layout', () => {
  const l = stationLayout(access);
  const exit = access.stations[0]?.exits[0];
  it('n aisles → n+1 cabinets (+ tops), 2 flaps per aisle, physics = cabinets + 2 fences', () => {
    const n = exit?.gate.aisles ?? 0;
    expect(l.aisles).toHaveLength(n);
    expect(l.flaps.length / 8).toBe(2 * n);
    expect(l.physics.length / 8).toBe(n + 1 + 2);
    expect(l.boxes.length % 8).toBe(0);
  });
  it('aisle clear width fits the 0.5 m character capsule with margin', () => {
    const a = l.aisles[0];
    const b = l.aisles[1];
    if (!a || !b) throw new Error('aisles');
    const pitch = Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z);
    const cabW = 2 * (l.physics[3] as number);
    expect(pitch - cabW).toBeGreaterThanOrEqual(0.7);
  });
  it('crossing an aisle along the gate direction = +1 (in), back = −1, beside the aisle = 0', () => {
    const a = l.aisles[1];
    if (!a) throw new Error('aisle');
    const f = a.forward;
    const p0 = { x: a.center.x - f.x, y: a.center.y, z: a.center.z - f.z };
    const p1 = { x: a.center.x + f.x, y: a.center.y, z: a.center.z + f.z };
    expect(crossedAisle(a, p0, p1)).toBe(1);
    expect(crossedAisle(a, p1, p0)).toBe(-1);
    const side = { x: -f.z * 5, y: 0, z: f.x * 5 };
    expect(
      crossedAisle(a, { x: p0.x + side.x, y: p0.y, z: p0.z + side.z }, { x: p1.x + side.x, y: p1.y, z: p1.z + side.z }),
    ).toBe(0);
    expect(crossedAisle(a, p0, { ...p0, x: p0.x + 0.01 * f.x })).toBe(0);
  });
  it('gate direction 90° = walking west (−X)', () => {
    const f = forwardOf(rad(90));
    expect(f.x).toBeCloseTo(-1, 6);
    expect(f.z).toBeCloseTo(0, 6);
  });
});

describe('station wiring helpers', () => {
  it('flap opens fast, holds, then closes', () => {
    expect(flapOpen(-1)).toBe(0);
    expect(flapOpen(0.125)).toBeCloseTo(0.5, 5);
    expect(flapOpen(0.8)).toBe(1);
    expect(flapOpen(3)).toBe(0);
  });
  it('stairs reach: street-side marker → down, platform marker → up, elsewhere none', () => {
    const e = access.stations[0]?.exits[0];
    if (!e) throw new Error('exit');
    const at = (p: number[]) => ({ x: p[0] as number, y: p[1] as number, z: p[2] as number });
    expect(passageAt(access, at(e.stairs.posWF))?.dir).toBe('down');
    expect(passageAt(access, at(e.platform.posWF))?.dir).toBe('up');
    const far = at(e.stairs.posWF);
    far.x += STAIRS_REACH_M + 0.5;
    expect(passageAt(access, far)).toBeNull();
  });
  it('audio helpers: night curve, crowd curve, nearest point on a train', () => {
    expect(nightOfSun(0.5)).toBe(0);
    expect(nightOfSun(-0.5)).toBe(1);
    expect(crowdOfHour(12)).toBe(1);
    expect(crowdOfHour(4)).toBeCloseTo(0.12, 5);
    // 북쪽(−Z)으로 달리는 10량 × 20 m: 머리 (0,0,0), 꼬리 (0,0,200). 리스너 (5,0,50) → (0,0,50).
    const t = {
      tripId: 't',
      lineId: 'l',
      cars: 10,
      carLengthM: 20,
      headPosWF: { x: 0, y: 0, z: 0 },
      headingRad: 0,
      speedMs: 10,
      stoppedAtStationId: null,
      doorsOpen: false,
      nextStationId: null,
      seats: [],
    };
    const q = nearestOnTrain(t, { x: 5, y: 0, z: 50 });
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.z).toBeCloseTo(50, 6);
    expect(nearestOnTrain(t, { x: 0, y: 0, z: 400 }).z).toBeCloseTo(200, 6);
  });
});
