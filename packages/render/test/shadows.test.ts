// 태양 그림자(M03-T03): CSM 설정(High = 4 × 2048², 600 m, 페이드), 셀 슬롯별 cast/receive. 티어·갱신 스케줄(ADR-0039).
import { DirectionalLight, Group } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { cascadeDue, enableSunShadows, SHADOW_TIERS, STATIC_REFRESH_FRAMES } from '../src/internal/lighting/shadows.ts';
import { createMaterialLibrary } from '../src/internal/materials/library.ts';
import { createMaterialRegistry } from '../src/internal/materials/registry.ts';
import { createCellNode } from '../src/internal/scene/cell-node.ts';
import { createEnvUniforms } from '../src/internal/weather/wetness.ts';

describe('sun shadows', () => {
  it('configures cascaded shadow maps on the sun light and undoes it on dispose', () => {
    const renderer = { shadowMap: { enabled: false } } as never as Parameters<typeof enableSunShadows>[0];
    const light = new DirectionalLight();
    const s = enableSunShadows(renderer, light, 'high', () => []);
    expect((renderer as unknown as { shadowMap: { enabled: boolean } }).shadowMap.enabled).toBe(true);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.mapSize.x).toBe(SHADOW_TIERS.high.mapSize);
    expect(s.node.cascades).toBe(4);
    expect(s.node.maxFar).toBe(600);
    expect(s.node.fade).toBe(true);
    s.dispose();
    expect(light.castShadow).toBe(false);
  });

  it('follows the 07 §9 tier row: same cascade count in place, different count rebuilds receivers', () => {
    const renderer = { shadowMap: { enabled: false } } as never as Parameters<typeof enableSunShadows>[0];
    const light = new DirectionalLight();
    const mats = [{ needsUpdate: false }];
    const s = enableSunShadows(renderer, light, 'high', () => mats as never);
    const high = s.node;
    s.setTier('ultra');
    expect(s.node).toBe(high);
    expect([s.node.maxFar, light.shadow.mapSize.x, mats[0]?.needsUpdate]).toEqual([800, 4096, false]);
    s.setTier('medium');
    expect(s.node).not.toBe(high);
    expect([s.node.cascades, s.node.maxFar, light.shadow.mapSize.x, mats[0]?.needsUpdate]).toEqual([
      3,
      300,
      1536,
      true,
    ]);
    expect(s.settings).toEqual(SHADOW_TIERS.medium);
    s.dispose();
  });

  it('staggers far cascades while moving and refreshes one at a time when still', () => {
    const due = (n: number, f: number, active: boolean) =>
      Array.from({ length: n }, (_, i) => (cascadeDue(i, n, f, active) ? 1 : 0));
    // 움직일 때: c0 매 프레임 + 프레임당 먼 캐스케이드 하나.
    expect([0, 1, 2, 3].map((f) => due(4, f, true))).toEqual([
      [1, 0, 1, 0],
      [1, 1, 0, 0],
      [1, 0, 0, 1],
      [1, 1, 0, 0],
    ]);
    expect([0, 1].map((f) => due(3, f, true))).toEqual([
      [1, 0, 1],
      [1, 1, 0],
    ]);
    expect([0, 1].map((f) => due(2, f, true))).toEqual([
      [1, 0],
      [1, 1],
    ]);
    // 4캐스케이드 × 4프레임 동안 먼 캐스케이드마다 최소 한 번.
    const seen = [0, 0, 0, 0];
    for (let f = 0; f < 4; f++) {
      due(4, f, true).forEach((v, i) => {
        seen[i] = (seen[i] ?? 0) + v;
      });
    }
    expect(seen.every((v) => v >= 1)).toBe(true);
    // 정지: STATIC_REFRESH_FRAMES마다 하나씩 돌아가며, 그 사이는 0.
    const still = Array.from({ length: 4 * STATIC_REFRESH_FRAMES }, (_, f) => due(4, f, false));
    expect(still.filter((d) => d.some((v) => v === 1)).length).toBe(4);
    expect(still[0]).toEqual([1, 0, 0, 0]);
    expect(still[STATIC_REFRESH_FRAMES]).toEqual([0, 1, 0, 0]);
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
