// HLOD 파사드(M12-T01): 건물 HLOD만 L0 근사 노드(색·거칠기·금속도·AO·밤 창)를 갖고, 지형 HLOD는 단색 그대로.
// 창 사각형은 L0 클래스 표(facade/grid.ts)로 그린다 — 표의 창 비가 칸 안에 들어가야 원경 창이 이웃 칸과 겹치지 않는다.
import { describe, expect, it } from 'vitest';
import {
  CURTAIN,
  FACADE_CLASS,
  FACADE_CLASS_COUNT,
  FACADE_CLASS_TABLE,
  WINDOW_SILL,
} from '../src/internal/materials/facade/grid.ts';
import { HLOD_CURTAIN_MIN_FLOORS } from '../src/internal/materials/hlod-facade.ts';
import { createMaterialLibrary } from '../src/internal/materials/library.ts';
import { createMaterialRegistry } from '../src/internal/materials/registry.ts';
import { createEnvUniforms } from '../src/internal/weather/wetness.ts';

type NodeMat = {
  colorNode: unknown;
  roughnessNode: unknown;
  metalnessNode: unknown;
  aoNode: unknown;
  emissiveNode: unknown;
  alphaHash: boolean;
};

describe('HLOD facade (M12-T01)', () => {
  it('gives only the building HLOD (and its fade variant) the L0-approximating nodes', () => {
    const lib = createMaterialLibrary('/basis/');
    const r = createMaterialRegistry(lib, createEnvUniforms());
    for (const fading of [false, true]) {
      const b = r.getHlod('facade_default', fading) as unknown as NodeMat;
      for (const k of ['colorNode', 'roughnessNode', 'metalnessNode', 'aoNode', 'emissiveNode'] as const)
        expect(b[k], `${k} fading=${fading}`).toBeTruthy();
      expect(b.alphaHash).toBe(fading);
      const t = r.getHlod('terrain_ground', fading) as unknown as NodeMat;
      expect(t.colorNode).toBeFalsy();
      expect(t.emissiveNode).toBeFalsy();
    }
    r.dispose();
    lib.dispose();
  });

  it('draws windows from the L0 class table, and every window fits inside its cell', () => {
    expect(FACADE_CLASS_TABLE).toHaveLength(FACADE_CLASS_COUNT);
    FACADE_CLASS_TABLE.forEach((p, cls) => {
      const officeLike = cls === FACADE_CLASS.office || cls === FACADE_CLASS.public;
      const sill = officeLike ? WINDOW_SILL.office : WINDOW_SILL.other;
      expect(p.z, `class ${cls} window width ratio`).toBeGreaterThan(0);
      expect(p.z).toBeLessThan(1);
      expect(sill + p.w, `class ${cls} window top`).toBeLessThan(1);
    });
    const officeFloorM = FACADE_CLASS_TABLE[FACADE_CLASS.office]?.x ?? 0;
    expect(CURTAIN.spandrelM + CURTAIN.topM).toBeLessThan(officeFloorM);
    expect(2 * CURTAIN.sideM).toBeLessThan(CURTAIN.bayM);
  });

  it('treats only tall offices as curtain walls (no curtain bit in hlod.mesh — L0 always-glass height is 90 m)', () => {
    const officeFloorM = FACADE_CLASS_TABLE[FACADE_CLASS.office]?.x ?? 0;
    const heightM = HLOD_CURTAIN_MIN_FLOORS * officeFloorM;
    expect(heightM).toBeGreaterThanOrEqual(80);
    expect(heightM).toBeLessThanOrEqual(90);
  });
});
