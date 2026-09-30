// HLOD 자식 전환(M02-T05): 숨김 = 0.3 s 페이드, 보임 = 즉시, 부모 도착 전 상태 기억, 페이드 벡터 공유, `_CHILD` → float 속성.
// see docs/06-world-streaming.md §5, ADR-0024
import { packCellKey } from '@sanpo/core';
import { Group, Vector4 } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createMaterialLibrary } from '../src/internal/materials/library.ts';
import { createMaterialRegistry } from '../src/internal/materials/registry.ts';
import {
  buildGeometry,
  createCellSet,
  hlodNeedsDither,
  PREPASS_RENDER_ORDER,
} from '../src/internal/scene/cell-node.ts';
import { createHlodSwitch, HLOD_FADE_S } from '../src/internal/scene/hlod-switch.ts';
import { createEnvUniforms } from '../src/internal/weather/wetness.ts';

const P = packCellKey(1, 0, 0);
const vecs = () => [new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1), new Vector4(1, 1, 1, 1)];

describe('hlod switch', () => {
  it('hides a child with a 0.3 s fade and shows it again instantly', () => {
    const sw = createHlodSwitch();
    const v = vecs();
    sw.attach(P, v);
    sw.setChildVisible(P, 5, false);
    expect(v[1]?.y).toBe(1); // 페이드 시작 전
    expect(sw.update(HLOD_FADE_S / 2)).toBe(1);
    expect(v[1]?.y).toBeCloseTo(0.5, 5);
    expect(sw.update(HLOD_FADE_S)).toBe(0);
    expect(v[1]?.y).toBe(0);
    expect(sw.hiddenOf(P)).toBe(1);
    sw.setChildVisible(P, 5, true); // 자식 해제 직전 → 즉시 보임(구멍 없음)
    expect(v[1]?.y).toBe(1);
    expect(sw.hiddenOf(P)).toBe(0);
  });

  it('remembers hidden children for a parent that arrives later (starts hidden, no fade-in)', () => {
    const sw = createHlodSwitch();
    sw.setChildVisible(P, 0, false);
    sw.setChildVisible(P, 15, false);
    const v = vecs();
    sw.attach(P, v);
    expect([v[0]?.x, v[3]?.w, v[0]?.y]).toEqual([0, 0, 1]);
    expect(sw.update(0.016)).toBe(0);
  });

  it('forgets fully visible detached parents (no leak) and rejects bad child indices', () => {
    const sw = createHlodSwitch();
    sw.attach(P, vecs());
    sw.setChildVisible(P, 3, false);
    sw.detach(P);
    expect(sw.size).toBe(1); // 숨김 상태는 부모 재도착을 위해 보관
    sw.setChildVisible(P, 3, true);
    expect(sw.size).toBe(0);
    expect(() => sw.setChildVisible(P, 16, false)).toThrow();
  });
});

describe('hlod geometry', () => {
  it('converts _CHILD (u8) to a float32 `_child` attribute (WebGPU has no 1-component u8 format)', () => {
    const g = buildGeometry({
      materialId: 'terrain_ground',
      attributes: {
        POSITION: { array: new Float32Array(9), itemSize: 3, normalized: false },
        _CHILD: { array: new Uint8Array([0, 7, 15]), itemSize: 1, normalized: false },
      },
      index: new Uint16Array([0, 1, 2]),
      boundsLocal: { min: [0, 0, 0], max: [1, 1, 1] },
    });
    const a = g.getAttribute('_child');
    expect(a.array).toBeInstanceOf(Float32Array);
    expect([...a.array]).toEqual([0, 7, 15]);
    expect(g.getAttribute('_CHILD')).toBeUndefined();
  });

  it('converts _SURF/_BLDG to float32 and passes _FACADE as normalized u8×4 (WebGL2 integer inputs, M03-T01)', () => {
    const g = buildGeometry({
      materialId: 'facade_default',
      attributes: {
        POSITION: { array: new Float32Array(9), itemSize: 3, normalized: false },
        _SURF: { array: new Uint8Array([7, 0, 2]), itemSize: 1, normalized: false },
        _BLDG: { array: new Uint16Array([0, 1000, 65535]), itemSize: 1, normalized: false },
        _FACADE: { array: new Uint8Array(12).fill(3), itemSize: 4, normalized: false },
      },
      index: new Uint16Array([0, 1, 2]),
      boundsLocal: { min: [0, 0, 0], max: [1, 1, 1] },
    });
    expect([...g.getAttribute('_surf').array]).toEqual([7, 0, 2]);
    expect(g.getAttribute('_bldg').array).toBeInstanceOf(Float32Array);
    expect([...g.getAttribute('_bldg').array]).toEqual([0, 1000, 65535]);
    const f = g.getAttribute('_facade');
    expect(f.array).toBeInstanceOf(Uint8Array);
    expect(f.normalized).toBe(true);
  });
});

describe('hlod dither variants & facade depth prepass (ADR-0039)', () => {
  const prim = (materialId: string) => ({
    materialId,
    attributes: { POSITION: { array: new Float32Array(9), itemSize: 3, normalized: false } },
    index: new Uint16Array([0, 1, 2]),
    boundsLocal: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
  });
  const setup = () => {
    const lib = createMaterialLibrary('/basis/');
    const reg = createMaterialRegistry(lib, createEnvUniforms());
    const roots = Object.fromEntries(
      ['terrain', 'road', 'building', 'override', 'prop', 'vegetation', 'dynamic', 'light'].map((k) => [
        k,
        new Group(),
      ]),
    ) as never;
    const hlod = createHlodSwitch();
    const cells = createCellSet(reg, roots, hlod);
    cells.add(
      {
        key: P,
        id: 'L1_0_0',
        originWF: { x: 0, y: 0, z: 0 },
        meshes: { buildings: { primitives: [prim('facade_default')] }, hlod: { primitives: [prim('facade_default')] } },
      } as never,
      { x: 0, y: 0, z: 0 },
    );
    return { reg, roots: roots as Record<string, Group>, hlod, cells, lib };
  };

  it('needs dither only while a child fade is strictly between 0 and 1', () => {
    expect(hlodNeedsDither(vecs())).toBe(false);
    const v = vecs();
    (v[2] as Vector4).z = 0;
    expect(hlodNeedsDither(v)).toBe(false);
    (v[3] as Vector4).w = 0.4;
    expect(hlodNeedsDither(v)).toBe(true);
  });

  it('swaps HLOD meshes to the alphaHash variant only during a fade', () => {
    const { reg, roots, hlod, cells, lib } = setup();
    const mesh = () =>
      (roots.building?.children ?? []).flatMap((g) => g.children).find((m) => m.name.includes('/hlod/')) as unknown as {
        material: { alphaHash: boolean };
      };
    expect(mesh().material.alphaHash).toBe(false);
    hlod.setChildVisible(P, 3, false);
    hlod.update(HLOD_FADE_S / 2);
    expect(cells.syncHlodMaterials()).toBe(1);
    expect(mesh().material.alphaHash).toBe(true);
    hlod.update(HLOD_FADE_S);
    expect(cells.syncHlodMaterials()).toBe(0);
    expect(mesh().material.alphaHash).toBe(false);
    cells.dispose();
    reg.dispose();
    lib.dispose();
  });

  it('adds a depth-only twin (same geometry, drawn first, no shadows) for building facades only', () => {
    const { reg, roots, cells, lib } = setup();
    const all = Object.values(roots).flatMap((r) => r.children.flatMap((g) => g.children)) as unknown as {
      name: string;
      geometry: unknown;
      renderOrder: number;
      castShadow: boolean;
      material: { colorWrite: boolean };
    }[];
    const twins = all.filter((m) => m.name.endsWith('/prepass'));
    expect(twins.length).toBe(1);
    const twin = twins[0] as (typeof all)[number];
    const main = all.find((m) => m.name === twin.name.replace('/prepass', ''));
    expect(twin.geometry).toBe(main?.geometry);
    expect([twin.renderOrder, twin.castShadow, twin.material.colorWrite]).toEqual([PREPASS_RENDER_ORDER, false, false]);
    cells.dispose();
    reg.dispose();
    lib.dispose();
  });
});
