// pyproj 골든 20점 대비 변환 오차 < 1 mm, 스크램블 교차로 위치, 왕복 변환. see docs/14-testing-perf.md §1
import { describe, expect, it } from 'vitest';
import {
  gridConvergenceDeg,
  lonLatToPrj,
  lonLatToWF,
  prjToLonLat,
  prjToWF,
  WORLD_ORIGIN,
  wfToLonLat,
  wfToPrj,
} from '../src/index.ts';
import golden from './golden.json' with { type: 'json' };

const TOL_M = 1e-3; // 수용 기준: 골든 오차 < 1 mm
const TOL_CONVERGENCE_DEG = 1e-6;
const DEG = Math.PI / 180;
// GRS80 근사 반경 — 위경도 차(도)를 지상 거리(m)로 환산할 때만 사용(1% 오차는 mm 판정에 무관).
const R_MERIDIAN_M = 6_356_000;
const R_EQUATOR_M = 6_378_137;

function lonLatErrM(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const dn = (a.lat - b.lat) * DEG * R_MERIDIAN_M;
  const de = (a.lon - b.lon) * DEG * R_EQUATOR_M * Math.cos(b.lat * DEG);
  return Math.hypot(dn, de);
}

function dist3(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

describe('golden (pyproj)', () => {
  it('has 20 points and matches WORLD_ORIGIN', () => {
    expect(golden.points).toHaveLength(20);
    expect(golden.origin).toEqual({ E0: WORLD_ORIGIN.E0, N0: WORLD_ORIGIN.N0, epsg: WORLD_ORIGIN.epsg });
  });

  it.each(golden.points)('$id: lonLat → PRJ/WF < 1 mm', (p) => {
    const prj = lonLatToPrj({ lon: p.lon, lat: p.lat }, p.heightTP);
    expect(Math.hypot(prj.northing - p.northing, prj.easting - p.easting)).toBeLessThan(TOL_M);
    expect(dist3(lonLatToWF({ lon: p.lon, lat: p.lat }, p.heightTP), p.wf)).toBeLessThan(TOL_M);
  });

  it.each(golden.points)('$id: WF/PRJ → lonLat < 1 mm', (p) => {
    const ll = wfToLonLat(p.wf);
    expect(lonLatErrM(ll, p)).toBeLessThan(TOL_M);
    expect(ll.heightTP).toBe(p.heightTP);
    expect(lonLatErrM(prjToLonLat(p), p)).toBeLessThan(TOL_M);
  });

  it.each(golden.points)('$id: PRJ ↔ WF (affine) exact', (p) => {
    expect(dist3(prjToWF(p.northing, p.easting, p.heightTP), p.wf)).toBeLessThan(1e-9);
    const back = wfToPrj(p.wf);
    expect(Math.hypot(back.northing - p.northing, back.easting - p.easting)).toBeLessThan(1e-9);
  });

  it.each(golden.points)('$id: grid convergence', (p) => {
    expect(Math.abs(gridConvergenceDeg(p) - p.convergenceDeg)).toBeLessThan(TOL_CONVERGENCE_DEG);
  });

  it('reports max error well under 1 mm', () => {
    let maxErr = 0;
    for (const p of golden.points) maxErr = Math.max(maxErr, dist3(lonLatToWF(p, p.heightTP), p.wf));
    expect(maxErr).toBeLessThan(TOL_M);
  });
});

describe('landmarks (docs/01-architecture.md §7)', () => {
  it('places Shibuya scramble crossing at WF ≈ (−22.3, ·, 8.6)', () => {
    const posWF = lonLatToWF({ lat: 35.6595, lon: 139.70055 }, 15);
    expect(Math.abs(posWF.x - -22.3)).toBeLessThan(0.1);
    expect(Math.abs(posWF.z - 8.6)).toBeLessThan(0.1);
    expect(posWF.y).toBe(15);
  });

  it('maps WF origin to PRJ (N0, E0) and CRS origin to PRJ (0, 0)', () => {
    expect(wfToPrj({ x: 0, y: 0, z: 0 })).toEqual({ northing: WORLD_ORIGIN.N0, easting: WORLD_ORIGIN.E0, heightTP: 0 });
    const prj = lonLatToPrj({ lat: 36, lon: 139 + 50 / 60 });
    expect(Math.abs(prj.northing)).toBeLessThan(TOL_M);
    expect(Math.abs(prj.easting)).toBeLessThan(TOL_M);
  });

  it('keeps −Z = north and +X = east', () => {
    const base = lonLatToWF({ lat: 35.66, lon: 139.7 });
    expect(lonLatToWF({ lat: 35.67, lon: 139.7 }).z).toBeLessThan(base.z);
    expect(lonLatToWF({ lat: 35.66, lon: 139.71 }).x).toBeGreaterThan(base.x);
  });
});

describe('round trip WF → lonLat → WF', () => {
  it('stays < 1 µm across the 23-ku extent', () => {
    let maxErr = 0;
    for (let x = -20000; x <= 30000; x += 2500) {
      for (let z = -20000; z <= 20000; z += 2500) {
        const posWF = { x: x + 0.123, y: 12.5, z: z - 0.456 };
        maxErr = Math.max(maxErr, dist3(lonLatToWF(wfToLonLat(posWF), posWF.y), posWF));
      }
    }
    expect(maxErr).toBeLessThan(1e-6);
  });

  it('rejects non-finite input', () => {
    expect(() => lonLatToWF({ lat: Number.NaN, lon: 139.7 })).toThrow(RangeError);
    expect(() => wfToLonLat({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 })).toThrow(RangeError);
  });
});
