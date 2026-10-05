// 열차(M07-T03): 절차 모델 차형 2 × 종류 4 × LOD 3 — 치수(길이·폭·지붕), 감기 = 법선(바깥), LOD마다 줄어듦, 노선색 띠·문짝·등화(앞 = 전조등·뒤 = 미등)·
// 팬터그래프(전차선 5.2 m), LOD0만 차내(롱시트·안내 화면·실내등), 정점 버퍼 ≤ 8, 필드 = 칸 버퍼 → 풀·LOD·시야·문·모션 벡터.
import type { SharedInstanceBuffer } from '@sanpo/core';
import { MeshBasicMaterial, PerspectiveCamera } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createTrainField, decodeCarCode } from '../src/internal/trains/field.ts';
import { buildTrainGeometry } from '../src/internal/trains/models.ts';
import { CAR_DIMS, type CarLod } from '../src/internal/trains/parts.ts';
import { VPART } from '../src/internal/vehicles/builder.ts';

const LODS: CarLod[] = [0, 1, 2];
const codesOf = (type: number, kind: number, lod: CarLod): Set<number> => {
  const part = buildTrainGeometry(type, kind, lod).getAttribute('_vpart');
  const s = new Set<number>();
  for (let v = 0; v < part.count; v++) s.add(Math.round(part.getX(v)));
  return s;
};

describe('train models', () => {
  it('match the car dimensions, wind outward and shrink per LOD', () => {
    for (const [type, d] of CAR_DIMS.entries())
      for (let kind = 0; kind < 4; kind++) {
        const tris = LODS.map((l) => {
          const g = buildTrainGeometry(type, kind, l);
          g.computeBoundingBox();
          const b = g.boundingBox;
          if (!b) throw new Error('bbox');
          const msg = `type ${type} kind ${kind} lod ${l}`;
          expect(b.max.z - b.min.z, msg).toBeLessThanOrEqual(d.L + 0.3);
          expect(b.max.z - b.min.z, msg).toBeGreaterThan(d.L - 0.8);
          expect(b.max.x - b.min.x, msg).toBeLessThan(d.W + 0.05);
          expect(b.max.y, msg).toBeLessThan(kind === 1 ? 5.25 : d.roof + 0.4);
          const p = g.getAttribute('position');
          const n = g.getAttribute('normal');
          const idx = g.index?.array ?? [];
          let bad = 0;
          for (let k = 0; k < idx.length; k += 3) {
            const [a, bb, c] = [idx[k], idx[k + 1], idx[k + 2]] as [number, number, number];
            const e1 = [p.getX(bb) - p.getX(a), p.getY(bb) - p.getY(a), p.getZ(bb) - p.getZ(a)] as const;
            const e2 = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)] as const;
            const cx = e1[1] * e2[2] - e1[2] * e2[1];
            const cy = e1[2] * e2[0] - e1[0] * e2[2];
            const cz = e1[0] * e2[1] - e1[1] * e2[0];
            if (cx * n.getX(a) + cy * n.getY(a) + cz * n.getZ(a) < -1e-9) bad++;
          }
          expect(bad, msg).toBe(0);
          // WebGPU 정점 버퍼: 위치·법선·색·_vpart + 인스턴스 3 = 7 ≤ 8.
          expect(Object.keys(g.attributes).length + 3, msg).toBeLessThanOrEqual(8);
          return idx.length / 3;
        });
        expect(tris[0]).toBeGreaterThan(tris[1] as number);
        expect(tris[1]).toBeGreaterThan(tris[2] as number);
        expect(tris[0]).toBeLessThan(6000);
      }
  });

  it('has the line-colour band, sliding door leaves, cab lamps by end and the interior only on LOD0', () => {
    for (let type = 0; type < 2; type++) {
      const mid = codesOf(type, 0, 0);
      for (const c of [VPART.paint, VPART.doorLeaf, VPART.stainless, VPART.lcd, VPART.cabinLight])
        expect(mid.has(c), `part ${c}`).toBe(true);
      expect(mid.has(VPART.head) || mid.has(VPART.tail)).toBe(false);
      const front = codesOf(type, 2, 1);
      expect(front.has(VPART.head) && !front.has(VPART.tail)).toBe(true);
      const rear = codesOf(type, 3, 1);
      expect(rear.has(VPART.tail) && !rear.has(VPART.head)).toBe(true);
      expect(codesOf(type, 0, 1).has(VPART.lcd)).toBe(false);
    }
    // 문짝: `_vpart.y` 방향 ±1, `.z` 쪽 ±1(양쪽 모두).
    const g = buildTrainGeometry(0, 0, 0);
    const part = g.getAttribute('_vpart');
    const sides = new Set<number>();
    for (let v = 0; v < part.count; v++)
      if (Math.round(part.getX(v)) === VPART.doorLeaf) {
        expect(Math.abs(part.getY(v))).toBe(1);
        sides.add(part.getZ(v));
      }
    expect([...sides].sort()).toEqual([-1, 1]);
    // 팬터그래프 접판 = 전차선 높이(5.2 m) 근처.
    const pg = buildTrainGeometry(0, 1, 0);
    pg.computeBoundingBox();
    expect(pg.boundingBox?.max.y).toBeGreaterThan(5.15);
  });
});

function buffer(cars: number[][]): SharedInstanceBuffer {
  const data = new Float32Array(cars.length * 8);
  for (const [i, c] of cars.entries()) data.set(c, i * 8);
  return { data, stride: 8, anchorWF: () => ({ x: 0, y: 0, z: 0 }), count: () => cars.length, seq: () => 1 };
}

describe('train field', () => {
  it('decodes the car code and fills type/kind/LOD pools with doors and motion', () => {
    expect(decodeCarCode(2 + ((1 + 1) / 2) * 0.999)).toMatchObject({ type: 0, kind: 2 });
    expect(decodeCarCode(4 + 0.0005).doors).toBeCloseTo(-1, 2);
    expect(decodeCarCode(5 + 0.5 * 0.999).doors).toBeCloseTo(0, 5);
    const f = createTrainField();
    f.attach(new MeshBasicMaterial());
    const cam = new PerspectiveCamera(60, 1.6, 0.1, 5000);
    cam.position.set(0, 2, 30);
    cam.lookAt(0, 2, 0);
    cam.updateMatrixWorld();
    f.bind(
      buffer([
        [0, 0, 0, 0, 0, 10, 0x9acd32, 2 + 0.9995], // 앞 운전실, 문 오른쪽 활짝, 30 m → LOD0
        [0, 0, -200, 0, 0, 10, 0x9acd32, 0 + 0.4995], // 중간, 200 m → LOD1
        [0, 0, -1000, 0, 0, 10, 0x9acd32, 4 + 0.4995], // 지하철형 중간, 1 km → LOD2
        [0, 0, 400, 0, 0, 10, 0x9acd32, 1 + 0.4995], // 카메라 뒤 — 컬링
      ]),
    );
    f.update(cam, { x: 0, y: 0, z: 0 });
    const st = f.stats();
    expect(st.visible).toBe(3);
    expect(st.lods).toEqual([1, 1, 1]);
    const pool = f.root.children.find((m) => m.name === 'train/0/2/lod0') as unknown as {
      geometry: { instanceCount: number; getAttribute(n: string): { array: Float32Array } };
    };
    expect(pool.geometry.instanceCount).toBe(1);
    expect(pool.geometry.getAttribute('_ivar').array[1]).toBeCloseTo(1, 3);
    expect(pool.geometry.getAttribute('_ivar').array[2]).toBe(0x9acd32);
  });
});
