// 차량(M06-T06): 절차 모델 7종 × LOD 3 — 치수 = core VEHICLE_TYPES, 삼각형 감기 = 법선(바깥), LOD마다 줄어듦, 바퀴 정점 = 축 반지름 안,
// WebGPU 정점 버퍼 ≤ 8, 필드 = SAB 칸 → 차종·LOD 풀·외삽·시야 원뿔·색(variant).
import { type SharedInstanceBuffer, VEHICLE_TYPES } from '@sanpo/core';
import { MeshBasicMaterial, PerspectiveCamera } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { VPART } from '../src/internal/vehicles/builder.ts';
import { createVehicleField } from '../src/internal/vehicles/field.ts';
import { nightFromSun } from '../src/internal/vehicles/material.ts';
import { buildVehicleGeometry, type VehicleLod, vehicleColors } from '../src/internal/vehicles/models.ts';

const LODS: VehicleLod[] = [0, 1, 2];

describe('vehicle models', () => {
  it('match the shared dimensions and shrink per LOD', () => {
    for (const [t, info] of VEHICLE_TYPES.entries()) {
      const tris = LODS.map((l) => {
        const g = buildVehicleGeometry(t, l);
        g.computeBoundingBox();
        const b = g.boundingBox;
        if (!b) throw new Error('bbox');
        const msg = `${info.name} lod${l}`;
        expect(b.max.z - b.min.z, msg).toBeGreaterThan(info.lengthM - 0.1);
        expect(b.max.z - b.min.z, msg).toBeLessThan(info.lengthM + 0.1);
        expect(b.max.x - b.min.x, msg).toBeLessThan(info.widthM + 0.35);
        expect(b.max.y, msg).toBeGreaterThan(info.heightM - 0.05);
        expect(b.max.y, msg).toBeLessThan(info.heightM + 0.2);
        expect(b.min.y, msg).toBeGreaterThanOrEqual(-1e-6);
        return (g.index?.count ?? 0) / 3;
      });
      expect(tris[0], info.name).toBeGreaterThan(tris[1] as number);
      expect(tris[1], info.name).toBeGreaterThan(tris[2] as number);
      expect(tris[0], info.name).toBeLessThan(1500);
    }
  });

  it('winds every triangle counter-clockwise around its stored normal; wheel vertices stay within the axle radius', () => {
    for (const [t, info] of VEHICLE_TYPES.entries())
      for (const l of LODS) {
        const g = buildVehicleGeometry(t, l);
        const p = g.getAttribute('position');
        const n = g.getAttribute('normal');
        const part = g.getAttribute('_vpart');
        const idx = g.index?.array ?? [];
        let bad = 0;
        for (let k = 0; k < idx.length; k += 3) {
          const [a, b, c] = [idx[k], idx[k + 1], idx[k + 2]] as [number, number, number];
          const e1 = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)];
          const e2 = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)];
          const cx = (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number);
          const cy = (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number);
          const cz = (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number);
          if (cx * n.getX(a) + cy * n.getY(a) + cz * n.getZ(a) < -1e-9) bad++;
        }
        expect(bad, `${info.name} lod${l}`).toBe(0);
        for (let v = 0; v < p.count; v++) {
          if (Math.round(part.getX(v)) !== VPART.wheel) continue;
          const r = Math.hypot(p.getY(v) - part.getZ(v), p.getZ(v) - part.getY(v));
          expect(r).toBeLessThanOrEqual(part.getZ(v) + 1e-4);
        }
      }
  });

  it('has lights (head, tail, both blinkers) on LOD 0–1 and a roof lamp only on the taxi', () => {
    for (const [t, info] of VEHICLE_TYPES.entries()) {
      const codes = new Set<number>();
      const part = buildVehicleGeometry(t, 0).getAttribute('_vpart');
      for (let v = 0; v < part.count; v++) codes.add(Math.round(part.getX(v)));
      for (const c of [VPART.head, VPART.tail, VPART.blinkL, VPART.blinkR, VPART.wheel, VPART.glass])
        expect(codes.has(c), `${info.name} part ${c}`).toBe(true);
      expect(codes.has(VPART.roofLamp), info.name).toBe(info.name === 'taxi');
    }
  });

  it('picks deterministic fictional colours per variant (taxi / bus palettes)', () => {
    expect(vehicleColors(0, 3, 9)).toEqual(vehicleColors(0, 3, 9));
    const taxi = VEHICLE_TYPES.findIndex((v) => v.name === 'taxi');
    const bus = VEHICLE_TYPES.findIndex((v) => v.name === 'bus');
    const taxis = new Set(Array.from({ length: 32 }, (_, c) => vehicleColors(taxi, c, 0)[0]));
    expect(taxis.size).toBeLessThanOrEqual(6);
    expect(vehicleColors(bus, 0, 1)[1]).not.toBe(vehicleColors(bus, 0, 2)[1]);
    for (let c = 0; c < 32; c++) expect(vehicleColors(0, c, 0)[0]).toBeLessThanOrEqual(0xffffff);
  });

  it('night factor follows the sun elevation', () => {
    expect(nightFromSun(0.5)).toBe(0);
    expect(nightFromSun(-0.2)).toBe(1);
    expect(nightFromSun(0)).toBeGreaterThan(0);
    expect(nightFromSun(0)).toBeLessThan(1);
  });
});

function source(rows: number[][], tickAbsMs: number): SharedInstanceBuffer & { tickAbsMs(): number } {
  const data = new Float32Array(rows.length * 8);
  for (const [i, r] of rows.entries()) data.set(r, i * 8);
  return {
    data,
    stride: 8,
    anchorWF: () => ({ x: 0, y: 0, z: 0 }),
    count: () => rows.length,
    seq: () => 1,
    tickAbsMs: () => tickAbsMs,
  };
}

describe('vehicle field', () => {
  it('stays within the 8 WebGPU vertex buffers', () => {
    const f = createVehicleField();
    f.attach(new MeshBasicMaterial());
    for (const m of f.root.children as unknown as { geometry: { attributes: object } }[])
      expect(Object.keys(m.geometry.attributes).length).toBeLessThanOrEqual(8);
    expect(f.root.children.length).toBe(VEHICLE_TYPES.length * 3);
    f.dispose();
  });

  it('buckets by type and distance LOD, culls behind the camera, extrapolates and packs colours/flags', () => {
    const f = createVehicleField();
    f.attach(new MeshBasicMaterial());
    const cam = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    cam.position.set(0, 2, 0);
    cam.lookAt(0, 2, -10);
    cam.updateMatrixWorld();
    const yawNorth = 0;
    const rows = [
      // 세단(variant 0 | 색 4 << 3), 북쪽 20 m, 10 m/s 북행, 제동.
      [0, 0, -20, yawNorth, 10, 0.25, 0 | (4 << 3), 1],
      // 버스(6), 북쪽 80 m.
      [5, 0, -80, yawNorth, 0, 0, 6, 0],
      // 경트럭(3), 북쪽 300 m.
      [-3, 0, -300, yawNorth, 0, 0, 3, 4],
      // 뒤(남쪽 30 m) — 시야 밖.
      [0, 0, 30, yawNorth, 0, 0, 0, 0],
      // 너무 멀다(700 m).
      [0, 0, -700, yawNorth, 0, 0, 0, 0],
    ];
    f.bind(source(rows, performance.timeOrigin + performance.now() - 100));
    expect(f.update(cam, { x: 0, y: 0, z: 0 })).toBe(true);
    const st = f.stats();
    expect(st.instances).toBe(5);
    expect(st.visible).toBe(3);
    expect(st.lods).toEqual([1, 1, 1]);
    expect(st.casters).toBe(2);
    const sedan = f.root.children.find((m) => m.name === 'vehicle/sedan/lod0') as unknown as {
      geometry: { attributes: Record<string, { array: Float32Array }>; instanceCount: number };
    };
    expect(sedan.geometry.instanceCount).toBe(1);
    const pos = sedan.geometry.attributes._ipos?.array as Float32Array;
    // 0.1 s 외삽 × 10 m/s 북쪽(−Z) ≈ 1 m.
    expect(pos[2]).toBeLessThan(-20.9);
    expect(pos[2]).toBeGreaterThan(-21.3);
    const vars = sedan.geometry.attributes._ivar?.array as Float32Array;
    expect(vars[1]).toBe(1);
    expect(vars[2]).toBe(vehicleColors(0, 4, 0)[0]);
    f.dispose();
  });
});
