// 역 배치·동선(M07-T06, ADR-0081): access.json → 개찰구 상자·플랩·물리·통로, 통로 통과 판정(들어감/나감/옆 통과 아님), 플랩 곡선, 계단 닿음, 오디오 보조(열차 최근접점).

import { cellOf } from '@sanpo/geo';
import { describe, expect, it } from 'vitest';
import ACCESS from '../../../content/stations/access.json';
import { SPAWN_PRESETS, spawnPreset, withSpawn } from '../src/spawn-presets.ts';
import { arrowTo, guideText } from '../src/station/guide.ts';
import { type AccessFile, crossedAisle, forwardOf, rad, stationLayout } from '../src/station/layout.ts';
import { passageAt, STAIRS_REACH_M } from '../src/station/stairs.ts';
import { flapOpen } from '../src/station/wiring.ts';
import { crowdOfHour, nearestOnTrain, nightOfSun } from '../src/world-audio.ts';
import type { LoadedWorld } from '../src/world-load.ts';

const access = ACCESS as unknown as AccessFile;

describe('station layout', () => {
  const l = stationLayout(access);
  it('n aisles → n+1 cabinets (+ tops), 2 flaps per aisle, physics = cabinets + 2 fences (per exit)', () => {
    const exits = access.stations.flatMap((s) => s.exits);
    const n = exits.reduce((k, e) => k + e.gate.aisles, 0);
    expect(exits.length).toBeGreaterThanOrEqual(4);
    expect(l.aisles).toHaveLength(n);
    expect(l.flaps.length / 8).toBe(2 * n);
    expect(l.physics.length / 8).toBe(n + exits.length * 3);
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

describe('station guide · signs · spawn presets (ADR-0082·0084)', () => {
  it('arrow is relative to the view yaw (0 = −Z, counter-clockwise +)', () => {
    const o = { x: 0, y: 0, z: 0 };
    expect(arrowTo(o, [0, 0, -10], 0)).toBe('↑');
    expect(arrowTo(o, [-10, 0, 0], 0)).toBe('←');
    expect(arrowTo(o, [10, 0, 0], 0)).toBe('→');
    expect(arrowTo(o, [0, 0, 10], 0)).toBe('↓');
    // 서쪽(yaw 90°)을 보면 북쪽 목표는 오른쪽.
    expect(arrowTo(o, [0, 0, -10], Math.PI / 2)).toBe('→');
  });
  it('street → gate hint, past the gate → stairs hint, platform → exit hint, far → none', () => {
    const e = access.stations[0]?.exits[0];
    if (!e) throw new Error('exit');
    const g = e.gate.posWF;
    const f = forwardOf(rad(e.gate.yawDeg));
    const before = { x: g[0] - f.x * 20, y: g[1], z: g[2] - f.z * 20 };
    expect(guideText(access, before, 0, false)).toMatch(/^개찰구 . 20 m/);
    const after = { x: g[0] + f.x * 3, y: g[1], z: g[2] + f.z * 3 };
    expect(guideText(access, after, 0, false)).toMatch(/^계단 /);
    const pf = e.platform.posWF;
    expect(guideText(access, { x: pf[0] + 5, y: pf[1], z: pf[2] }, 0, true)).toMatch(/^출구 계단 . 5 m/);
    expect(guideText(access, { x: g[0] + 500, y: g[1], z: g[2] }, 0, false)).toBeNull();
  });
  it('every exit gets a gate sign, a station totem and two stairs boards; text has no empty field', () => {
    const l = stationLayout(access);
    const exits = access.stations.flatMap((s) => s.exits).length;
    expect(l.signs).toHaveLength(exits * 4);
    for (const s of l.signs) expect(s.title.length * s.sub.length).toBeGreaterThan(0);
  });
  it('spawn presets: unique URL-safe ids incl. the documented ones; withSpawn moves spawn + cells', () => {
    const ids = SPAWN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'harajuku-gate',
      'harajuku-platform',
      'shibuya-scramble',
      'shinjuku-west',
      'omotesando',
      'yoyogi-park',
    ])
      expect(ids).toContain(id);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,64}$/);
    const p = spawnPreset('harajuku-gate');
    if (!p) throw new Error('preset');
    const index = new Map([[cellOf(0, p.posWF[0], p.posWF[2]), { offset: 0, size: 1, hash32: 0 }]]);
    const w = withSpawn(
      { spawnWF: { x: 0, y: 0, z: 0 }, spawnYawRad: 0, spawnCells: [], cellsIndex: index } as unknown as LoadedWorld,
      p,
    );
    expect(w.spawnWF.x).toBe(p.posWF[0]);
    expect(w.spawnYawRad).toBeCloseTo(Math.PI / 2, 6);
    expect(w.spawnCells).toEqual([...index.keys()]);
  });
});
