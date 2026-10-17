// M08-T04: 탈것 소리 입력 — 바퀴 미끄럼 정규화, drive·cycle 밖이면 null.
import type { PhysicsService, VehicleState } from '@sanpo/physics';
import type { TraversalService } from '@sanpo/traversal';
import { describe, expect, it } from 'vitest';
import { vehicleAudioOf, wheelSlip } from '../src/vehicles/vehicle-audio.ts';

const wheel = (slipLong: number, slipLatDeg: number) => ({
  rotationRad: 0,
  steerRad: 0,
  suspensionM: 0,
  slipLong,
  slipLatDeg,
  contactMaterial: 7,
});
const STATE: VehicleState = {
  speedMs: 10,
  rpm: 2500,
  gear: 2,
  throttle: 0.5,
  abs: false,
  tcs: false,
  shifting: true,
  wheels: [wheel(0.1, 3), wheel(-0.3, 1)],
};

describe('vehicle audio input', () => {
  it('slip = worst wheel of |long| and lateral deg / 12, clamped', () => {
    expect(wheelSlip(STATE)).toBeCloseTo(0.3);
    expect(wheelSlip({ wheels: [wheel(0, 24)] })).toBe(1);
  });
  it('maps drive HUD + physics state; null outside drive/cycle', () => {
    const ph = { vehicleState: () => STATE } as unknown as PhysicsService;
    const t = {
      mode: 'drive',
      hud: { drive: { vehicle: 1, kind: 'sedan', view: 'cockpit' } },
    } as unknown as TraversalService;
    const a = vehicleAudioOf(t, ph, 0.4);
    expect(a).toMatchObject({ kind: 'car', rpm: 2500, shifting: true, wetness: 0.4, surface: 7, interior: true });
    expect(vehicleAudioOf({ ...t, mode: 'walk' } as TraversalService, ph, 0)).toBeNull();
  });
});
