// 자오선 수렴각 부호·방위 보정, WF 사각형 → 위경도 외접 상자. see docs/01-architecture.md §7
import { describe, expect, it } from 'vitest';
import { gridConvergenceDeg, lonLatBBoxOfWF, lonLatToWF, trueToGridAzimuthDeg, wfToLonLat } from '../src/index.ts';

const SCRAMBLE = { lat: 35.6595, lon: 139.70055 };

describe('grid convergence', () => {
  it('is ≈ −0.08° in the MVP area (west of the IX central meridian) and 0 on it', () => {
    const g = gridConvergenceDeg(SCRAMBLE);
    expect(g).toBeLessThan(-0.07);
    expect(g).toBeGreaterThan(-0.09);
    expect(Math.abs(gridConvergenceDeg({ lat: 35.7, lon: 139 + 50 / 60 }))).toBeLessThan(1e-7);
    expect(gridConvergenceDeg({ lat: 35.7, lon: 139.9 })).toBeGreaterThan(0);
  });

  it('true north azimuth becomes the grid azimuth of the WF meridian direction', () => {
    const azGrid = trueToGridAzimuthDeg(0, SCRAMBLE);
    // 자오선 위 ±55 m 두 점(중심 차분)을 잇는 WF 방위(−Z 기준 시계방향)와 비교.
    const a = lonLatToWF({ lat: SCRAMBLE.lat - 0.0005, lon: SCRAMBLE.lon });
    const b = lonLatToWF({ lat: SCRAMBLE.lat + 0.0005, lon: SCRAMBLE.lon });
    const azWF = (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI;
    expect(azGrid).toBeCloseTo((azWF + 360) % 360, 5);
    expect(trueToGridAzimuthDeg(90, SCRAMBLE)).toBeCloseTo(90 - gridConvergenceDeg(SCRAMBLE), 12);
    expect(trueToGridAzimuthDeg(-720, SCRAMBLE)).toBeGreaterThanOrEqual(0);
  });
});

describe('lonLatBBoxOfWF', () => {
  it('covers every point of the WF rectangle', () => {
    const b = { minX: -1792, minZ: -4352, maxX: 1792, maxZ: 1024 };
    const bbox = lonLatBBoxOfWF(b);
    for (let x = b.minX; x <= b.maxX; x += 256) {
      for (let z = b.minZ; z <= b.maxZ; z += 256) {
        const ll = wfToLonLat({ x, y: 0, z });
        expect(ll.lon).toBeGreaterThan(bbox.west);
        expect(ll.lon).toBeLessThan(bbox.east);
        expect(ll.lat).toBeGreaterThan(bbox.south);
        expect(ll.lat).toBeLessThan(bbox.north);
      }
    }
    expect(bbox.north - bbox.south).toBeLessThan(0.06);
  });

  it('rejects empty bounds', () => {
    expect(() => lonLatBBoxOfWF({ minX: 0, minZ: 0, maxX: 0, maxZ: 10 })).toThrow(RangeError);
  });
});
