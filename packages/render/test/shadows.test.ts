// 태양 그림자(M03-T03): CSM 설정(High = 4 × 2048², 600 m, 페이드), 셀 슬롯별 cast/receive.
import { DirectionalLight, Group } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { enableSunShadows, SHADOWS_HIGH } from '../src/internal/lighting/shadows.ts';
import { createMaterialLibrary } from '../src/internal/materials/library.ts';
import { createMaterialRegistry } from '../src/internal/materials/registry.ts';
import { createCellNode } from '../src/internal/scene/cell-node.ts';
import { createEnvUniforms } from '../src/internal/weather/wetness.ts';

describe('sun shadows', () => {
  it('configures cascaded shadow maps on the sun light and undoes it on dispose', () => {
    const renderer = { shadowMap: { enabled: false } } as never as Parameters<typeof enableSunShadows>[0];
    const light = new DirectionalLight();
    const s = enableSunShadows(renderer, light);
    expect((renderer as unknown as { shadowMap: { enabled: boolean } }).shadowMap.enabled).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.x).toBe(SHADOWS_HIGH.mapSize);
    expect(s.node.cascades).toBe(4);
    expect(s.node.maxFar).toBe(600);
    expect(s.node.fade).toBe(true);
    s.dispose();
    expect(light.castShadow).toBe(false);
  });

  it('lets only buildings cast and keeps HLOD out of the shadow passes', () => {
    const lib = createMaterialLibrary('/basis/');
    const reg = createMaterialRegistry(lib, createEnvUniforms());
    const roots = Object.fromEntries(
      ['terrain', 'road', 'building', 'override', 'prop', 'vegetation', 'dynamic', 'light'].map((k) => [
        k,
        new Group(),
      ]),
    ) as never;
    const prim = (materialId: string) => ({
      materialId,
      attributes: { POSITION: { array: new Float32Array(9), itemSize: 3, normalized: false } },
      index: new Uint16Array([0, 1, 2]),
      boundsLocal: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
    });
    const node = createCellNode(
      {
        key: 1,
        id: 'L0_0_0',
        originWF: { x: 0, y: 0, z: 0 },
        meshes: {
          terrain: { primitives: [prim('terrain_ground')] },
          buildings: { primitives: [prim('facade_default')] },
          hlod: { primitives: [prim('facade_default')] },
        },
      } as never,
      reg,
      roots,
      { x: 0, y: 0, z: 0 },
    );
    const by = (slot: string) => node.meshes.find((m) => m.name.includes(`/${slot}/`));
    expect(by('terrain')?.castShadow).toBe(false);
    expect(by('terrain')?.receiveShadow).toBe(true);
    expect(by('buildings')?.castShadow).toBe(true);
    expect(by('hlod')?.castShadow).toBe(false);
    expect(by('hlod')?.receiveShadow).toBe(false);
    reg.dispose();
    lib.dispose();
  });
});
