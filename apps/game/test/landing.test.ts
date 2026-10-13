// freecam G 카메라 아래 내리기(ADR-0083): 후보 판정(지면·승강장·선로·차도·지붕·건물 안·머리 공간·경사)과 가까운 링 대체, 차선 폭 판정.
import type { Vec3, Vec3d } from '@sanpo/core';
import type { RayHit } from '@sanpo/physics';
import type { LaneGraphChunk } from '@sanpo/tile-format';
import { describe, expect, it } from 'vitest';
import { evaluateSpot, findLanding, type LandingQueries, landingOffsets, onLane } from '../src/landing.ts';
import { platformTops, trackPits } from '../src/station/platform-geo.ts';

const hit = (p: Vec3d, layer = 1, ny = 1): RayHit => ({
  posWF: p,
  normal: { x: 0, y: ny, z: Math.sqrt(1 - ny * ny) },
  distance: 1,
  layer,
  material: 0,
});

/** 장면: 지면 y 2(TERRAIN), x ∈ [20, 30] 건물 지붕 y 30(STATIC), x ∈ [40, 46] 승강장 y 5, 선로 x = 50 레일 y 4, z ∈ [−60, −50] 차도. */
function scene(over: Partial<LandingQueries> = {}): LandingQueries {
  const mesh = {
    positions: Float64Array.from([40, 5, -100, 46, 5, -100, 46, 5, 100, 40, 5, 100]),
    indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
    topIndexCount: 6,
  };
  const tops = platformTops(mesh);
  const pts = Float32Array.from(Array.from({ length: 401 }, (_, i) => [50, 4, -100 + i * 0.5]).flat());
  return {
    ray(o: Vec3d, d: Vec3): Promise<RayHit | null> {
      if (d.y < 0) {
        if (o.x >= 20 && o.x <= 30) return Promise.resolve(hit({ x: o.x, y: 30, z: o.z }, 0));
        if (o.x >= 40 && o.x <= 46) return Promise.resolve(hit({ x: o.x, y: 5, z: o.z }, 0));
        if (o.x >= 70 && o.x <= 72) return Promise.resolve(hit({ x: o.x, y: 2, z: o.z }, 1, 0.5));
        return Promise.resolve(hit({ x: o.x, y: 2, z: o.z }));
      }
      return Promise.resolve(null);
    },
    sphere: () => Promise.resolve(null),
    tops,
    pits: trackPits(tops, pts),
    onRoad: (_x, z) => Promise.resolve(z >= -60 && z <= -50),
    ...over,
  };
}

describe('landing', () => {
  it('open ground → ok just above the hit; reasons for roof, track, road, steep', async () => {
    const q = scene();
    expect(await evaluateSpot(q, 0, 0, 80)).toEqual({ ok: true, posWF: { x: 0, y: 2.02, z: 0 } });
    expect(await evaluateSpot(q, 25, 0, 80)).toEqual({ ok: false, reason: 'building' });
    expect(await evaluateSpot(q, 50, 0, 80)).toEqual({ ok: false, reason: 'track' });
    expect(await evaluateSpot(q, 0, -55, 80)).toEqual({ ok: false, reason: 'road' });
    expect(await evaluateSpot(q, 71, 0, 80)).toEqual({ ok: false, reason: 'steep' });
  });
  it('platform: centre ok (also under a canopy), edge = track', async () => {
    const q = scene();
    const base = scene();
    const canopy = scene({
      ray: (o, d, m) =>
        d.y < 0 && o.x >= 40 && o.x <= 46 && o.y > 10
          ? Promise.resolve(hit({ x: o.x, y: 10, z: o.z }, 0))
          : base.ray(o, d, m),
    });
    expect(await evaluateSpot(canopy, 43, 0, 80)).toEqual({ ok: true, posWF: { x: 43, y: 5.02, z: 0 } });
    expect(await evaluateSpot(q, 43, 0, 80)).toEqual({ ok: true, posWF: { x: 43, y: 5.02, z: 0 } });
    expect(await evaluateSpot(q, 40.3, 0, 80)).toEqual({ ok: false, reason: 'track' });
  });
  it('inside a building shell (roof above, walls all round) = building; no headroom = blocked', async () => {
    const shell = scene({
      ray: (o, d) => Promise.resolve(d.y < 0 ? hit({ x: o.x, y: 2, z: o.z }) : hit({ x: o.x, y: o.y + 3, z: o.z }, 0)),
    });
    expect(await evaluateSpot(shell, 0, 0, 80)).toEqual({ ok: false, reason: 'building' });
    const box = scene({ sphere: (o) => Promise.resolve(hit({ ...o, y: o.y + 0.5 }, 2)) });
    expect(await evaluateSpot(box, 0, 0, 80)).toEqual({ ok: false, reason: 'blocked' });
  });
  it('centre on the road → nearest ring spot off the road; nothing safe → centre reason', async () => {
    const q = scene();
    const r = await findLanding(q, { x: 0, y: 80, z: -51 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Math.hypot(r.posWF.x, r.posWF.z + 51)).toBeCloseTo(2, 6);
    const allRoof = scene({ ray: (o, d) => Promise.resolve(d.y < 0 ? hit({ x: o.x, y: 30, z: o.z }, 0) : null) });
    const roofs = await findLanding(allRoof, { x: 25, y: 80, z: 0 });
    expect(roofs).toEqual({ ok: false, reason: 'building' });
    expect(landingOffsets()).toHaveLength(25);
  });
  it('lane width test (cell-local)', () => {
    const g = {
      lanes: {
        id: Uint32Array.of(1),
        kind: Uint8Array.of(0),
        widthCm: Uint16Array.of(300),
        ptOffset: Uint32Array.of(0),
        ptCount: Uint16Array.of(2),
      },
      pointsLocal: Float32Array.of(0, 0, 0, 0, 0, 100),
    } as unknown as LaneGraphChunk;
    expect(onLane(g, 2.0, 50)).toBe(true);
    expect(onLane(g, 2.2, 50)).toBe(false);
  });
});
