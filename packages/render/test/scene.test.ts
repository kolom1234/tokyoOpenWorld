// 깊이 모드 판정, 태양 방향 규약, DecodedMesh → BufferGeometry 변환. see docs/modules/render.md
import { describe, expect, it } from 'vitest';
import { sunDirFromAzEl } from '../src/internal/lighting/sun.ts';
import { resolveDepthMode } from '../src/internal/renderer/init.ts';
import { buildGeometry, threeAttributeName } from '../src/internal/scene/cell-node.ts';

describe('depth mode', () => {
  it('reports what three actually enabled', () => {
    expect(resolveDepthMode({ reversedDepthBuffer: true, logarithmicDepthBuffer: false })).toBe('reversed-z');
    expect(resolveDepthMode({ reversedDepthBuffer: false, logarithmicDepthBuffer: true })).toBe('logarithmic');
    expect(resolveDepthMode({ reversedDepthBuffer: false, logarithmicDepthBuffer: false })).toBe('standard');
  });
});

describe('sun direction', () => {
  it('azimuth 0 = grid north (−Z), 90 = east (+X), elevation 90 = up', () => {
    expect(sunDirFromAzEl(0, 0).z).toBeCloseTo(-1);
    expect(sunDirFromAzEl(90, 0).x).toBeCloseTo(1);
    expect(sunDirFromAzEl(123, 90).y).toBeCloseTo(1);
  });
});

describe('DecodedMesh → BufferGeometry', () => {
  it('maps glTF attribute names and uses pipeline bounds without scanning vertices', () => {
    expect(threeAttributeName('POSITION')).toBe('position');
    expect(threeAttributeName('TEXCOORD_0')).toBe('uv');
    expect(threeAttributeName('_BLDG')).toBe('_bldg');
    const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normal = new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]);
    const g = buildGeometry({
      materialId: 'facade_default',
      attributes: {
        POSITION: { array: position, itemSize: 3, normalized: false },
        NORMAL: { array: normal, itemSize: 3, normalized: true },
      },
      index: new Uint16Array([0, 1, 2]),
      boundsLocal: { min: [0, 0, 0], max: [10, 20, 30] },
    });
    expect(g.getAttribute('position').array).toBe(position); // 복사 없음(소유권 이전)
    expect(g.getAttribute('normal').normalized).toBe(true);
    expect(g.index?.count).toBe(3);
    expect(g.boundingBox?.max.toArray()).toEqual([10, 20, 30]);
    expect(g.boundingSphere?.radius).toBeCloseTo(Math.hypot(5, 10, 15));
  });
});
