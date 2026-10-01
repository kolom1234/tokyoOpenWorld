// M05-T06 간판: 단위 모델(면 플래그·UV·바깥 감기), 위치 해시 변형(결정론·범위), 필드(간판 종류만·거리·용량·원점 평행이동·셀 제거).
import { packCellKey } from '@sanpo/core';
import { PROP_TYPE } from '@sanpo/tile-format';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { SIGN_BRANDS } from '../src/internal/signs/atlas.ts';
import { createSignField, signVariant } from '../src/internal/signs/field.ts';
import { PROJECTING, projectingSign, rooftopSign, standingSign } from '../src/internal/signs/models.ts';

describe('sign models', () => {
  it('flag text faces (vertical / horizontal tiles) with 0..1 uvs and outward winding', () => {
    for (const [make, flag] of [
      [projectingSign, 1],
      [standingSign, 1],
      [rooftopSign, 2],
    ] as const) {
      const g = make();
      const face = g.getAttribute('_face').array as Float32Array;
      expect(face.includes(flag)).toBe(true);
      expect(face.includes(0)).toBe(true);
      const uv = g.getAttribute('uv').array as Float32Array;
      expect(Math.min(...uv)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...uv)).toBeLessThanOrEqual(1);
      const pos = g.getAttribute('position').array as Float32Array;
      const nrm = g.getAttribute('normal').array as Float32Array;
      const idx = g.index?.array as Uint16Array | Uint32Array;
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => (i as number) * 3) as [number, number, number];
        const e1 = [0, 1, 2].map((k) => (pos[b + k] as number) - (pos[a + k] as number));
        const e2 = [0, 1, 2].map((k) => (pos[c + k] as number) - (pos[a + k] as number));
        const cr = [
          (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
          (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
          (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
        ];
        const [cx, cy, cz] = cr as [number, number, number];
        expect(cx * (nrm[a] as number) + cy * (nrm[a + 1] as number) + cz * (nrm[a + 2] as number)).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the projecting box 4:1 like the vertical atlas tile', () => {
    expect(PROJECTING.h / PROJECTING.d).toBeCloseTo(4, 0);
  });
});

describe('signVariant', () => {
  it('is deterministic per position and stays in range', () => {
    const a = signVariant(PROP_TYPE.signProjecting, 10.2, 20, -30.4, 1);
    expect(signVariant(PROP_TYPE.signProjecting, 10.2, 20, -30.4, 1)).toEqual(a);
    expect(a[0]).toBeLessThan(SIGN_BRANDS);
    expect(a[1]).toBeGreaterThanOrEqual(0.85);
    expect(a[1]).toBeLessThan(1.1);
    expect(signVariant(PROP_TYPE.signRooftop, 1, 2, 3, 1.3).slice(1)).toEqual([1.3, 1.3, 1.3]);
    const brands = new Set(
      Array.from({ length: 200 }, (_, i) => signVariant(PROP_TYPE.signProjecting, i * 3.1, 5, i * 1.7, 1)[0]),
    );
    expect(brands.size).toBeGreaterThan(40);
  });
});

describe('sign field', () => {
  const batch = (typeId: number, pts: number[][]) => ({
    typeId,
    transforms: Float32Array.from(pts.flatMap(([x, y, z]) => [x as number, y as number, z as number, 0, 1])),
  });

  it('keeps only sign types, fills nearest within range relative to the render origin, and drops removed cells', () => {
    const f = createSignField();
    const key = packCellKey(0, 0, 0);
    f.addCell(key, { x: 256, y: 0, z: 0 }, [
      batch(PROP_TYPE.vendingMachine, [[1, 0, 1]]),
      batch(PROP_TYPE.signProjecting, [
        [10, 5, 10],
        [200, 5, 10],
      ]),
      batch(PROP_TYPE.signStanding, [[100, 0, 100]]),
    ]);
    f.attach(new MeshStandardNodeMaterial());
    expect(f.update({ x: 266, y: 2, z: 10 }, { x: 256, y: 0, z: 0 }, false)).toBe(true);
    expect(f.stats()).toMatchObject({ instances: 3, visible: 2, ready: true });
    expect(f.update({ x: 267, y: 2, z: 10 }, { x: 256, y: 0, z: 0 }, false)).toBe(false);
    const mesh = f.root.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } };
    expect(mesh.geometry.getAttribute('_ipos').array[0]).toBeCloseTo(10, 5);
    f.removeCell(key);
    f.update({ x: 266, y: 2, z: 10 }, { x: 256, y: 0, z: 0 }, false);
    expect(f.stats()).toMatchObject({ instances: 0, visible: 0 });
    f.dispose();
  });
});
