// 대기(M03-T02): WF → ECEF 행렬(직교·원점 = 타원체 위 위치·위 = 타원체 법선·도북 수렴각), GPU 타이머 평균.
import { gridConvergenceDeg, wfToLonLat } from '@sanpo/geo';
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial';
import { Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GEOID_HEIGHT_M, worldToEcef } from '../src/internal/lighting/atmosphere.ts';
import { createGpuTimer } from '../src/internal/renderer/gpu-timer.ts';

describe('worldToEcef', () => {
  const origin = { x: -512, y: 0, z: -1024 };
  const m = worldToEcef(origin, new Matrix4());

  it('places the render origin on the ellipsoid (TP + geoid) and is orthonormal', () => {
    const ll = wfToLonLat(origin);
    const expected = new Geodetic(radians(ll.lon), radians(ll.lat), GEOID_HEIGHT_M).toECEF();
    const p = new Vector3(0, 0, 0).applyMatrix4(m);
    expect(p.distanceTo(expected)).toBeLessThan(1e-3);
    const r = new Matrix4().extractRotation(m);
    expect(Math.abs(r.determinant() - 1)).toBeLessThan(1e-9);
  });

  it('maps WF up to the ellipsoid surface normal and grid north to true azimuth γ', () => {
    const ll = wfToLonLat(origin);
    const pos = new Vector3(0, 0, 0).applyMatrix4(m);
    const up = new Vector3(0, 1, 0).transformDirection(m);
    expect(up.angleTo(Ellipsoid.WGS84.getSurfaceNormal(pos))).toBeLessThan(1e-9);
    const east = new Vector3();
    const north = new Vector3();
    Ellipsoid.WGS84.getEastNorthUpVectors(pos, east, north, new Vector3());
    const gridNorth = new Vector3(0, 0, -1).transformDirection(m);
    // 도북의 진북 기준 방위(시계 +) = atan2(동 성분, 북 성분) = γ.
    const az = (Math.atan2(gridNorth.dot(east), gridNorth.dot(north)) * 180) / Math.PI;
    expect(az).toBeCloseTo(gridConvergenceDeg(ll), 9);
  });
});

describe('gpu timer', () => {
  it('averages resolved render time per frame and stays inert when disabled', async () => {
    let next = 8;
    const renderer = { resolveTimestampsAsync: async () => next } as never;
    const t = createGpuTimer(renderer, true);
    t.afterFrame();
    await Promise.resolve();
    await Promise.resolve();
    next = 4;
    t.afterFrame();
    t.afterFrame(); // 해석 대기 중 → 다음 표본에 2프레임으로 합산
    await new Promise((r) => setTimeout(r, 0));
    const s = t.stats();
    expect(s.enabled).toBe(true);
    expect(s.samples).toBeGreaterThanOrEqual(1);
    expect(s.frameMs).toBeGreaterThan(0);
    const off = createGpuTimer(renderer, false);
    off.afterFrame();
    expect(off.stats()).toEqual({ enabled: false, frameMs: 0, samples: 0 });
  });
});
