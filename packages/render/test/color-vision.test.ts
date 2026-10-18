// M11-T04 색각 보정 행렬: 끔 = 단위, 회색은 그대로(시뮬레이션 행 합 ≈ 1), 1·2형은 빨강 성분 오차를 초록·파랑으로 옮긴다.
import { describe, expect, it } from 'vitest';
import { colorVisionMatrix } from '../src/internal/post/color-vision.ts';

const apply = (m: number[], c: [number, number, number]) =>
  [0, 1, 2].map((r) => (m[r * 3] as number) * c[0] + (m[r * 3 + 1] as number) * c[1] + (m[r * 3 + 2] as number) * c[2]);

describe('color vision', () => {
  it('is identity when off and keeps grays for every mode', () => {
    expect(colorVisionMatrix('off')).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    for (const m of ['protan', 'deutan', 'tritan'] as const)
      for (const v of apply(colorVisionMatrix(m), [0.5, 0.5, 0.5])) expect(v).toBeCloseTo(0.5, 2);
  });
  it('shifts red/green confusion into blue for protan and deutan', () => {
    for (const m of ['protan', 'deutan'] as const) {
      const red = apply(colorVisionMatrix(m), [1, 0, 0]);
      expect(red[0]).toBeCloseTo(1, 6);
      expect(red[2]).toBeGreaterThan(0.2);
    }
  });
});
