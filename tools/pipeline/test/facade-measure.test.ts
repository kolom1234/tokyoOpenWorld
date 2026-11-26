// PLATEAU 텍스처 실측(M12-T06): 면 UV 안 표본 → 벽 색·유리 비율, 건물 넓이 가중, 렌더 예측 색 → 가장 가까운 tintIdx, 커튼월 판정, PPM.
import { FACADE_PALETTE, facadeWallGroup } from '@sanpo/core';
import { describe, expect, it } from 'vitest';
import { parsePpm } from '../src/cli-facades.ts';
import type { BuildingRecord } from '../src/readers/plateau/types.ts';
import {
  chooseTint,
  curtainFromGlass,
  type MaterialsAvg,
  predictWall,
  toLab,
} from '../src/stages/build/facade-tint.ts';
import { measureBuilding, type RgbImage, sampleSurface, srgbToLinear } from '../src/stages/derive/facade-measure.ts';

/** 왼쪽 절반 = 벽색(c), 오른쪽 절반 = 검은 창. */
function halfImage(c: [number, number, number]): RgbImage {
  const w = 16;
  const data = new Uint8Array(w * w * 3);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (x < w / 2) data.set(c, (y * w + x) * 3);
  return { width: w, height: w, data };
}

const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];

describe('facade measure (M12-T06)', () => {
  it('separates wall pixels from dark windows inside the UV polygon', () => {
    const m = sampleSurface(halfImage([200, 180, 150]), QUAD_UV);
    expect(m.n).toBe(400);
    expect(m.glass).toBeCloseTo(0.5, 2);
    expect(m.wall[0]?.[0]).toBeCloseTo(srgbToLinear(200 / 255), 6);
  });

  it('area-weights textured walls and ignores untextured ones', () => {
    const wall = (tex: string | undefined, x0: number, w: number) => ({
      kind: 'wall' as const,
      ringsWF: [[x0, 0, 0, x0 + w, 0, 0, x0 + w, 10, 0, x0, 10, 0]],
      ...(tex ? { tex, uv: [QUAD_UV] } : {}),
    });
    const b = {
      gmlId: 'b',
      surfaces: [wall('a.jpg', 0, 30), wall('b.jpg', 30, 10), wall(undefined, 40, 50)],
    } as unknown as BuildingRecord;
    const imgs: Record<string, RgbImage> = { 'a.jpg': halfImage([230, 230, 230]), 'b.jpg': halfImage([0, 0, 255]) };
    const m = measureBuilding(b, (t) => imgs[t] ?? null);
    expect(m).not.toBeNull();
    // 30 m² 흰 벽(230 — 255는 하이라이트로 빠진다) + 10 m² 파란 벽(블루 휘도 0.072 → 벽으로 잡힌다): 빨강 = 0.75 × lin(230).
    expect(m?.wall[0]).toBeCloseTo(0.75 * srgbToLinear(230 / 255), 3);
    expect(m?.glass).toBeCloseTo(0.5, 2);
  });

  it('parses 8-bit P6 PPM with comments', () => {
    const head = new TextEncoder().encode('P6\n# c\n2 1\n255\n');
    const img = parsePpm(new Uint8Array([...head, 1, 2, 3, 4, 5, 6]));
    expect([img.width, img.height, ...img.data]).toEqual([2, 1, 1, 2, 3, 4, 5, 6]);
  });
});

describe('facade tint choice (M12-T06)', () => {
  // 그룹마다 레이어 1개, 평균색이 뚜렷이 다르게.
  const groups = ['tile', 'concrete', 'metal', 'alc', 'plaster', 'siding'];
  const mats: MaterialsAvg = {
    avg: new Map(groups.map((_, i) => [i, [0.3 + 0.1 * i, 0.5, 0.7 - 0.08 * i] as [number, number, number]])),
    groups: Object.fromEntries(groups.map((g, i) => [g, [i]])),
  };

  it('predicts the same wall group and palette as the shader table', () => {
    const t = 42;
    const g = facadeWallGroup(1, t);
    const i = groups.indexOf(g);
    const p = predictWall(1, t, mats);
    const pal = FACADE_PALETTE[t % 8] as readonly number[];
    const lin = srgbToLinear((mats.avg.get(i) as number[])[0] as number) * (pal[0] as number);
    expect(p[0]).toBeCloseTo((0.08 + 0.92 * lin) * (1 - 0.098), 9);
  });

  it('picks the tint whose predicted colour is closest (in Lab) to the measured one', () => {
    for (const t of [3, 77, 200]) {
      const target = predictWall(0, t, mats);
      const chosen = chooseTint(0, target, mats);
      const d = (a: readonly number[], b: readonly number[]) =>
        toLab(a).reduce((s, v, k) => s + (v - (toLab(b)[k] as number)) ** 2, 0);
      expect(d(predictWall(0, chosen, mats), target)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('with a seed, picks among candidates within ΔE 3 of the best (deterministic)', () => {
    const target = toLab(predictWall(0, 77, mats));
    const de = (t: number) => {
      const p = toLab(predictWall(0, t, mats));
      return Math.sqrt(0.5 * (p[0] - target[0]) ** 2 + (p[1] - target[1]) ** 2 + (p[2] - target[2]) ** 2);
    };
    for (const seed of [1, 2, 3, 99]) {
      const t = chooseTint(0, predictWall(0, 77, mats), mats, seed);
      expect(de(t)).toBeLessThanOrEqual(3 + 1e-9);
      expect(chooseTint(0, predictWall(0, 77, mats), mats, seed)).toBe(t);
    }
  });

  it('marks curtain walls from the measured glass ratio (offices only)', () => {
    expect(curtainFromGlass(true, 40, 0.5)).toBe(true);
    expect(curtainFromGlass(true, 40, 0.3)).toBe(false);
    expect(curtainFromGlass(true, 120, 0.32)).toBe(true);
    expect(curtainFromGlass(false, 120, 0.9)).toBe(false);
  });
});
