// M09-T03 셀 광원: 가로등 머리 = 기둥 + yaw 방향 1.45 m·높이 6.8 m, 상점 앞 = 바깥 0.6 m·높이 3 m, 셀 상한.
import { LIGHT_KIND, LIGHT_SCHEDULE, PROP_TYPE } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import type { BuildingRecord } from '../src/readers/plateau/types.ts';
import { buildLights, LIGHTS_PER_CELL } from '../src/stages/build/lights-cell.ts';

/** 남쪽 벽(+z 쪽, 바깥 법선 +z) 하나짜리 상업 건물(402 = 상점 1층). */
const shop: BuildingRecord = {
  layer: 'buildings',
  gmlId: 'shop',
  buildingId: null,
  lod: 2,
  measuredHeightM: 12,
  storeys: 3,
  storeysBelow: null,
  usage: '402',
  surfaces: [{ kind: 'wall', ringsWF: [[100, 10, 120, 114, 10, 120, 114, 22, 120, 100, 22, 120]] }],
  source: 's',
};

describe('cell lights', () => {
  it('places lamp heads, vending faces and shop fronts', () => {
    const lights = buildLights({
      batches: [
        { typeId: PROP_TYPE.streetLamp, transforms: Float32Array.from([10, 2, 20, 0, 1]) },
        { typeId: PROP_TYPE.vendingMachine, transforms: Float32Array.from([30, 2, 40, Math.PI / 2, 1]) },
      ],
      buildings: [shop],
      originWF: [0, 0, 0],
    });
    const lamp = lights.find((l) => l.kind === LIGHT_KIND.streetLamp);
    expect(lamp?.posLocal[0]).toBeCloseTo(10, 4);
    expect(lamp?.posLocal[1]).toBeCloseTo(8.8, 4);
    expect(lamp?.posLocal[2]).toBeCloseTo(21.45, 4);
    expect(lamp?.schedule).toBe(LIGHT_SCHEDULE.night);
    const v = lights.find((l) => l.kind === LIGHT_KIND.vending);
    expect(v?.posLocal[0]).toBeCloseTo(30.55, 4);
    const fronts = lights.filter((l) => l.kind === LIGHT_KIND.shopFront);
    expect(fronts.length).toBe(2);
    for (const f of fronts) {
      expect(f.posLocal[1]).toBeCloseTo(13, 4);
      expect(Math.abs((f.posLocal[2] as number) - 120)).toBeCloseTo(0.6, 4);
    }
  });

  it('caps lights per cell', () => {
    const t = new Float32Array(5 * 800);
    for (let i = 0; i < 800; i++) t.set([i, 0, 0, 0, 1], i * 5);
    expect(
      buildLights({ batches: [{ typeId: PROP_TYPE.streetLamp, transforms: t }], buildings: [], originWF: [0, 0, 0] }),
    ).toHaveLength(LIGHTS_PER_CELL);
  });
});
