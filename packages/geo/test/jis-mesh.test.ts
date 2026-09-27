import { describe, expect, it } from 'vitest';
import { jisMesh3CodesInBBox, jisMesh3Of, lonLatBBoxOfWF } from '../src/index.ts';

describe('jisMesh3Of', () => {
  it('스크램블 교차로 = 53393596', () => {
    expect(jisMesh3Of(35.6595, 139.70055)).toBe('53393596');
  });

  it('도쿄역 = 53394611 (JIS X 0410 공개 예)', () => {
    expect(jisMesh3Of(35.681236, 139.767125)).toBe('53394611');
  });

  it('메시 경계 위 점은 북·동쪽 메시', () => {
    // 53393596의 남서 모서리: 위도 35°39′30″ = 4279/120, 경도 139°42′00″ = 139.7
    expect(jisMesh3Of(4279 / 120, 139.7)).toBe('53393596');
  });

  it('범위 밖은 RangeError', () => {
    expect(() => jisMesh3Of(10, 139)).toThrow(RangeError);
  });
});

describe('jisMesh3CodesInBBox', () => {
  it('스크램블 주변 3×3 셀(WF −512..256, −256..512)은 4개 메시에 걸친다', () => {
    const bbox = lonLatBBoxOfWF({ minX: -512, minZ: -256, maxX: 256, maxZ: 512 });
    expect(jisMesh3CodesInBBox(bbox)).toEqual(['53393585', '53393586', '53393595', '53393596']);
  });
});
