// 정점 하늘 가시도(M12-T05): 열린 땅 = 1, 고층 사이 골목 < 넓은 길, 건물을 마주 본 벽 < 열린 쪽 벽, 결정론·u8.
import { describe, expect, it } from 'vitest';
import { createSkyField, skyAttribute } from '../src/stages/build/sky-visibility.ts';

/** WF 사각 발자국 링(y = 0). */
const box = (x0: number, z0: number, w: number, d: number): number[] => [
  x0,
  0,
  z0,
  x0 + w,
  0,
  z0,
  x0 + w,
  0,
  z0 + d,
  x0,
  0,
  z0 + d,
];

describe('sky visibility (M12-T05)', () => {
  const ground = () => 0;
  // 셀 원점 (0, 0). 가운데(x 120–136)에 폭 16 m 골목을 두고 양쪽에 높이 60 m 건물.
  const field = createSkyField({
    ox: 0,
    oz: 0,
    ground,
    buildings: [
      { ground: [[box(60, 0, 60, 256)]], topY: 60 },
      { ground: [[box(136, 0, 60, 256)]], topY: 60 },
    ],
  });
  const open = createSkyField({ ox: 0, oz: 0, ground, buildings: [] });

  it('is 1 on open ground and lower in a narrow canyon', () => {
    expect(open.at(128, 0, 128, 0, 1, 0)).toBeCloseTo(1, 6);
    const canyon = field.at(128, 0, 128, 0, 1, 0);
    // 폭 16 m·높이 60 m 협곡의 이론 SVF = cos(atan(2H/W)) ≈ 0.13 — 12 방위 이산화로 약간 높게(≈ 0.19).
    expect(canyon).toBeLessThan(0.3);
    expect(canyon).toBeGreaterThan(0.1);
    // 건물에서 멀어질수록 밝아진다.
    expect(field.at(20, 0, 128, 0, 1, 0)).toBeGreaterThan(canyon);
  });

  it('darkens a wall that faces a building more than one that faces open space', () => {
    // 왼쪽 건물의 동쪽 벽(x = 120, 법선 +x) = 골목 건너 건물을 본다. 서쪽 벽(x = 60, 법선 −x) = 열린 쪽.
    const facing = field.at(120, 5, 128, 1, 0, 0);
    const outward = field.at(60, 5, 128, -1, 0, 0);
    expect(facing).toBeLessThan(outward);
  });

  it('packs to u8 deterministically (int8 normals)', () => {
    const pos = [128, 0, 128, 20, 0, 128];
    const nrm = [0, 127, 0, 0, 127, 0];
    const a = skyAttribute(field, pos, nrm, 2, { ox: 0, oz: 0 }, 127);
    expect(a).toEqual(skyAttribute(field, pos, nrm, 2, { ox: 0, oz: 0 }, 127));
    expect(a[0]).toBeLessThan(a[1] as number);
    expect([...skyAttribute(open, pos, nrm, 2, { ox: 0, oz: 0 }, 127)]).toEqual([255, 255]);
  });
});
