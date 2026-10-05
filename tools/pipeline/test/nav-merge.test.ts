// 횡단 띠 병합(M06-T03 → T07): 끝점 공유·일직선 조각 잇기, 6 m 미만 끝 조각은 반폭 차·25°까지 본 띠에 흡수.
import { describe, expect, it } from 'vitest';
import { mergeCollinear } from '../src/stages/build/nav-cell.ts';

const band = (a: [number, number], b: [number, number], half: number, signal = true) => ({ a, b, half, signal });

describe('mergeCollinear', () => {
  it('joins straight pieces with the same width and keeps bent ones apart', () => {
    expect(mergeCollinear([band([0, 0], [10, 0], 2), band([10, 0], [20, 1], 2)])).toHaveLength(1);
    expect(mergeCollinear([band([0, 0], [10, 0], 2), band([10, 0], [16, 6], 2)])).toHaveLength(2);
    expect(mergeCollinear([band([0, 0], [10, 0], 2), band([10, 0], [20, 0], 3)])).toHaveLength(2);
  });

  it('absorbs short end stubs (different width, ≤ 25°) into the main band — Scramble north crosswalk 4 + 22 + 3 m', () => {
    const out = mergeCollinear([
      band([-45, 24], [-42, 24], 3),
      band([-42, 24], [-20, 29], 3.3),
      band([-20, 29], [-17, 29], 3),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ a: [-45, 24], b: [-17, 29], half: 3.3 });
    // 신호가 다르면 잇지 않는다.
    expect(mergeCollinear([band([0, 0], [3, 0], 3, false), band([3, 0], [20, 3], 3.3)])).toHaveLength(2);
  });
});
